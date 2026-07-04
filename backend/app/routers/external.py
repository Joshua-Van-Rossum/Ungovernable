"""External data: stocks (Yahoo Finance), weather (Open-Meteo), YouTube (RSS).

All three use free, key-less public endpoints so the app runs out of the box.
Responses are cached briefly to stay polite and fast. A YouTube Data API key
can be added later via YOUTUBE_API_KEY for richer data; the RSS path needs none.
"""
from __future__ import annotations

import time
import xml.etree.ElementTree as ET

import httpx
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/external", tags=["external"])

# Caterpillar is always shown first (where the owner works), then a rotation.
DEFAULT_TICKERS = ["CAT", "AAPL", "MSFT", "NVDA", "SPY", "AMZN", "GOOGL"]

# Curated channels for AI engineering, software development, and math/science.
# Channel IDs are stable; RSS feeds need no API key.
YOUTUBE_CHANNELS = [
    # AI / ML engineering — primary focus
    ("Andrej Karpathy", "UCXUPKJO5MBESX9jyaItKhNA"),
    ("Two Minute Papers", "UCbfYPyITQ-7l4upoX8nvctg"),
    ("AI Explained", "UCNJ1Ymd5yFuUPtn21xtRbbw"),
    ("Yannic Kilcher", "UCZHmQk67mSJgfCCTn7xBfew"),
    # Software engineering & devops
    ("Fireship", "UCsBjURrPoezykLs9EqgamOA"),
    ("Theo - t3.gg", "UCbRP3rIgsfc9g4MzP67A6qQ"),
    ("ThePrimeagen", "UC8ENHE5xdFSwx71WHd4Ap3g"),
    # Data science & math
    ("3Blue1Brown", "UCYO_jab_esuFRV4b17AJtAw"),
    ("StatQuest with Josh Starmer", "UCtYLUTtgS3k1Fg4y5tAhLbw"),
    ("Veritasium", "UCHnyfMqiRRG1u-2MsSQLbXA"),
    # Cloud / systems
    ("TechWorld with Nana", "UCdngmbVKX1Tgre699-XLlUA"),
]

_cache: dict[str, tuple[float, object]] = {}
_TTL = 60  # seconds


def _cached(key: str, ttl: int = _TTL):
    hit = _cache.get(key)
    if hit and (time.time() - hit[0]) < ttl:
        return hit[1]
    return None


def _store(key: str, value):
    _cache[key] = (time.time(), value)
    return value


@router.get("/stocks")
async def stocks(symbols: str = Query("")):
    tickers = [s.strip().upper() for s in symbols.split(",") if s.strip()] or DEFAULT_TICKERS
    cache_key = "stocks:" + ",".join(tickers)
    if (c := _cached(cache_key)) is not None:
        return c

    # Yahoo's v7 quote endpoint now requires a crumb/cookie. The v8 chart
    # endpoint stays key-less and returns price + previous close per symbol.
    out = []
    try:
        async with httpx.AsyncClient(
            timeout=8, headers={"User-Agent": "Mozilla/5.0"}
        ) as client:
            for sym in tickers:
                try:
                    r = await client.get(
                        f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}",
                        params={"range": "1d", "interval": "1d"},
                    )
                    r.raise_for_status()
                    meta = r.json()["chart"]["result"][0]["meta"]
                    price = meta.get("regularMarketPrice")
                    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
                    change = (price - prev) if (price is not None and prev) else None
                    pct = (change / prev * 100) if (change is not None and prev) else None
                    out.append(
                        {
                            "symbol": sym,
                            "name": meta.get("shortName") or sym,
                            "price": price,
                            "change": change,
                            "change_percent": pct,
                            "currency": meta.get("currency", "USD"),
                        }
                    )
                except Exception:
                    continue
    except Exception as exc:  # network/upstream failure -> degrade gracefully
        return {"stocks": [], "error": str(exc)}
    if not out:
        return {"stocks": [], "error": "no quotes returned"}
    # keep CAT first regardless of upstream ordering
    out.sort(key=lambda s: (s["symbol"] != "CAT", tickers.index(s["symbol"]) if s["symbol"] in tickers else 99))
    return _store(cache_key, {"stocks": out})


@router.get("/weather")
async def weather(lat: float = 41.50, lon: float = -90.52):
    """Current weather via Open-Meteo (default: Quad Cities region; override via query)."""
    cache_key = f"weather:{lat:.2f},{lon:.2f}"
    if (c := _cached(cache_key, ttl=600)) is not None:
        return c
    url = "https://api.open-meteo.com/v1/forecast"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                url,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m",
                    "temperature_unit": "fahrenheit",
                    "wind_speed_unit": "mph",
                },
            )
            r.raise_for_status()
            cur = r.json().get("current", {})
            data = {
                "temperature": cur.get("temperature_2m"),
                "humidity": cur.get("relative_humidity_2m"),
                "wind": cur.get("wind_speed_10m"),
                "code": cur.get("weather_code"),
                "description": _WEATHER_CODES.get(cur.get("weather_code"), "—"),
            }
    except Exception as exc:
        return {"error": str(exc)}
    return _store(cache_key, data)


@router.get("/youtube")
async def youtube(limit: int = 5):
    """Daily curated picks — latest video from each channel, best 5 by recency.

    Cached for 6 hours so the list feels "daily" without hammering YouTube RSS.
    Returns a thumbnail URL, channel name, title, publish date, and direct URL.
    """
    cache_key = f"youtube:daily:{limit}"
    if (c := _cached(cache_key, ttl=21600)) is not None:  # 6h cache
        return c
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }
    videos = []
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "Mozilla/5.0"}) as client:
            for name, cid in YOUTUBE_CHANNELS:
                try:
                    r = await client.get(
                        "https://www.youtube.com/feeds/videos.xml",
                        params={"channel_id": cid},
                    )
                    r.raise_for_status()
                    root = ET.fromstring(r.text)
                    # Grab the most recent entry only per channel
                    entry = root.find("atom:entry", ns)
                    if entry is None:
                        continue
                    vid = entry.find("yt:videoId", ns)
                    title = entry.find("atom:title", ns)
                    published = entry.find("atom:published", ns)
                    description_el = entry.find(".//media:description", ns)
                    vid_id = vid.text if vid is not None else None
                    videos.append(
                        {
                            "channel": name,
                            "title": title.text if title is not None else "",
                            "video_id": vid_id,
                            "url": f"https://www.youtube.com/watch?v={vid_id}" if vid_id else None,
                            "thumbnail": f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg" if vid_id else None,
                            "published": published.text if published is not None else None,
                            "description": (description_el.text or "")[:200] if description_el is not None else "",
                        }
                    )
                except Exception:
                    continue
    except Exception as exc:
        return {"videos": [], "error": str(exc)}
    # Sort by publish date descending, return top N as daily picks
    videos.sort(key=lambda v: v.get("published") or "", reverse=True)
    return _store(cache_key, {"videos": videos[:limit]})


_WEATHER_CODES = {
    0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle",
    55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers",
    81: "Rain showers", 82: "Violent showers", 95: "Thunderstorm",
    96: "Thunderstorm + hail", 99: "Severe thunderstorm",
}
