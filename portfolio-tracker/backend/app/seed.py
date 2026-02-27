from datetime import datetime, timedelta
from sqlalchemy import select

from .db import Base, engine, SessionLocal
from .models import Portfolio, Transaction
from .services import get_or_create_stock


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    p = db.scalar(select(Portfolio).where(Portfolio.name == "Personal"))
    if not p:
        p = Portfolio(name="Personal", initial_cash=10000)
        db.add(p)
        db.commit()
        db.refresh(p)

    if db.scalar(select(Transaction.id).limit(1)):
        print("Seed exists, skipping")
        db.close()
        return

    now = datetime.utcnow()
    sample = [
        ("AAPL", "BUY", 10, 180.0, 0, now - timedelta(days=20), "seed"),
        ("MSFT", "BUY", 5, 390.0, 0, now - timedelta(days=18), "seed"),
        ("NVDA", "BUY", 2, 800.0, 0, now - timedelta(days=15), "seed"),
        ("AAPL", "SELL", 2, 190.0, 0, now - timedelta(days=10), "seed trim"),
    ]
    for ticker, ttype, qty, pps, fees, when, notes in sample:
        s = get_or_create_stock(db, ticker)
        db.add(Transaction(
            portfolio_id=p.id,
            stock_id=s.id,
            transaction_type=ttype,
            quantity=qty,
            price_per_share=pps,
            fees=fees,
            executed_at=when,
            notes=notes,
        ))
    db.commit()
    db.close()
    print("Seed complete")


if __name__ == "__main__":
    run()
