import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { EmptyState, Panel, Spinner, Stat } from "../components/ui";
import { api, fmtMoney } from "../lib/api";
import "./Dashboard.css";

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [screen, setScreen] = useState(null);

  useEffect(() => {
    api.get("/finance/kpis").then(setKpis).catch(() => {});
    api.get("/dashboard/screentime").then(setScreen).catch(() => {});
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

      {/* Screen-time: one cycling value */}
      <ScreenTimeCycle screen={screen} />

      {/* Habits + Projects (one column) | skinny consistency column */}
      <div className="dash__core">
        <div className="dash__stack">
          <HabitTracker />
          <ProjectsMini />
        </div>
        <ConsistencyColumn />
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

/* ------------------------------------------- Screen-time cycling value */
const SCREEN_VIEWS = [
  { key: "total_hours", label: "Total screen time", unit: "h", tone: "loss" },
  { key: "avg_week", label: "Avg / day · week", unit: "h" },
  { key: "avg_month", label: "Avg / day · month", unit: "h" },
  { key: "avg_year", label: "Avg / day · year", unit: "h" },
];

function ScreenTimeCycle({ screen }) {
  const [i, setI] = useState(0);
  const view = SCREEN_VIEWS[i];
  const next = () => setI((v) => (v + 1) % SCREEN_VIEWS.length);

  return (
    <button
      className="screentime-cycle"
      onClick={next}
      title="Tap to cycle metrics"
      aria-label={`${view.label}, tap to cycle`}
    >
      <div className="screentime-cycle__main">
        <span className="screentime-cycle__label">{view.label}</span>
        <span
          className="screentime-cycle__value mono"
          style={view.tone ? { color: `var(--${view.tone})` } : undefined}
        >
          {screen ? `${screen[view.key]} ${view.unit}` : "—"}
        </span>
      </div>
      <div className="screentime-cycle__dots" aria-hidden>
        {SCREEN_VIEWS.map((_, d) => (
          <span key={d} className={`dot ${d === i ? "is-active" : ""}`} />
        ))}
      </div>
      <span className="screentime-cycle__hint">tap to cycle ›</span>
    </button>
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

/* ----------------------------------------------------------------------- */
function HabitTracker() {
  const [habits, setHabits] = useState(null);
  const [drill, setDrill] = useState(null);

  const load = () => api.get("/habits").then(setHabits).catch(() => setHabits([]));
  useEffect(() => {
    load();
  }, []);

  const toggle = async (h) => {
    await api.post("/habits/log", { habit_id: h.id, done: !h.today_done });
    load();
  };
  const setValue = async (h, value) => {
    await api.post("/habits/log", { habit_id: h.id, value: Number(value) });
    load();
  };

  const doneCount = habits?.filter((h) => h.today_done).length ?? 0;

  return (
    <Panel
      className="habits"
      title="Daily habits"
      action={
        habits ? (
          <span className="habits__count mono">
            {doneCount}/{habits.length}
          </span>
        ) : null
      }
    >
      {!habits ? (
        <Spinner />
      ) : (
        <ul className="habit-list">
          {habits.map((h) => (
            <li key={h.id} className={`habit ${h.today_done ? "is-done" : ""}`}>
              {h.kind === "number" ? (
                <div className="habit__num">
                  <button className="habit__name" onClick={() => setDrill(h)}>
                    {h.name}
                  </button>
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    className="mono"
                    placeholder="hrs"
                    defaultValue={h.today_value ?? ""}
                    onBlur={(e) => e.target.value && setValue(h, e.target.value)}
                  />
                </div>
              ) : (
                <button className="habit__check" onClick={() => toggle(h)}>
                  <span className="habit__box" aria-hidden>
                    {h.today_done ? "✓" : ""}
                  </span>
                  <span className="habit__name" onClick={(e) => { e.stopPropagation(); setDrill(h); }}>
                    {h.name}
                  </span>
                  {h.streak > 0 && <span className="habit__streak mono">🔥{h.streak}</span>}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <HabitDrill habit={drill} onClose={() => setDrill(null)} />
    </Panel>
  );
}

function HabitDrill({ habit, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!habit) return;
    setData(null);
    api.get(`/habits/${habit.id}/progress`, { days: 90 }).then(setData).catch(() => {});
  }, [habit]);

  if (!habit) return null;
  const chart = data?.series?.map((s) => ({ ...s, v: s.done ? 1 : 0 }));

  return (
    <div className="drill">
      <div className="drill__head">
        <strong>{habit.name}</strong>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>
          close
        </button>
      </div>
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="drill__stats mono">
            <span>{Math.round(data.completion_rate * 100)}% · 90d</span>
            <span>streak {data.current_streak}</span>
          </div>
          <ResponsiveContainer width="100%" height={70}>
            <AreaChart data={chart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="habitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gain)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--gain)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="step"
                dataKey="v"
                stroke="var(--gain)"
                strokeWidth={1.5}
                fill="url(#habitGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
function ConsistencyColumn() {
  const [grid, setGrid] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/commit-grid").then(setGrid).catch(() => {});
    api.get("/habits/stats").then(setStats).catch(() => {});
  }, []);

  return (
    <Panel className="consistency" title="Consistency">
      {!grid ? <Spinner /> : <VerticalCommitGrid cells={grid.cells} />}
      <div className="consistency__stats">
        <Stat label="Active days / yr" value={grid ? `${grid.active_days}` : "—"} />
        {stats && (
          <Stat
            label="Habits/day · this mo"
            value={stats.this_month_avg}
            delta={
              stats.last_month_avg
                ? ((stats.this_month_avg - stats.last_month_avg) / stats.last_month_avg) * 100
                : null
            }
          />
        )}
      </div>
    </Panel>
  );
}

// Skinny grid that flows vertically: newest week at top, 7 day-columns each row.
function VerticalCommitGrid({ cells }) {
  const [hover, setHover] = useState(null);
  // Last ~18 weeks, grouped into weeks; newest first.
  const recent = cells.slice(-18 * 7);
  const weeks = [];
  for (let i = 0; i < recent.length; i += 7) weeks.push(recent.slice(i, i + 7));
  weeks.reverse();

  const level = (c) => {
    if (!c || c.count <= 0) return 0;
    return Math.min(4, c.count);
  };

  return (
    <div className="vgrid">
      <div className="vgrid__rows">
        {weeks.map((w, wi) => (
          <div className="vgrid__week" key={wi}>
            {w.map((c) => (
              <span
                key={c.date}
                className="vgrid__cell"
                data-level={level(c)}
                onMouseEnter={() => setHover(c)}
                onMouseLeave={() => setHover(null)}
                tabIndex={0}
                aria-label={`${c.count} on ${c.date}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="vgrid__foot">
        {hover ? (
          <span className="mono">
            {hover.count}× ·{" "}
            {new Date(hover.date + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : (
          <span className="vgrid__ramp">
            less
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className="vgrid__cell vgrid__cell--legend" data-level={l} />
            ))}
            more
          </span>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
function ProjectsMini() {
  const [projects, setProjects] = useState(null);
  useEffect(() => {
    api.get("/projects").then(setProjects).catch(() => setProjects([]));
  }, []);
  return (
    <Panel
      className="projmini"
      title="Projects"
      action={
        <Link to="/projects" className="btn btn--ghost btn--sm">
          open →
        </Link>
      }
    >
      {!projects ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <EmptyState title="No projects yet" hint="Add one on the Projects page." />
      ) : (
        <ul className="projmini__list">
          {projects.slice(0, 6).map((p) => (
            <li key={p.id}>
              <Link to="/projects" className="projmini__item">
                <span className="projmini__dot" />
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
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
