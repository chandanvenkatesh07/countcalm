# Trading Intelligence System (Research MVP)

Built with best-practice defaults for fast delivery:
- FastAPI + PostgreSQL
- APScheduler (simpler than Celery for phase 1)
- yfinance market data
- Finviz adapter stub (ready for Elite integration)
- Technical indicators: SMA20/50, RSI14, MACD, volume ratio
- Composite signal output: STRONG_BUY / BUY / WATCH / SELL

## Run
```bash
cd trading-intelligence
docker compose up --build
```

API: `http://localhost:8100`

## First scan
```bash
curl -X POST http://localhost:8100/api/v1/scan/run
```

## Key endpoints
- `GET /api/v1/universe`
- `POST /api/v1/universe/add?ticker=PLTR`
- `POST /api/v1/scan/run`
- `GET /api/v1/signals`
- `GET /api/v1/research/{ticker}`

## Chosen architecture decisions
1. Phase-1 scope = Universe + technical engine + signal generator + finviz adapter baseline
2. Scheduler = APScheduler (lower ops overhead now)
3. TA = pandas-native implementation now (no system TA-Lib dependency pain)
4. OpenAI moat/sentiment deferred to phase 2 (cleanly pluggable)
5. Finviz implemented as adapter with stub preset results; easy to swap to Elite credentials
6. Separate research service (not merged into portfolio app yet)
