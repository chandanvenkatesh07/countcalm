from datetime import datetime, date
from sqlalchemy import String, DateTime, Numeric, Integer, ForeignKey, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    initial_cash: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="portfolio")


class Stock(Base):
    __tablename__ = "stocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticker: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    company_name: Mapped[str] = mapped_column(String(255), default="")
    sector: Mapped[str] = mapped_column(String(100), default="Unknown")
    last_close: Mapped[float] = mapped_column(Numeric(12, 4), default=0)
    last_close_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    transactions = relationship("Transaction", back_populates="stock")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"), index=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stocks.id"), index=True)
    transaction_type: Mapped[str] = mapped_column(String(10))  # BUY/SELL
    quantity: Mapped[float] = mapped_column(Numeric(12, 6))
    price_per_share: Mapped[float] = mapped_column(Numeric(12, 4))
    fees: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    executed_at: Mapped[datetime] = mapped_column(DateTime)
    notes: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    portfolio = relationship("Portfolio", back_populates="transactions")
    stock = relationship("Stock", back_populates="transactions")


class DeletedTransaction(Base):
    __tablename__ = "deleted_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    original_transaction_id: Mapped[int] = mapped_column(Integer, index=True)
    portfolio_id: Mapped[int] = mapped_column(Integer, index=True)
    stock_id: Mapped[int] = mapped_column(Integer, index=True)
    transaction_type: Mapped[str] = mapped_column(String(10))
    quantity: Mapped[float] = mapped_column(Numeric(12, 6))
    price_per_share: Mapped[float] = mapped_column(Numeric(12, 4))
    fees: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    executed_at: Mapped[datetime] = mapped_column(DateTime)
    notes: Mapped[str] = mapped_column(String(500), default="")
    deleted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    action: Mapped[str] = mapped_column(String(50), index=True)
    detail: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"
    __table_args__ = (UniqueConstraint("portfolio_id", "snapshot_date", name="uq_snapshot"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"), index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, index=True)
    total_value: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    daily_pnl: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
