# US Equities Sector-Strength Trading System (v0)

This is a production-oriented starter system for:
- Universe: US listed equities/ETFs only (no crypto)
- Signal style: sector-strength + trend + risk filter
- Charting/discretion layer: TradingView
- Alerts: Telegram (buy/sell + daily summary)
- Goal: robust process first, returns second

## Important reality check
Targeting **100% yearly return** is very aggressive and not reliable. We can optimize for high risk-adjusted return and strict risk controls, then evaluate if performance supports scaling.

## System architecture
1. **Data + ranking engine** (`src/sector_strength.py`)
   - Pulls daily data (yfinance for now)
   - Ranks sectors by momentum and relative strength
2. **Strategy engine** (`src/strategy.py`)
   - Generates BUY/SELL/HOLD based on sector trend + stock trend + stop rules
3. **Portfolio + risk** (`src/portfolio_tracker.py`)
   - Position sizing, max risk per trade, exposure limits, drawdown checks
4. **Execution adapters**
   - `src/broker_paper.py` (paper-mode placeholder, later Alpaca/IBKR)
   - TradingView webhook bridge (`src/tradingview_webhook_server.py`)
5. **Notifications** (`src/notifier_telegram.py`)
   - Sends trade alerts and daily portfolio updates

## Quick start
```bash
cd trading-system
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config.example.yaml config.yaml
```

Then edit `config.yaml`:
- `telegram.bot_token`
- `telegram.chat_id`
- risk parameters
- universe + sector ETFs

Run daily signal generation:
```bash
python -m src.run_daily
```

Run TradingView webhook listener:
```bash
uvicorn src.tradingview_webhook_server:app --host 0.0.0.0 --port 8080
```

## Suggested live workflow (your setup: alerts + manual execution)
- Use this system for rule-based candidates + risk checks
- Use TradingView for final chart validation
- Send webhook from TradingView alert to this service
- Auto-send Telegram action message (BUY/SELL/WAIT)
- You manually execute in Robinhood (no auto-trading)
- Log whether each signal was executed or skipped

Manual trade logging:
```bash
python -m src.log_trade --symbol NVDA --action BUY --price 122.5 --qty 10 --status executed --note "took alert"
python -m src.log_trade --symbol AAPL --action BUY --status skipped --note "already overexposed"
```

## Next upgrades (after validation)
- Real broker integration (Alpaca/IBKR)
- Intraday scanner
- Flash-news filter (Grok API optional)
- Walk-forward backtests + Monte Carlo
- Exposure throttling by market regime
