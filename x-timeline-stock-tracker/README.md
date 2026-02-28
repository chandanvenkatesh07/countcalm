# X Timeline Stock Tracker (Local)

A local-first implementation of your PRD:
- Browser automation scrape of X timeline (manual login supported)
- Ticker extraction + blacklist
- Per-tweet sentiment + intent classification
- Screenshot/image capture for tweet context
- Running Tracker + Primary Tracker dashboard
- One-click promotion flow
- Deep analysis endpoint (local heuristic engine)
- Price refresh via yfinance
- Watermark-based incremental scrape

## Stack
- FastAPI + Jinja dashboard
- SQLite (local DB)
- Playwright (browser automation)
- yfinance (market metadata + price)

## Quick Start

```bash
cd x-timeline-stock-tracker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --port 8081
```

Open: http://127.0.0.1:8081

## First Scrape
1. Click **Run Scrape Now**.
2. Google Chrome opens with persistent profile in `./browser_profile`.
3. If needed, log in to X manually once.
4. Scraper switches to **Following** when available and scrolls timeline.
5. It stores:
   - tweet text + metadata
   - ticker matches
   - sentiment/intent
   - screenshot + embedded images

## Important Local Paths
- DB: `data/tracker.db`
- Images: `images/<TICKER>/...`
- Browser session profile: `browser_profile/`

## API (Implemented Core)
- `POST /api/scrape/trigger`
- `GET /api/scrape/status`
- `GET /api/running`
- `POST /api/running/{id}/dismiss`
- `POST /api/running/{id}/promote`
- `GET /api/primary`
- `POST /api/primary/{id}/analyze`
- `GET /api/primary/{id}/analysis-history`
- `POST /api/prices/refresh`

## Notes
- This is built to run fully local on your machine.
- The first run is intentionally interactive (you login in browser yourself).
- Watermark logic prevents re-processing old tweets when tweet id is encountered again.
- If Chrome does not launch correctly, set explicit path:

```bash
export CHROME_PATH=/usr/bin/google-chrome
```
