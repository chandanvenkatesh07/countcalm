from datetime import datetime
from pydantic import BaseModel, Field


class TransactionCreate(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    transaction_type: str
    quantity: float = Field(gt=0)
    price_per_share: float = Field(gt=0)
    fees: float = 0
    executed_at: datetime
    notes: str = ""


class TransactionOut(BaseModel):
    id: int
    ticker: str
    transaction_type: str
    quantity: float
    price_per_share: float
    fees: float
    executed_at: datetime
    notes: str


class PortfolioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    initial_cash: float = 0


class TransactionUpdate(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    transaction_type: str
    quantity: float = Field(gt=0)
    price_per_share: float = Field(gt=0)
    fees: float = 0
    executed_at: datetime
    notes: str = ""


class PositionOut(BaseModel):
    ticker: str
    quantity: float
    avg_cost_basis: float
    total_cost: float
    current_price: float
    current_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float


class DashboardSummary(BaseModel):
    total_cost: float
    total_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    benchmark_spy_return_pct: float
    benchmark_qqq_return_pct: float
