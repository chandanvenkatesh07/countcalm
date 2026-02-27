from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models import StockDailyData, Signal


def generate_signal_for_ticker(db: Session, ticker: str):
    row = db.scalar(select(StockDailyData).where(StockDailyData.ticker == ticker).order_by(StockDailyData.date.desc()))
    if not row:
        return None

    score = 0
    reasons = []
    close = float(row.close or 0)
    sma20 = float(row.sma_20 or 0)
    sma50 = float(row.sma_50 or 0)
    rsi = float(row.rsi_14 or 50)
    macd = float(row.macd_line or 0)
    macd_sig = float(row.macd_signal or 0)
    vol_ratio = float(row.volume_ratio or 1)

    if close > sma20 > 0:
        score += 20
        reasons.append("Price above SMA20")
    if close > sma50 > 0:
        score += 20
        reasons.append("Price above SMA50")
    if 40 <= rsi <= 65:
        score += 20
        reasons.append("RSI in bullish zone")
    if macd > macd_sig:
        score += 20
        reasons.append("MACD bullish crossover")
    if vol_ratio > 1.2:
        score += 20
        reasons.append("Volume confirmation")

    signal_type = "WATCH"
    if score >= 80:
        signal_type = "STRONG_BUY"
    elif score >= 65:
        signal_type = "BUY"
    elif score <= 30:
        signal_type = "SELL"

    db.add(Signal(
        ticker=ticker,
        signal_type=signal_type,
        composite_score=score,
        technical_score=score,
        reasoning=", ".join(reasons) if reasons else "No strong setup",
    ))
    db.commit()
    return {"ticker": ticker, "signal_type": signal_type, "score": score}
