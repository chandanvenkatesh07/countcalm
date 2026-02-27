from sqlalchemy.orm import Session
from sqlalchemy import select
import pandas as pd

from app.models import StockDailyData


def compute_indicators(db: Session, ticker: str):
    rows = db.scalars(select(StockDailyData).where(StockDailyData.ticker == ticker).order_by(StockDailyData.date.asc())).all()
    if len(rows) < 30:
        return
    df = pd.DataFrame([{"i": i, "close": float(r.close), "volume": float(r.volume)} for i, r in enumerate(rows)])
    df["sma20"] = df["close"].rolling(20).mean()
    df["sma50"] = df["close"].rolling(50).mean()

    delta = df["close"].diff()
    up = delta.clip(lower=0).rolling(14).mean()
    down = (-delta.clip(upper=0)).rolling(14).mean()
    rs = up / down.replace(0, 1e-9)
    df["rsi"] = 100 - (100 / (1 + rs))

    ema12 = df["close"].ewm(span=12, adjust=False).mean()
    ema26 = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"] = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["vol_ratio"] = df["volume"] / df["volume"].rolling(20).mean()

    for i, row in enumerate(rows):
        row.sma_20 = float(df.iloc[i]["sma20"]) if pd.notna(df.iloc[i]["sma20"]) else 0
        row.sma_50 = float(df.iloc[i]["sma50"]) if pd.notna(df.iloc[i]["sma50"]) else 0
        row.rsi_14 = float(df.iloc[i]["rsi"]) if pd.notna(df.iloc[i]["rsi"]) else 0
        row.macd_line = float(df.iloc[i]["macd"]) if pd.notna(df.iloc[i]["macd"]) else 0
        row.macd_signal = float(df.iloc[i]["macd_signal"]) if pd.notna(df.iloc[i]["macd_signal"]) else 0
        row.volume_ratio = float(df.iloc[i]["vol_ratio"]) if pd.notna(df.iloc[i]["vol_ratio"]) else 1

    db.commit()
