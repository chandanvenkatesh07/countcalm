import yfinance as yf
import pandas as pd


def momentum_score(symbol: str, period_days: int = 90) -> float:
    hist = yf.download(symbol, period=f"{period_days + 30}d", interval="1d", progress=False)
    if hist.empty or len(hist) < period_days:
        return float("nan")
    px = hist["Close"].dropna()
    if len(px) < period_days:
        return float("nan")
    return float((px.iloc[-1] / px.iloc[-period_days]) - 1)


def rank_sectors(sector_etfs: list[str]) -> pd.DataFrame:
    rows = []
    for etf in sector_etfs:
        m90 = momentum_score(etf, 90)
        m30 = momentum_score(etf, 30)
        combo = (0.65 * m90) + (0.35 * m30)
        rows.append({"symbol": etf, "mom_90": m90, "mom_30": m30, "score": combo})
    df = pd.DataFrame(rows).dropna().sort_values("score", ascending=False)
    return df
