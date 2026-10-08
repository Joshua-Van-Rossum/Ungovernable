import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Panel, Spinner } from "../components/ui";
import { api, fmtDate, fmtMoney, fmtTime } from "../lib/api";
import "./Dashboard.css";

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);

  useEffect(() => {
    api.get("/finance/kpis").then(setKpis).catch(() => {});
  }, []);

  return (
    <div className="dash">
      <div className="dash__title">
        <h1>Command center</h1>
        <p className="dash__sub">Everything that matters, in one glance.</p>
      </div>

      {/* Finance 2x2 (wider) + CAT/rotating stock (narrower) */}
      <div className="dash__top">
        <FinanceGrid kpis={kpis} />
        <StockCard />
      </div>

      {/* Fitness: recent workouts + the PR that's gone longest without a new one */}
      <div className="dash__fitness">
        <RecentWorkouts />
        <NextUpGoal />
      </div>

      <YouTubePanel />
    </div>
  );
}

/* --------------------------------------------------- Finance 2x2 table */
function FinanceGrid({ kpis }) {
  const b = kpis?.balances;
  const s = kpis?.spend;
  const cells = [
    { label: "Net worth", value: b && fmtMoney(b.networth) },
    { label: "Cash on hand", value: b && fmtMoney(b.total_cash) },
    {
      label: "Spent this month",
      value: s && fmtMoney(s.this_month),
      tone: s && s.this_month <= s.last_month ? "gain" : "loss",
    },
    { label: "Spent this year", value: s && fmtMoney(s.ytd) },
  ];
  return (
    <Panel title="Finances" className="fin-grid">
      {!kpis ? (
        <Spinner />
      ) : (
        <div className="fin-grid__cells">
          {cells.map((c) => (
            <div className="fin-cell" key={c.label}>
              <span className="fin-cell__label">{c.label}</span>
              <span
                className="fin-cell__value mono"
                style={c.tone ? { color: `var(--${c.tone})` } : undefined}
              >
                {c.value ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------- CAT + rotating stock */
const ROTATION = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "SPY"];

function StockCard() {
  const [stocks, setStocks] = useState({});
  const [rotIdx, setRotIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .get("/external/stocks", { symbols: ["CAT", ...ROTATION].join(",") })
        .then((d) => {
          if (!alive) return;
          const map = {};
          (d.stocks || []).forEach((s) => (map[s.symbol] = s));
          setStocks(map);
        })
        .catch(() => {});
    };
    load();
    const reload = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(reload);
    };
  }, []);

  // Rotate the second slot every 5s; tapping the card advances it too.
  useEffect(() => {
    const id = setInterval(() => setRotIdx((v) => (v + 1) % ROTATION.length), 5000);
    return () => clearInterval(id);
  }, []);

  const cat = stocks["CAT"];
  const other = stocks[ROTATION[rotIdx]];

  return (
    <Panel title="Markets" className="stock-card">
      <Quote data={cat} pinned label="Caterpillar · where I work" />
      <div className="stock-card__div" />
      <button
        className="stock-card__rotor"
        onClick={() => setRotIdx((v) => (v + 1) % ROTATION.length)}
        title="Tap to switch"
        aria-label="Switch stock"
      >
        <Quote data={other} label="Rotating" />
        <span className="stock-card__rot-hint mono">{rotIdx + 1}/{ROTATION.length} ›</span>
      </button>
    </Panel>
  );
}

function Quote({ data, pinned, label }) {
  const up = (data?.change_percent ?? 0) >= 0;
  return (
    <div className={`quote ${pinned ? "quote--pinned" : ""}`}>
      <div className="quote__head">
        <span className="quote__sym mono">{data?.symbol ?? "—"}</span>
        <span className="quote__label">{label}</span>
      </div>
      <div className="quote__row">
        <span className="quote__price mono">
          {data?.price != null ? `$${data.price.toFixed(2)}` : "—"}
        </span>
        {data && (
          <span className={`chip chip--${up ? "gain" : "loss"} mono`}>
            {up ? "▲" : "▼"} {Math.abs(data.change_percent ?? 0).toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}
/* --------------------------------------------------- Recent workouts */
function RecentWorkouts() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get("/workouts/entries", { limit: 5 }).then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <Panel
      className="recent-wo"
      title="Recent workouts"
      action={
        <Link to="/workouts" className="btn btn--ghost btn--sm">
          open →
        </Link>
      }
    >
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No workouts yet" hint="Log a set on the Workouts page." />
      ) : (
        <ul className="recent-wo__list">
          {rows.map((r) => (
            <li key={r.id} className="recent-wo__item">
              <span className={`grp grp--${r.group.toLowerCase()}`}>{r.group}</span>
              <span className="recent-wo__name">{r.exercise}</span>
              <span className="recent-wo__result mono">
                {r.seconds != null ? fmtTime(r.seconds) : `${r.weight} × ${r.reps}`}
              </span>
              <span className="recent-wo__date mono">{fmtDate(r.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------ "Next up" stale-PR callout */
function NextUpGoal() {
  const [pr, setPr] = useState(undefined); // undefined = loading, null = none

  useEffect(() => {
    api
      .get("/workouts/prs")
      .then((prs) => setPr(prs.length ? prs[prs.length - 1] : null)) // oldest PR date = longest overdue
      .catch(() => setPr(null));
  }, []);

  return (
    <Panel className="next-up" title="Next up">
      {pr === undefined ? (
        <Spinner />
      ) : !pr ? (
        <EmptyState title="No PRs yet" hint="Log a set to start your records." />
      ) : (
        <div className="next-up__body">
          <p className="next-up__hint">Longest without a new PR</p>
          <span className="next-up__name">{pr.exercise}</span>
          <div className="next-up__row">
            <span className="next-up__value mono">
              {pr.is_run ? fmtTime(pr.value) : `${pr.weight} × ${pr.reps}`}
            </span>
            <span className="next-up__since mono">since {fmtDate(pr.date)}</span>
          </div>
          <Link to="/workouts" className="btn btn--primary btn--sm next-up__cta">
            Beat it →
          </Link>
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------------------- */
function YouTubePanel() {
  const [videos, setVideos] = useState(null);
  useEffect(() => {
    api.get("/external/youtube", { limit: 6 }).then((d) => setVideos(d.videos || [])).catch(() => setVideos([]));
  }, []);
  return (
    <Panel className="yt" title="Recommended watching">
      {!videos ? (
        <Spinner />
      ) : videos.length === 0 ? (
        <EmptyState title="No videos" hint="Couldn't reach YouTube right now." />
      ) : (
        <div className="yt__grid">
          {videos.map((v) => (
            <a key={v.video_id} href={v.url} target="_blank" rel="noreferrer" className="yt__card">
              <div className="yt__thumb">
                {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" />}
                <span className="yt__play">▶</span>
              </div>
              <div className="yt__meta">
                <span className="yt__channel">{v.channel}</span>
                <span className="yt__vtitle">{v.title}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}
