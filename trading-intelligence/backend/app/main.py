from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .db import Base, engine, get_db, SessionLocal
from .config import settings
from .models import Stock, Signal, StockDailyData
from .services.market_data import upsert_ohlcv
from .services.technical_engine import compute_indicators
from .services.signal_generator import generate_signal_for_ticker
from .services.finviz_screener import run_presets

scheduler = BackgroundScheduler(timezone="America/New_York")
SEED_UNIVERSE = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "XOM", "LLY", "AVGO", "META", "TSM"]


def ensure_seed(db: Session):
    for ticker in SEED_UNIVERSE:
        exists = db.scalar(select(Stock).where(Stock.ticker == ticker))
        if not exists:
            db.add(Stock(ticker=ticker, company_name=ticker, added_source="seed"))
    db.commit()


def run_daily_scan():
    db = SessionLocal()
    try:
        run_presets(db)
        stocks = db.scalars(select(Stock).where(Stock.is_actively_tracked == True)).all()
        for s in stocks:
            upsert_ohlcv(db, s.ticker)
            compute_indicators(db, s.ticker)
            generate_signal_for_ticker(db, s.ticker)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    ensure_seed(db)
    db.close()

    if not scheduler.running:
        scheduler.add_job(run_daily_scan, CronTrigger(hour=18, minute=0))
        scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title=settings.app_name, lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.get("/api/v1/universe")
def universe(db: Session = Depends(get_db)):
    rows = db.scalars(select(Stock).order_by(Stock.ticker.asc())).all()
    return {"status": "success", "data": [{"ticker": r.ticker, "source": r.added_source} for r in rows]}


@app.post("/api/v1/universe/add")
def add_ticker(ticker: str = Query(...), source: str = Query("manual"), db: Session = Depends(get_db)):
    t = ticker.upper().strip()
    exists = db.scalar(select(Stock).where(Stock.ticker == t))
    if not exists:
        db.add(Stock(ticker=t, company_name=t, added_source=source))
        db.commit()
    return {"status": "success", "ticker": t}


@app.post("/api/v1/scan/run")
def scan_run(db: Session = Depends(get_db)):
    run_presets(db)
    stocks = db.scalars(select(Stock).where(Stock.is_actively_tracked == True)).all()
    results = []
    for s in stocks:
        upsert_ohlcv(db, s.ticker)
        compute_indicators(db, s.ticker)
        sig = generate_signal_for_ticker(db, s.ticker)
        if sig:
            results.append(sig)
    return {"status": "success", "processed": len(stocks), "signals": results}


@app.get("/api/v1/signals")
def signals(limit: int = Query(25), db: Session = Depends(get_db)):
    rows = db.scalars(select(Signal).order_by(Signal.created_at.desc()).limit(max(1, min(limit, 200)))).all()
    return {"status": "success", "data": [
        {
            "id": r.id,
            "ticker": r.ticker,
            "signal_type": r.signal_type,
            "composite_score": float(r.composite_score),
            "reasoning": r.reasoning,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]}


@app.get("/api/v1/research/{ticker}")
def research(ticker: str, db: Session = Depends(get_db)):
    t = ticker.upper().strip()
    latest = db.scalar(select(StockDailyData).where(StockDailyData.ticker == t).order_by(StockDailyData.date.desc()))
    recent_signals = db.scalars(select(Signal).where(Signal.ticker == t).order_by(Signal.created_at.desc()).limit(5)).all()
    if not latest:
        return {"status": "success", "data": {"ticker": t, "message": "No data yet. Run /api/v1/scan/run first."}}
    return {"status": "success", "data": {
        "ticker": t,
        "latest": {
            "date": latest.date.isoformat(),
            "close": float(latest.close),
            "sma20": float(latest.sma_20),
            "sma50": float(latest.sma_50),
            "rsi14": float(latest.rsi_14),
            "macd": float(latest.macd_line),
            "macd_signal": float(latest.macd_signal),
            "volume_ratio": float(latest.volume_ratio),
        },
        "signals": [{"type": s.signal_type, "score": float(s.composite_score), "reasoning": s.reasoning} for s in recent_signals]
    }}
