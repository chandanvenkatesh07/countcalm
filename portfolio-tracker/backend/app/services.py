from datetime import date, datetime
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import select
import yfinance as yf

from .models import Stock, Transaction, Portfolio, PortfolioSnapshot


def get_or_create_stock(db: Session, ticker: str) -> Stock:
    t = ticker.upper().strip()
    stock = db.scalar(select(Stock).where(Stock.ticker == t))
    if stock:
        return stock
    stock = Stock(ticker=t, company_name=t)
    db.add(stock)
    db.flush()
    return stock


def refresh_stock_close(db: Session, stock: Stock):
    try:
        data = yf.Ticker(stock.ticker).history(period="5d")
        if data is not None and len(data) > 0:
            last = data.iloc[-1]
            stock.last_close = float(last["Close"])
            stock.last_close_date = data.index[-1].date()
    except Exception:
        pass


def refresh_all_closes(db: Session):
    stocks = db.scalars(select(Stock)).all()
    for stock in stocks:
        refresh_stock_close(db, stock)
    db.commit()


def compute_positions(db: Session, portfolio_id: int):
    txs = db.scalars(
        select(Transaction).where(Transaction.portfolio_id == portfolio_id).order_by(Transaction.executed_at.asc(), Transaction.id.asc())
    ).all()

    lots = defaultdict(list)
    for tx in txs:
        qty = float(tx.quantity)
        price = float(tx.price_per_share)
        fee = float(tx.fees or 0)
        if tx.transaction_type.upper() == "BUY":
            lots[tx.stock_id].append({"qty": qty, "price": price, "fee": fee})
        elif tx.transaction_type.upper() == "SELL":
            remaining = qty
            while remaining > 0 and lots[tx.stock_id]:
                lot = lots[tx.stock_id][0]
                take = min(remaining, lot["qty"])
                lot["qty"] -= take
                remaining -= take
                if lot["qty"] <= 1e-10:
                    lots[tx.stock_id].pop(0)

    positions = []
    for stock_id, open_lots in lots.items():
        qty = sum(l["qty"] for l in open_lots)
        if qty <= 1e-10:
            continue
        total_cost = sum((l["qty"] * l["price"]) + l["fee"] for l in open_lots)
        avg = total_cost / qty if qty else 0
        stock = db.get(Stock, stock_id)
        price = float(stock.last_close or 0)
        cur_val = qty * price
        pnl = cur_val - total_cost
        pnl_pct = (pnl / total_cost * 100) if total_cost else 0
        positions.append({
            "ticker": stock.ticker,
            "quantity": round(qty, 6),
            "avg_cost_basis": round(avg, 4),
            "total_cost": round(total_cost, 2),
            "current_price": round(price, 4),
            "current_value": round(cur_val, 2),
            "unrealized_pnl": round(pnl, 2),
            "unrealized_pnl_pct": round(pnl_pct, 2),
        })
    return positions


def dashboard_summary(db: Session, portfolio_id: int):
    positions = compute_positions(db, portfolio_id)
    total_cost = sum(p["total_cost"] for p in positions)
    total_value = sum(p["current_value"] for p in positions)
    pnl = total_value - total_cost
    pnl_pct = (pnl / total_cost * 100) if total_cost else 0

    today = date.today()
    start = db.scalar(select(Portfolio).where(Portfolio.id == portfolio_id))
    base = float(start.initial_cash or 0)

    def bench_ret(ticker: str):
        try:
            h = yf.Ticker(ticker).history(period="1y")
            if len(h) < 2:
                return 0.0
            return round((float(h.iloc[-1]["Close"]) / float(h.iloc[0]["Close"]) - 1) * 100, 2)
        except Exception:
            return 0.0

    return {
        "total_cost": round(total_cost + base, 2),
        "total_value": round(total_value + base, 2),
        "unrealized_pnl": round(pnl, 2),
        "unrealized_pnl_pct": round(pnl_pct, 2),
        "benchmark_spy_return_pct": bench_ret("SPY"),
        "benchmark_qqq_return_pct": bench_ret("QQQ"),
    }


def create_daily_snapshot(db: Session, portfolio_id: int):
    summary = dashboard_summary(db, portfolio_id)
    today = date.today()
    prev = db.scalar(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.portfolio_id == portfolio_id)
        .order_by(PortfolioSnapshot.snapshot_date.desc())
    )
    daily_pnl = summary["total_value"] - (float(prev.total_value) if prev else summary["total_value"])
    existing = db.scalar(
        select(PortfolioSnapshot).where(
            PortfolioSnapshot.portfolio_id == portfolio_id,
            PortfolioSnapshot.snapshot_date == today,
        )
    )
    if existing:
        existing.total_value = summary["total_value"]
        existing.total_cost = summary["total_cost"]
        existing.daily_pnl = round(daily_pnl, 2)
    else:
        db.add(PortfolioSnapshot(
            portfolio_id=portfolio_id,
            snapshot_date=today,
            total_value=summary["total_value"],
            total_cost=summary["total_cost"],
            daily_pnl=round(daily_pnl, 2),
        ))
    db.commit()
