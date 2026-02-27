from datetime import datetime, date
from sqlalchemy import String, Date, DateTime, Boolean, Numeric, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class Stock(Base):
    __tablename__ = "stocks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    company_name: Mapped[str] = mapped_column(String(200), default="")
    sector: Mapped[str] = mapped_column(String(50), default="Unknown")
    market_cap: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    avg_volume: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    is_actively_tracked: Mapped[bool] = mapped_column(Boolean, default=True)
    added_source: Mapped[str] = mapped_column(String(50), default="seed")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class StockDailyData(Base):
    __tablename__ = "stock_daily_data"
    __table_args__ = (UniqueConstraint("ticker", "date", name="uq_ticker_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(10), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    close: Mapped[float] = mapped_column(Numeric(12, 4))
    volume: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    sma_20: Mapped[float] = mapped_column(Numeric(12, 4), default=0)
    sma_50: Mapped[float] = mapped_column(Numeric(12, 4), default=0)
    rsi_14: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    macd_line: Mapped[float] = mapped_column(Numeric(10, 4), default=0)
    macd_signal: Mapped[float] = mapped_column(Numeric(10, 4), default=0)
    volume_ratio: Mapped[float] = mapped_column(Numeric(8, 2), default=1)


class ScreenerResult(Base):
    __tablename__ = "screener_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(10), index=True)
    screener_preset: Mapped[str] = mapped_column(String(50), index=True)
    scan_date: Mapped[date] = mapped_column(Date, index=True)
    score_hint: Mapped[float] = mapped_column(Numeric(8, 2), default=0)


class Signal(Base):
    __tablename__ = "signals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(10), index=True)
    signal_type: Mapped[str] = mapped_column(String(20), index=True)
    composite_score: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    technical_score: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    reasoning: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
