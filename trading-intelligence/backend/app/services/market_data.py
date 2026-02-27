from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select
import yfinance as yf

from app.models import Stock, StockDailyData


def upsert_ohlcv(db: Session, ticker: str, period: str = "6mo"):
    data = yf.Ticker(ticker).history(period=period)
    if data is None or len(data) == 0:
        return 0
    count = 0
    for idx, row in data.iterrows():
        d = idx.date()
        existing = db.scalar(select(StockDailyData).where(StockDailyData.ticker == ticker, StockDailyData.date == d))
        if existing:
            existing.close = float(row.get("Close", 0) or 0)
            existing.volume = float(row.get("Volume", 0) or 0)
        else:
            db.add(StockDailyData(
                ticker=ticker,
                date=d,
                close=float(row.get("Close", 0) or 0),
                volume=float(row.get("Volume", 0) or 0),
            ))
        count += 1

    stock = db.scalar(select(Stock).where(Stock.ticker == ticker))
    if stock:
        stock.updated_at = datetime.utcnow()
    db.commit()
    return count
