from pathlib import Path
import csv
from datetime import datetime


def append_trade(
    symbol: str,
    action: str,
    price: float | None,
    qty: int | None,
    status: str,
    note: str = "",
    path: str = "state/trade_journal.csv",
):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    new_file = not p.exists()
    with p.open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["ts", "symbol", "action", "price", "qty", "status", "note"])
        w.writerow([
            datetime.utcnow().isoformat(timespec="seconds") + "Z",
            symbol,
            action.upper(),
            price if price is not None else "",
            qty if qty is not None else "",
            status.lower(),
            note,
        ])
