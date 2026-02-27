from datetime import date
from sqlalchemy.orm import Session
from app.models import ScreenerResult


# Adapter placeholder: Finviz Elite can replace this function later.
def run_presets(db: Session):
    demo_hits = [
        ("AAPL", "growth_momentum", 78),
        ("MSFT", "value_breakout", 72),
        ("NVDA", "emerging_theme", 88),
        ("XOM", "value_breakout", 64),
        ("LLY", "growth_momentum", 70),
    ]
    today = date.today()
    for ticker, preset, hint in demo_hits:
        db.add(ScreenerResult(ticker=ticker, screener_preset=preset, scan_date=today, score_hint=hint))
    db.commit()
    return len(demo_hits)
