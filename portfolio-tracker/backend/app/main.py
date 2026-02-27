from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import settings
from .db import Base, engine, get_db, SessionLocal
from .models import Portfolio, Transaction
from .schemas import TransactionCreate, TransactionOut
from .services import get_or_create_stock, refresh_all_closes, compute_positions, dashboard_summary, create_daily_snapshot

scheduler = BackgroundScheduler(timezone="America/New_York")


def ensure_seed(db: Session):
    p = db.scalar(select(Portfolio).where(Portfolio.name == "Main"))
    if not p:
        db.add(Portfolio(name="Main", initial_cash=0))
        db.commit()


def end_of_day_jobs():
    db = SessionLocal()
    try:
        refresh_all_closes(db)
        p = db.scalar(select(Portfolio).where(Portfolio.name == "Main"))
        if p:
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


@app.get("/api/v1/portfolio")
def get_portfolio(db: Session = Depends(get_db)):
    p = db.scalar(select(Portfolio).where(Portfolio.name == "Main"))
    return {"id": p.id, "name": p.name, "initial_cash": float(p.initial_cash)}


@app.post("/api/v1/transactions")
def add_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    tx_type = payload.transaction_type.upper().strip()
    if tx_type not in {"BUY", "SELL"}:
        raise HTTPException(status_code=400, detail="transaction_type must be BUY or SELL")
    p = db.scalar(select(Portfolio).where(Portfolio.name == "Main"))
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


@app.get("/api/v1/transactions")
def list_transactions(db: Session = Depends(get_db)):
    p = db.scalar(select(Portfolio).where(Portfolio.name == "Main"))
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
def positions(db: Session = Depends(get_db)):
    p = db.scalar(select(Portfolio).where(Portfolio.name == "Main"))
    refresh_all_closes(db)
    return {"status": "success", "data": compute_positions(db, p.id)}


@app.get("/api/v1/dashboard")
def dashboard(db: Session = Depends(get_db)):
    p = db.scalar(select(Portfolio).where(Portfolio.name == "Main"))
    refresh_all_closes(db)
    return {"status": "success", "data": dashboard_summary(db, p.id)}


@app.post("/api/v1/snapshot/run")
def run_snapshot(db: Session = Depends(get_db)):
    p = db.scalar(select(Portfolio).where(Portfolio.name == "Main"))
    create_daily_snapshot(db, p.id)
    return {"status": "success"}
