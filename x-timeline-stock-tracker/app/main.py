from __future__ import annotations

import asyncio
import json
import os
import random
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

import yfinance as yf
from fastapi import FastAPI, Depends, HTTPException, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlmodel import SQLModel, Field, create_engine, Session, select

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
IMG_DIR = BASE_DIR / "images"
PROFILE_DIR = BASE_DIR / "browser_profile"
for d in (DATA_DIR, IMG_DIR, PROFILE_DIR):
    d.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "tracker.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ScrapeState(SQLModel, table=True):
    id: str = Field(default="singleton", primary_key=True)
    last_tweet_id: Optional[str] = None
    last_tweet_timestamp: Optional[str] = None
    last_scrape_at: Optional[str] = None
    tweets_scraped_count: int = 0
    tickers_found_count: int = 0


class ScrapedTweet(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    tweet_id: str = Field(index=True, unique=True)
    tweet_text: str
    tweet_url: str
    author_handle: str
    author_display_name: str = ""
    tickers_mentioned: str = "[]"  # JSON array
    direction: str = "NEUTRAL"
    direction_confidence: int = 50
    investment_intent: str = "UNCLEAR"
    intent_confidence: int = 50
    likes: int = 0
    retweets: int = 0
    replies: int = 0
    screenshot_path: Optional[str] = None
    embedded_image_paths: str = "[]"
    tweet_timestamp: Optional[str] = None
    scraped_at: str = Field(default_factory=lambda: utcnow().isoformat())


class RunningTracker(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    ticker: str = Field(index=True, unique=True)
    company_name: str = ""
    sector: str = "Unclassified"
    industry: str = "Unclassified"
    asset_class: str = "STOCK"
    mention_count: int = 0
    unique_sources: str = "[]"
    bullish_count: int = 0
    bearish_count: int = 0
    neutral_count: int = 0
    buying_count: int = 0
    sentiment_score: float = 50.0
    first_seen_at: str = Field(default_factory=lambda: utcnow().isoformat())
    last_seen_at: str = Field(default_factory=lambda: utcnow().isoformat())
    first_seen_price: float = 0.0
    current_price: float = 0.0
    price_change_pct: float = 0.0
    mention_velocity_24h: int = 0
    total_engagement: int = 0
    status: str = "ACTIVE"
    promoted_at: Optional[str] = None
    primary_tracker_id: Optional[str] = None


class PrimaryTracker(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    running_tracker_id: str = Field(index=True)
    ticker: str = Field(index=True)
    company_name: str = ""
    sector: str = "Unclassified"
    industry: str = "Unclassified"
    asset_class: str = "STOCK"
    thesis: str = ""
    catalyst_tags: str = "[]"
    entry_price: float = 0.0
    target_buy_price: float = 0.0
    current_price: float = 0.0
    price_change_pct: float = 0.0
    avg_volume_20d: int = 0
    today_volume: int = 0
    volume_ratio: float = 0.0
    conviction: str = "MEDIUM"
    status: str = "WATCHING"
    sentiment_score: float = 50.0
    thesis_strength_score: int = 0
    notes: str = ""
    promoted_at: str = Field(default_factory=lambda: utcnow().isoformat())
    last_analysis_at: Optional[str] = None
    has_analysis: bool = False


class AnalysisResult(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    primary_tracker_id: str = Field(index=True)
    analysis_json: str
    thesis_strength_score: int
    created_at: str = Field(default_factory=lambda: utcnow().isoformat())


def create_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        state = s.get(ScrapeState, "singleton")
        if not state:
            s.add(ScrapeState())
            s.commit()


def get_session():
    with Session(engine) as session:
        yield session


BULLISH = {
    "long", "bull", "bullish", "moon", "buy", "buying", "calls", "breakout", "undervalued", "accumulating",
    "adding", "upside", "ripping", "sending", "higher", "target raised", "squeeze"
}
BEARISH = {
    "short", "bear", "bearish", "puts", "dump", "sell", "selling", "overvalued", "downside", "crash",
    "bubble", "overbought", "exit", "take profits", "lower", "weak", "rug pull"
}
BUYING = {"bought", "buying", "added", "opened a position", "went long", "entered", "dca", "loaded", "grabbed"}
WATCHING = {"watching", "on my radar", "looking at", "considering", "might buy", "interested", "eyeing"}
SOLD = {"sold", "exited", "closed", "took profits", "trimmed", "reduced", "out of", "stopped out"}
BLACKLIST = {"ATH", "IPO", "CEO", "GDP", "PE", "EPS", "USD", "US", "FED", "IMO", "FOMO", "ATL", "FYI", "USA", "AI", "DD", "LOL", "RIP", "SEC", "NFT"}


def find_tickers(text: str) -> list[str]:
    out = set(re.findall(r"\$([A-Z]{1,5})\b", text or ""))
    for b in list(out):
        if b in BLACKLIST:
            out.remove(b)
    return sorted(out)


def classify_direction(text: str) -> tuple[str, int]:
    t = (text or "").lower()
    b = sum(1 for k in BULLISH if k in t)
    br = sum(1 for k in BEARISH if k in t)
    if b > br:
        return "BULLISH", min(95, 55 + 10 * (b - br))
    if br > b:
        return "BEARISH", min(95, 55 + 10 * (br - b))
    return "NEUTRAL", 50


def classify_intent(text: str) -> tuple[str, int]:
    t = (text or "").lower()
    if any(k in t for k in SOLD):
        return "SOLD", 80
    if any(k in t for k in BUYING):
        return "BUYING", 80
    if any(k in t for k in WATCHING):
        return "WATCHING", 75
    return "UNCLEAR", 50


def yf_enrich(ticker: str) -> dict:
    try:
        info = yf.Ticker(ticker).info
        cp = float(info.get("currentPrice") or info.get("regularMarketPrice") or 0.0)
        name = info.get("longName") or info.get("shortName") or ticker
        sector = info.get("sector") or "Unclassified"
        industry = info.get("industry") or "Unclassified"
        asset = "ETF" if info.get("quoteType") == "ETF" else "STOCK"
        return {"company_name": name, "sector": sector, "industry": industry, "current_price": cp, "asset_class": asset}
    except Exception:
        return {"company_name": ticker, "sector": "Unclassified", "industry": "Unclassified", "current_price": 0.0, "asset_class": "STOCK"}


@dataclass
class ScrapedRecord:
    tweet_id: str
    text: str
    url: str
    author_handle: str
    author_display_name: str
    timestamp: str
    likes: int
    retweets: int
    replies: int
    screenshot_path: Optional[str]
    image_paths: list[str]
    tickers: list[str]


async def run_playwright_scrape(max_tweets: int, watermark: Optional[str], max_age_days: int = 7) -> list[ScrapedRecord]:
    from playwright.async_api import async_playwright

    scraped: list[ScrapedRecord] = []
    seen_ids: set[str] = set()
    cutoff_ts = utcnow().timestamp() - (max_age_days * 86400)

    async with async_playwright() as p:
        browser_kwargs = dict(
            user_data_dir=str(PROFILE_DIR),
            headless=False,
            viewport={"width": 1440, "height": 1200},
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized",
            ],
        )
        chrome_path = os.getenv("CHROME_PATH", "").strip()
        if chrome_path:
            browser_kwargs["executable_path"] = chrome_path
        else:
            # Prefer real Google Chrome for X login compatibility
            browser_kwargs["channel"] = "chrome"

        context = await p.chromium.launch_persistent_context(**browser_kwargs)
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto("https://x.com/home", wait_until="domcontentloaded")

        # give user a chance to login manually on first run
        for _ in range(120):
            if "login" not in page.url and "x.com/home" in page.url:
                break
            await asyncio.sleep(1)

        # Force chronological timeline: switch to Following tab
        following_ok = False
        try:
            # Best target: tab role with accessible name
            following_tab = page.get_by_role("tab", name=re.compile(r"^Following$", re.I))
            if await following_tab.count() > 0:
                tab = following_tab.first
                selected = (await tab.get_attribute("aria-selected")) == "true"
                if not selected:
                    await tab.click(timeout=3000)
                    await asyncio.sleep(1)
                selected = (await tab.get_attribute("aria-selected")) == "true"
                following_ok = bool(selected)
        except Exception:
            following_ok = False

        if not following_ok:
            try:
                # Fallback text click in case role mapping changes
                following = page.get_by_text("Following", exact=True)
                if await following.count() > 0:
                    await following.first.click(timeout=3000)
                    await asyncio.sleep(1)
                    following_ok = True
            except Exception:
                following_ok = False

        if not following_ok:
            await context.close()
            raise RuntimeError("Could not switch to Following tab. Aborting scrape to avoid For You timeline.")

        while len(scraped) < max_tweets:
            articles = page.locator("article[data-testid='tweet']")
            count = await articles.count()
            for i in range(count):
                try:
                    art = articles.nth(i)
                    link = art.locator("a[href*='/status/']").first
                    href = await link.get_attribute("href") if await link.count() else None
                    if not href:
                        continue
                    m = re.search(r"/status/(\d+)", href)
                    if not m:
                        continue
                    tid = m.group(1)
                    if tid in seen_ids:
                        continue
                    if watermark and tid == watermark:
                        await context.close()
                        return scraped

                    # Stop once timeline is older than max_age_days (works best with Following tab)
                    time_loc = art.locator("time").first
                    tweet_time_iso = None
                    tweet_ts = None
                    if await time_loc.count():
                        tweet_time_iso = await time_loc.get_attribute("datetime")
                        if tweet_time_iso:
                            try:
                                tweet_ts = datetime.fromisoformat(tweet_time_iso.replace("Z", "+00:00")).timestamp()
                            except Exception:
                                tweet_ts = None
                    if tweet_ts is not None and tweet_ts < cutoff_ts:
                        await context.close()
                        return scraped

                    seen_ids.add(tid)

                    txt_loc = art.locator("[data-testid='tweetText']")
                    text = ""
                    try:
                        tc = await txt_loc.count()
                        if tc == 1:
                            text = await txt_loc.first.inner_text()
                        elif tc > 1:
                            parts = [t.strip() for t in await txt_loc.all_inner_texts() if t.strip()]
                            text = "\n".join(parts)
                    except Exception:
                        text = ""
                    tickers = find_tickers(text)
                    if not tickers:
                        continue

                    author = ""
                    name = ""
                    # robust-enough parse fallback
                    art_text = await art.inner_text()
                    handles = re.findall(r"@([A-Za-z0-9_]{1,15})", art_text)
                    if handles:
                        author = "@" + handles[0]
                    names = re.findall(r"^(.+?)\n@", art_text, re.M)
                    if names:
                        name = names[0].strip()

                    shot_path = None
                    try:
                        bb = await art.bounding_box()
                        if bb:
                            png = await page.screenshot(clip=bb)
                            ticker_dir = IMG_DIR / tickers[0]
                            ticker_dir.mkdir(parents=True, exist_ok=True)
                            shot_file = ticker_dir / f"{tid}_screenshot.png"
                            shot_file.write_bytes(png)
                            shot_path = str(shot_file.relative_to(BASE_DIR))
                    except Exception:
                        pass

                    images: list[str] = []
                    media = art.locator("img")
                    mc = await media.count()
                    for mi in range(mc):
                        src = await media.nth(mi).get_attribute("src")
                        if not src or "profile_images" in src:
                            continue
                        try:
                            import httpx

                            resp = httpx.get(src, timeout=10)
                            if resp.status_code == 200 and resp.content:
                                ext = ".jpg"
                                ticker_dir = IMG_DIR / tickers[0]
                                ticker_dir.mkdir(parents=True, exist_ok=True)
                                file = ticker_dir / f"{tid}_img{mi+1}{ext}"
                                file.write_bytes(resp.content)
                                images.append(str(file.relative_to(BASE_DIR)))
                        except Exception:
                            continue

                    rec = ScrapedRecord(
                        tweet_id=tid,
                        text=text,
                        url=f"https://x.com{href}" if href.startswith("/") else href,
                        author_handle=author or "@unknown",
                        author_display_name=name or "Unknown",
                        timestamp=tweet_time_iso or utcnow().isoformat(),
                        likes=0,
                        retweets=0,
                        replies=0,
                        screenshot_path=shot_path,
                        image_paths=images,
                        tickers=tickers,
                    )
                    scraped.append(rec)
                    if len(scraped) >= max_tweets:
                        break
                except Exception:
                    # Skip malformed/ephemeral timeline cards without killing the scrape run
                    continue

            await page.mouse.wheel(0, random.randint(1000, 1800))
            await asyncio.sleep(random.uniform(0.8, 1.7))

        await context.close()
    return scraped


class PromoteRequest(BaseModel):
    thesis: Optional[str] = ""
    tags: list[str] = []
    conviction: str = "MEDIUM"
    target_buy_price: float = 0.0


app = FastAPI(title="X Timeline Stock Tracker")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
app.mount("/images", StaticFiles(directory=str(IMG_DIR)), name="images")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.on_event("startup")
def _startup():
    create_db()


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request, author: Optional[str] = None, session: Session = Depends(get_session)):
    running = session.exec(select(RunningTracker).where(RunningTracker.status != "DISMISSED")).all()
    primary = session.exec(select(PrimaryTracker).where(PrimaryTracker.status != "ARCHIVED")).all()
    state = session.get(ScrapeState, "singleton")

    all_authors = sorted({t.author_handle for t in session.exec(select(ScrapedTweet)).all() if t.author_handle})
    if author:
        running = [r for r in running if author in set(json.loads(r.unique_sources))]
        filtered_primary: list[PrimaryTracker] = []
        for p in primary:
            linked = session.get(RunningTracker, p.running_tracker_id)
            if not linked:
                continue
            if author in set(json.loads(linked.unique_sources)):
                filtered_primary.append(p)
        primary = filtered_primary

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "running": running,
            "primary": primary,
            "state": state,
            "json": json,
            "authors": all_authors,
            "selected_author": author or "",
        },
    )


@app.post("/api/scrape/trigger")
async def scrape_trigger(max_tweets: int = Form(120), max_age_days: int = Form(7), session: Session = Depends(get_session)):
    state = session.get(ScrapeState, "singleton")
    records = await run_playwright_scrape(max_tweets=max_tweets, watermark=state.last_tweet_id, max_age_days=max_age_days)
    ingested = 0
    newest_id = state.last_tweet_id
    for r in records:
        exists = session.exec(select(ScrapedTweet).where(ScrapedTweet.tweet_id == r.tweet_id)).first()
        if exists:
            continue
        direction, dconf = classify_direction(r.text)
        intent, iconf = classify_intent(r.text)
        tw = ScrapedTweet(
            tweet_id=r.tweet_id,
            tweet_text=r.text,
            tweet_url=r.url,
            author_handle=r.author_handle,
            author_display_name=r.author_display_name,
            tickers_mentioned=json.dumps(r.tickers),
            direction=direction,
            direction_confidence=dconf,
            investment_intent=intent,
            intent_confidence=iconf,
            likes=r.likes,
            retweets=r.retweets,
            replies=r.replies,
            screenshot_path=r.screenshot_path,
            embedded_image_paths=json.dumps(r.image_paths),
            tweet_timestamp=r.timestamp,
        )
        session.add(tw)
        ingested += 1
        if not newest_id or int(r.tweet_id) > int(newest_id):
            newest_id = r.tweet_id

        for ticker in r.tickers:
            rt = session.exec(select(RunningTracker).where(RunningTracker.ticker == ticker)).first()
            if not rt:
                meta = yf_enrich(ticker)
                rt = RunningTracker(
                    ticker=ticker,
                    company_name=meta["company_name"],
                    sector=meta["sector"],
                    industry=meta["industry"],
                    asset_class=meta["asset_class"],
                    first_seen_price=meta["current_price"],
                    current_price=meta["current_price"],
                )
            rt.mention_count += 1
            rt.last_seen_at = utcnow().isoformat()
            sources = set(json.loads(rt.unique_sources))
            sources.add(r.author_handle)
            rt.unique_sources = json.dumps(sorted(sources))
            if direction == "BULLISH":
                rt.bullish_count += 1
            elif direction == "BEARISH":
                rt.bearish_count += 1
            else:
                rt.neutral_count += 1
            if intent == "BUYING":
                rt.buying_count += 1
            den = max(1, rt.bullish_count + rt.bearish_count)
            rt.sentiment_score = round((rt.bullish_count / den) * 100, 2)
            rt.total_engagement += (r.likes + r.retweets + r.replies)
            if rt.first_seen_price > 0 and rt.current_price > 0:
                rt.price_change_pct = round(((rt.current_price - rt.first_seen_price) / rt.first_seen_price) * 100, 2)
            session.add(rt)

    state.last_scrape_at = utcnow().isoformat()
    state.tweets_scraped_count = ingested
    state.last_tweet_id = newest_id
    state.tickers_found_count = len({t.ticker for t in session.exec(select(RunningTracker)).all()})
    session.add(state)
    session.commit()
    return {"ok": True, "ingested": ingested, "records_seen": len(records), "watermark": newest_id}


@app.get("/api/scrape/status")
def scrape_status(session: Session = Depends(get_session)):
    state = session.get(ScrapeState, "singleton")
    return state.model_dump()


@app.get("/api/running")
def running_list(session: Session = Depends(get_session)):
    return session.exec(select(RunningTracker).where(RunningTracker.status != "DISMISSED")).all()


@app.post("/api/running/{running_id}/dismiss")
def dismiss_running(running_id: str, session: Session = Depends(get_session)):
    rt = session.get(RunningTracker, running_id)
    if not rt:
        raise HTTPException(404, "Not found")
    rt.status = "DISMISSED"
    session.add(rt)
    session.commit()
    return {"ok": True}


@app.post("/api/running/{running_id}/promote")
def promote_running(running_id: str, body: Optional[PromoteRequest] = None, session: Session = Depends(get_session)):
    rt = session.get(RunningTracker, running_id)
    if not rt:
        raise HTTPException(404, "Running ticker not found")

    existing = session.exec(select(PrimaryTracker).where(PrimaryTracker.ticker == rt.ticker, PrimaryTracker.status != "ARCHIVED")).first()
    if existing:
        return {"ok": True, "primary_id": existing.id, "existing": True}

    body = body or PromoteRequest()
    p = PrimaryTracker(
        running_tracker_id=rt.id,
        ticker=rt.ticker,
        company_name=rt.company_name,
        sector=rt.sector,
        industry=rt.industry,
        asset_class=rt.asset_class,
        thesis=body.thesis or "",
        catalyst_tags=json.dumps(body.tags),
        entry_price=rt.current_price,
        target_buy_price=body.target_buy_price,
        current_price=rt.current_price,
        price_change_pct=rt.price_change_pct,
        conviction=body.conviction,
        sentiment_score=rt.sentiment_score,
    )
    session.add(p)
    session.flush()

    rt.status = "PROMOTED"
    rt.promoted_at = utcnow().isoformat()
    rt.primary_tracker_id = p.id
    session.add(rt)
    session.commit()
    return {"ok": True, "primary_id": p.id}


@app.get("/api/primary")
def primary_list(session: Session = Depends(get_session)):
    return session.exec(select(PrimaryTracker).where(PrimaryTracker.status != "ARCHIVED")).all()


@app.post("/api/primary/{primary_id}/analyze")
def analyze_primary(primary_id: str, session: Session = Depends(get_session)):
    p = session.get(PrimaryTracker, primary_id)
    if not p:
        raise HTTPException(404, "Primary ticker not found")

    tweets = session.exec(select(ScrapedTweet)).all()
    rel = [t for t in tweets if p.ticker in json.loads(t.tickers_mentioned)]
    bull = sum(1 for t in rel if t.direction == "BULLISH")
    bear = sum(1 for t in rel if t.direction == "BEARISH")
    neu = sum(1 for t in rel if t.direction == "NEUTRAL")
    buy = sum(1 for t in rel if t.investment_intent == "BUYING")

    score = 5
    if bull > bear:
        score += 2
    if buy >= 3:
        score += 1
    if p.price_change_pct > 5:
        score += 1
    score = max(1, min(10, score))

    analysis = {
        "ticker": p.ticker,
        "as_of": utcnow().isoformat(),
        "social_signal": {"bullish": bull, "bearish": bear, "neutral": neu, "buying": buy},
        "thesis": p.thesis,
        "catalyst_assessment": "Social momentum is supportive" if bull >= bear else "Signal is mixed or deteriorating",
        "risk_factors": [
            "High social-driven volatility",
            "Potential narrative reversal",
            "Macro/event risk",
        ],
        "thesis_strength_score": score,
    }
    ar = AnalysisResult(primary_tracker_id=p.id, analysis_json=json.dumps(analysis), thesis_strength_score=score)
    session.add(ar)
    p.has_analysis = True
    p.last_analysis_at = utcnow().isoformat()
    p.thesis_strength_score = score
    session.add(p)
    session.commit()
    return analysis


@app.get("/api/primary/{primary_id}/analysis-history")
def analysis_history(primary_id: str, session: Session = Depends(get_session)):
    return session.exec(select(AnalysisResult).where(AnalysisResult.primary_tracker_id == primary_id)).all()


@app.post("/api/reset/running")
def reset_running(session: Session = Depends(get_session)):
    for r in session.exec(select(RunningTracker)).all():
        session.delete(r)
    for t in session.exec(select(ScrapedTweet)).all():
        session.delete(t)
    state = session.get(ScrapeState, "singleton")
    state.last_tweet_id = None
    state.last_tweet_timestamp = None
    state.last_scrape_at = None
    state.tweets_scraped_count = 0
    state.tickers_found_count = 0
    session.add(state)
    session.commit()
    return RedirectResponse(url="/", status_code=303)


@app.post("/api/reset/primary")
def reset_primary(session: Session = Depends(get_session)):
    for p in session.exec(select(PrimaryTracker)).all():
        session.delete(p)
    for r in session.exec(select(RunningTracker)).all():
        r.status = "ACTIVE"
        r.promoted_at = None
        r.primary_tracker_id = None
        session.add(r)
    for a in session.exec(select(AnalysisResult)).all():
        session.delete(a)
    session.commit()
    return RedirectResponse(url="/", status_code=303)


@app.post("/api/prices/refresh")
def refresh_prices(session: Session = Depends(get_session)):
    running = session.exec(select(RunningTracker).where(RunningTracker.status != "DISMISSED")).all()
    for rt in running:
        meta = yf_enrich(rt.ticker)
        cp = meta["current_price"]
        if cp > 0:
            rt.current_price = cp
            if rt.first_seen_price > 0:
                rt.price_change_pct = round(((cp - rt.first_seen_price) / rt.first_seen_price) * 100, 2)
            session.add(rt)

        if rt.primary_tracker_id:
            p = session.get(PrimaryTracker, rt.primary_tracker_id)
            if p:
                p.current_price = rt.current_price
                p.price_change_pct = rt.price_change_pct
                if p.target_buy_price > 0 and p.current_price <= p.target_buy_price:
                    p.status = "IN_BUY_ZONE"
                session.add(p)
    session.commit()
    return {"ok": True, "updated": len(running)}
