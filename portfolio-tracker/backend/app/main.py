from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import settings
from .db import Base, engine, get_db, SessionLocal
from .models import Portfolio, Transaction
from .schemas import TransactionCreate, PortfolioCreate, TransactionUpdate
from .services import get_or_create_stock, refresh_all_closes, compute_positions, dashboard_summary, create_daily_snapshot

scheduler = BackgroundScheduler(timezone="America/New_York")


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
    exists = db.scalar(select(Portfolio).where(Portfolio.name == payload.name.strip()))
    if exists:
        raise HTTPException(status_code=400, detail="Portfolio already exists")
    p = Portfolio(name=payload.name.strip(), initial_cash=payload.initial_cash)
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"status": "success", "data": {"id": p.id, "name": p.name}}


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
    db.commit()
    return {"status": "success"}


@app.delete("/api/v1/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
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


@app.post("/api/v1/snapshot/run")
def run_snapshot(portfolio_id: int = Query(default=None), db: Session = Depends(get_db)):
    p = get_portfolio_or_404(db, portfolio_id)
    create_daily_snapshot(db, p.id)
    return {"status": "success"}
