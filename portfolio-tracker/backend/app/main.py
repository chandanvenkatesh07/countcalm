from contextlib import asynccontextmanager
from datetime import datetime, timedelta, date

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import settings
from .db import Base, engine, get_db, SessionLocal
from .models import Portfolio, Transaction, DeletedTransaction, ActivityLog, PortfolioSnapshot
from .schemas import TransactionCreate, PortfolioCreate, TransactionUpdate
from .services import get_or_create_stock, refresh_all_closes, compute_positions, dashboard_summary, create_daily_snapshot

scheduler = BackgroundScheduler(timezone="America/New_York")


def log_action(db: Session, action: str, detail: str):
    db.add(ActivityLog(action=action, detail=detail[:500]))


def ensure_seed(db: Session):
    p = db.scalar(select(Portfolio).where(Portfolio.name == "Personal"))
    if not p:
        db.add(Portfolio(name="Personal", initial_cash=0))
        db.commit()


def get_portfolio_or_404(db: Session, portfolio_id: int | None):
    if portfolio_id is None:
        p = db.scalar(select(Portfolio).order_by(Portfolio.id.asc()))
    else:
        p = db.get(Portfolio, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return p


def end_of_day_jobs():
    db = SessionLocal()
    try:
        refresh_all_closes(db)
        portfolios = db.scalars(select(Portfolio)).all()
        for p in portfolios:
            create_daily_snapshot(db, p.id)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    ensure_seed(db)
    db.close()

    if not scheduler.running:
        scheduler.add_job(end_of_day_jobs, CronTrigger(hour=16, minute=5))
        scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.get("/api/v1/portfolios")
def list_portfolios(db: Session = Depends(get_db)):
    rows = db.scalars(select(Portfolio).order_by(Portfolio.id.asc())).all()
    return {"status": "success", "data": [{"id": p.id, "name": p.name, "initial_cash": float(p.initial_cash)} for p in rows]}


@app.post("/api/v1/portfolios")
def create_portfolio(payload: PortfolioCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    exists = db.scalar(select(Portfolio).where(Portfolio.name == name))
    if exists:
        raise HTTPException(status_code=400, detail="Portfolio already exists")
    p = Portfolio(name=name, initial_cash=payload.initial_cash)
    db.add(p)
    log_action(db, "portfolio.create", f"Created portfolio '{name}'")
    db.commit()
    db.refresh(p)
    return {"status": "success", "data": {"id": p.id, "name": p.name}}


@app.put("/api/v1/portfolios/{portfolio_id}")
def rename_portfolio(portfolio_id: int, payload: PortfolioCreate, db: Session = Depends(get_db)):
    p = db.get(Portfolio, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    name = payload.name.strip()
    other = db.scalar(select(Portfolio).where(Portfolio.name == name, Portfolio.id != portfolio_id))
    if other:
        raise HTTPException(status_code=400, detail="Portfolio name already in use")
    old = p.name
    p.name = name
    p.initial_cash = payload.initial_cash
    log_action(db, "portfolio.rename", f"Renamed '{old}' to '{name}'")
    db.commit()
    return {"status": "success"}


@app.delete("/api/v1/portfolios/{portfolio_id}")
def delete_portfolio(portfolio_id: int, force: bool = Query(False), db: Session = Depends(get_db)):
    p = db.get(Portfolio, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    total = db.scalar(select(Transaction).where(Transaction.portfolio_id == p.id).limit(1))
    all_count = len(db.scalars(select(Portfolio.id)).all())
    if all_count <= 1:
        raise HTTPException(status_code=400, detail="At least one portfolio must remain")
    if total and not force:
        raise HTTPException(status_code=400, detail="Portfolio has transactions. Retry with force=true")
    if total:
        txs = db.scalars(select(Transaction).where(Transaction.portfolio_id == p.id)).all()
        for tx in txs:
            db.add(DeletedTransaction(
                original_transaction_id=tx.id,
                portfolio_id=tx.portfolio_id,
                stock_id=tx.stock_id,
                transaction_type=tx.transaction_type,
                quantity=tx.quantity,
                price_per_share=tx.price_per_share,
                fees=tx.fees,
                executed_at=tx.executed_at,
                notes=tx.notes,
            ))
            db.delete(tx)
    log_action(db, "portfolio.delete", f"Deleted portfolio '{p.name}'")
    db.delete(p)
    db.commit()
    return {"status": "success"}


@app.post("/api/v1/transactions")
def add_transaction(payload: TransactionCreate, portfolio_id: int = Query(default=None), db: Session = Depends(get_db)):
    tx_type = payload.transaction_type.upper().strip()
    if tx_type not in {"BUY", "SELL"}:
        raise HTTPException(status_code=400, detail="transaction_type must be BUY or SELL")
    p = get_portfolio_or_404(db, portfolio_id)
    stock = get_or_create_stock(db, payload.ticker)

    if tx_type == "SELL":
        positions = {x["ticker"]: x for x in compute_positions(db, p.id)}
        held = positions.get(stock.ticker, {}).get("quantity", 0)
        if payload.quantity > held:
            raise HTTPException(status_code=400, detail=f"Cannot sell {payload.quantity}; held={held}")

    tx = Transaction(
        portfolio_id=p.id,
        stock_id=stock.id,
        transaction_type=tx_type,
        quantity=payload.quantity,
        price_per_share=payload.price_per_share,
        fees=payload.fees,
        executed_at=payload.executed_at,
        notes=payload.notes,
    )
    db.add(tx)
    log_action(db, "transaction.create", f"{tx_type} {payload.quantity} {stock.ticker} in {p.name}")
    db.commit()
    db.refresh(tx)
    return {"status": "success", "data": {"id": tx.id}}


@app.put("/api/v1/transactions/{tx_id}")
def edit_transaction(tx_id: int, payload: TransactionUpdate, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    tx_type = payload.transaction_type.upper().strip()
    if tx_type not in {"BUY", "SELL"}:
        raise HTTPException(status_code=400, detail="transaction_type must be BUY or SELL")

    stock = get_or_create_stock(db, payload.ticker)
    tx.stock_id = stock.id
    tx.transaction_type = tx_type
    tx.quantity = payload.quantity
    tx.price_per_share = payload.price_per_share
    tx.fees = payload.fees
    tx.executed_at = payload.executed_at
    tx.notes = payload.notes
    log_action(db, "transaction.update", f"Updated tx #{tx_id}")
    db.commit()
    return {"status": "success"}


@app.delete("/api/v1/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    archive = DeletedTransaction(
        original_transaction_id=tx.id,
        portfolio_id=tx.portfolio_id,
        stock_id=tx.stock_id,
        transaction_type=tx.transaction_type,
        quantity=tx.quantity,
        price_per_share=tx.price_per_share,
        fees=tx.fees,
        executed_at=tx.executed_at,
        notes=tx.notes,
    )
    db.add(archive)
    db.delete(tx)
    log_action(db, "transaction.delete", f"Deleted tx #{tx_id}")
    db.commit()
    db.refresh(archive)
    return {"status": "success", "data": {"undo_id": archive.id}}


@app.post("/api/v1/transactions/undo-delete/{undo_id}")
def undo_delete_transaction(undo_id: int, db: Session = Depends(get_db)):
    archived = db.get(DeletedTransaction, undo_id)
    if not archived:
        raise HTTPException(status_code=404, detail="Undo record not found")
    tx = Transaction(
        portfolio_id=archived.portfolio_id,
        stock_id=archived.stock_id,
        transaction_type=archived.transaction_type,
        quantity=archived.quantity,
        price_per_share=archived.price_per_share,
        fees=archived.fees,
        executed_at=archived.executed_at,
        notes=archived.notes,
    )
    db.add(tx)
    db.delete(archived)
    log_action(db, "transaction.undo", f"Restored tx from undo #{undo_id}")
    db.commit()
    return {"status": "success"}


@app.get("/api/v1/transactions")
def list_transactions(portfolio_id: int = Query(default=None), db: Session = Depends(get_db)):
    p = get_portfolio_or_404(db, portfolio_id)
    txs = db.scalars(
        select(Transaction).where(Transaction.portfolio_id == p.id).order_by(Transaction.executed_at.desc(), Transaction.id.desc())
    ).all()
    out = [
        {
            "id": t.id,
            "ticker": t.stock.ticker,
            "transaction_type": t.transaction_type,
            "quantity": float(t.quantity),
            "price_per_share": float(t.price_per_share),
            "fees": float(t.fees or 0),
            "executed_at": t.executed_at,
            "notes": t.notes,
        }
        for t in txs
    ]
    return {"status": "success", "data": out}


@app.get("/api/v1/positions")
def positions(portfolio_id: int = Query(default=None), db: Session = Depends(get_db)):
    p = get_portfolio_or_404(db, portfolio_id)
    refresh_all_closes(db)
    return {"status": "success", "data": compute_positions(db, p.id)}


@app.get("/api/v1/dashboard")
def dashboard(portfolio_id: int = Query(default=None), db: Session = Depends(get_db)):
    p = get_portfolio_or_404(db, portfolio_id)
    refresh_all_closes(db)
    return {"status": "success", "data": dashboard_summary(db, p.id)}


@app.get("/api/v1/dashboard/combined")
def dashboard_combined(db: Session = Depends(get_db)):
    refresh_all_closes(db)
    portfolios = db.scalars(select(Portfolio).order_by(Portfolio.id.asc())).all()
    by_portfolio = []
    total_cost = 0.0
    total_value = 0.0
    total_pnl = 0.0
    for p in portfolios:
        d = dashboard_summary(db, p.id)
        by_portfolio.append({"id": p.id, "name": p.name, **d})
        total_cost += float(d["total_cost"])
        total_value += float(d["total_value"])
        total_pnl += float(d["unrealized_pnl"])
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost else 0
    return {
        "status": "success",
        "data": {
            "total_cost": round(total_cost, 2),
            "total_value": round(total_value, 2),
            "unrealized_pnl": round(total_pnl, 2),
            "unrealized_pnl_pct": round(total_pnl_pct, 2),
            "by_portfolio": by_portfolio,
        },
    }


@app.get("/api/v1/snapshots")
def snapshots(portfolio_id: int = Query(default=None), days: int = Query(30), db: Session = Depends(get_db)):
    p = get_portfolio_or_404(db, portfolio_id)
    rows = db.scalars(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.portfolio_id == p.id)
        .order_by(PortfolioSnapshot.snapshot_date.desc())
        .limit(max(1, min(days, 365)))
    ).all()
    rows = list(reversed(rows))
    return {
        "status": "success",
        "data": [
            {
                "date": r.snapshot_date.isoformat(),
                "total_value": float(r.total_value),
                "daily_pnl": float(r.daily_pnl),
            }
            for r in rows
        ],
    }


@app.get("/api/v1/activity")
def activity(limit: int = Query(20), db: Session = Depends(get_db)):
    rows = db.scalars(select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(max(1, min(limit, 100)))).all()
    return {
        "status": "success",
        "data": [{"id": r.id, "action": r.action, "detail": r.detail, "created_at": r.created_at.isoformat()} for r in rows],
    }


@app.get("/api/v1/analytics")
def analytics(portfolio_id: int = Query(default=None), period: str = Query("1M"), db: Session = Depends(get_db)):
    p = get_portfolio_or_404(db, portfolio_id)
    refresh_all_closes(db)

    period_map = {"1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "ALL": 3650}
    days = period_map.get(period.upper(), 30)
    cutoff = date.today() - timedelta(days=days)

    snap_rows = db.scalars(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.portfolio_id == p.id, PortfolioSnapshot.snapshot_date >= cutoff)
        .order_by(PortfolioSnapshot.snapshot_date.asc())
    ).all()

    positions_data = compute_positions(db, p.id)
    total_value = sum(float(x["current_value"]) for x in positions_data) or 1.0

    allocation = [
        {
            "ticker": x["ticker"],
            "value": float(x["current_value"]),
            "weight_pct": round(float(x["current_value"]) / total_value * 100, 2),
        }
        for x in sorted(positions_data, key=lambda z: z["current_value"], reverse=True)
    ]

    gainers = sorted(positions_data, key=lambda z: z["unrealized_pnl"], reverse=True)[:5]
    losers = sorted(positions_data, key=lambda z: z["unrealized_pnl"])[:5]

    series = [{"date": s.snapshot_date.isoformat(), "value": float(s.total_value)} for s in snap_rows]
    if not series and positions_data:
        series = [{"date": date.today().isoformat(), "value": sum(float(x["current_value"]) for x in positions_data)}]

    return {
        "status": "success",
        "data": {
            "period": period.upper(),
            "series": series,
            "allocation": allocation,
            "top_gainers": gainers,
            "top_losers": losers,
        },
    }


@app.post("/api/v1/snapshot/run")
def run_snapshot(portfolio_id: int = Query(default=None), db: Session = Depends(get_db)):
    p = get_portfolio_or_404(db, portfolio_id)
    create_daily_snapshot(db, p.id)
    return {"status": "success"}
