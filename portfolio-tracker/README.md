# Portfolio Tracker MVP

Single-user local portfolio tracker (FIFO) with dark desktop UI.

## Features in this MVP
- Add BUY/SELL trades
- Full edit modal (ticker, type, qty, price, fees, datetime, notes)
- Delete + undo (soft-delete archive)
- Multiple portfolio groups (e.g., 401K / Personal / ESPP) with rename/delete
- FIFO position and cost-basis computation
- Dashboard with selected + combined totals/P&L
- 30-day snapshot mini trend chart
- Analytics section with period filters (1W/1M/3M/6M/1Y/ALL), P&L curve, allocation bars, top gainers/losers
- Top comparative charts for all portfolio groups: per-symbol colored lines + white overall portfolio overlay
- Last close prices from Yahoo Finance (no intraday stream)
- SPY/QQQ 1Y benchmark comparison
- End-of-day snapshot scheduler (4:05 PM ET)
- Activity log for create/edit/delete actions
- Docker local stack (frontend + backend + postgres)
- Seed data included

## Run
```bash
cd portfolio-tracker
docker compose up --build
```

Open: http://localhost:3000

## Seed demo transactions
```bash
docker compose exec backend python -m app.seed
```

## API quick list
- `GET /api/v1/dashboard`
- `GET /api/v1/positions`
- `GET /api/v1/transactions`
- `POST /api/v1/transactions`
- `POST /api/v1/snapshot/run`

## Notes
- Pricing is based on latest stored close from Yahoo.
- Validation blocks selling more shares than held.
- Minimal implementation intentionally optimized for your requested MVP target: add trades and see P&L.
