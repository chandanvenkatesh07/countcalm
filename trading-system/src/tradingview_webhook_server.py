from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from src.config import load_config
from src.notifier_telegram import send_telegram

app = FastAPI(title="TradingView Webhook Bridge")


class TVAlert(BaseModel):
    secret: str
    symbol: str
    action: str  # BUY / SELL / EXIT / ALERT
    price: float | None = None
    note: str | None = None


@app.post("/tv-alert")
def tv_alert(payload: TVAlert):
    cfg = load_config("config.yaml")
    expected = cfg.get("tradingview", {}).get("webhook_secret")
    if payload.secret != expected:
        raise HTTPException(status_code=401, detail="invalid secret")

    text = (
        f"TV ALERT\\n"
        f"Symbol: {payload.symbol}\\n"
        f"Action: {payload.action}\\n"
        f"Price: {payload.price if payload.price else 'n/a'}\\n"
        f"Note: {payload.note or 'n/a'}"
    )
    send_telegram(cfg["telegram"]["bot_token"], cfg["telegram"]["chat_id"], text)
    return {"ok": True}
