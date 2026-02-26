import yfinance as yf
import pandas as pd


def trend_ok(symbol: str, lookback: str = "6mo") -> bool:
    hist = yf.download(symbol, period=lookback, interval="1d", progress=False)
    if hist.empty:
        return False
    close = hist["Close"].dropna()
    if len(close) < 60:
        return False
    ma50 = close.rolling(50).mean().iloc[-1]
    ma20 = close.rolling(20).mean().iloc[-1]
    last = close.iloc[-1]
    return bool(last > ma50 and ma20 > ma50)


def generate_signal(symbol: str, sector_is_strong: bool) -> str:
    if not sector_is_strong:
        return "HOLD"
    return "BUY" if trend_ok(symbol) else "HOLD"


def stop_signal(entry_price: float, current_price: float, stop_loss_pct: float) -> bool:
    stop = entry_price * (1 - stop_loss_pct / 100)
    return current_price <= stop
