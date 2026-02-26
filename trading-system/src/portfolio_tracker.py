from dataclasses import dataclass, asdict
from pathlib import Path
import json


@dataclass
class Position:
    symbol: str
    qty: int
    entry_price: float


class Portfolio:
    def __init__(self, state_path: str = "state/portfolio.json", starting_capital: float = 10000):
        self.state_path = Path(state_path)
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.cash = starting_capital
        self.positions: dict[str, Position] = {}
        if self.state_path.exists():
            self._load()

    def _load(self):
        data = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.cash = data["cash"]
        self.positions = {k: Position(**v) for k, v in data["positions"].items()}

    def save(self):
        data = {
            "cash": self.cash,
            "positions": {k: asdict(v) for k, v in self.positions.items()},
        }
        self.state_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def buy(self, symbol: str, price: float, qty: int):
        cost = price * qty
        if cost > self.cash:
            raise ValueError("Insufficient cash")
        self.cash -= cost
        self.positions[symbol] = Position(symbol=symbol, qty=qty, entry_price=price)
        self.save()

    def sell(self, symbol: str, price: float):
        pos = self.positions.get(symbol)
        if not pos:
            return
        self.cash += price * pos.qty
        del self.positions[symbol]
        self.save()
