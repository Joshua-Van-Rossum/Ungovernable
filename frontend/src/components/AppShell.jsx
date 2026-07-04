import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../lib/api";
import "./AppShell.css";

const LIFTS = ["bench", "squat", "pull-ups"];
const RUNS = ["1mile", "2mile", "3mile", "4mile", "5mile", "5k", "10k", "15k"];
const CATEGORIES = ["Car","Dates","Debt Payments","Food","Home","Investments","Miscellaneous","Pet","Subscriptions"];

const NAV = [
  { to: "/", label: "Dashboard", icon: "◧", end: true },
  { to: "/finance", label: "Finance", icon: "$" },
  { to: "/workouts", label: "Workouts", icon: "▲" },
  { to: "/projects", label: "Projects", icon: "✎" },
  { to: "/upskilling", label: "Upskilling", icon: "✦" },
];

function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
        <path
          d="M8 23V10l8 9 8-9v13"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="logo__word">Ungovernable</span>
    </span>
  );
}

export default function AppShell() {
  const [me, setMe] = useState(null);
  const [sheet, setSheet] = useState(null); // "workout" | "expense" | "upskilling" | null

  // Record a visit once per app open (powers the commit grid).
  useEffect(() => {
    api.post("/dashboard/visit").catch(() => {});
    api.get("/me").then(setMe).catch(() => {});
  }, []);

  return (
    <div className="shell">
      <aside className="shell__nav">
        <div className="shell__brand">
          <Logo />
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav__item ${isActive ? "is-active" : ""}`}
            >
              <span className="nav__icon mono" aria-hidden>
                {n.icon}
              </span>
              <span className="nav__label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="shell__who">
          <span className="shell__whoDot" />
          <span className="mono">{me?.name ?? "…"}</span>
        </div>
      </aside>

      <div className="shell__main">
        <header className="topbar">
          <HeaderInfo />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>

      {/* Mobile quick-log bottom bar — only visible on small screens */}
      <QuickBar onOpen={setSheet} />
      <QuickSheet active={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

/* ─────────────────────────────── Mobile quick-log bar + sheet ─── */

function QuickBar({ onOpen }) {
  return (
    <div className="qbar" role="toolbar" aria-label="Quick log">
      <button className="qbar__btn" onClick={() => onOpen("workout")}>
        <span className="qbar__icon mono" aria-hidden>▲</span>
        <span className="qbar__label">Workout</span>
      </button>
      <button className="qbar__btn" onClick={() => onOpen("expense")}>
        <span className="qbar__icon mono" aria-hidden>$</span>
        <span className="qbar__label">Expense</span>
      </button>
      <button className="qbar__btn qbar__btn--accent" onClick={() => onOpen("upskilling")}>
        <span className="qbar__icon mono" aria-hidden>✦</span>
        <span className="qbar__label">Upskilling</span>
      </button>
    </div>
  );
}

function QuickSheet({ active, onClose }) {
  const ref = useRef(null);

  // Close on backdrop click
  const onBackdrop = (e) => { if (e.target === ref.current) onClose(); };
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    if (active) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, onClose]);

  if (!active) return null;

  const titles = { workout: "Log a set", expense: "Log an expense", upskilling: "Daily review" };

  return (
    <div className="qsheet-backdrop" ref={ref} onClick={onBackdrop}>
      <div className="qsheet" role="dialog" aria-modal="true" aria-label={titles[active]}>
        <div className="qsheet__handle" />
        <header className="qsheet__head">
          <h3>{titles[active]}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="qsheet__body">
          {active === "workout"    && <QuickWorkout onDone={onClose} />}
          {active === "expense"    && <QuickExpense onDone={onClose} />}
          {active === "upskilling" && <QuickUpskilling onDone={onClose} />}
        </div>
      </div>
    </div>
  );
}

function QuickWorkout({ onDone }) {
  const [exercise, setExercise] = useState("bench");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [mins, setMins] = useState("");
  const [secs, setSecs] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  const isRun = RUNS.includes(exercise);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    const body = { exercise };
    if (isRun) {
      const total = Number(mins || 0) * 60 + Number(secs || 0);
      if (!total) return setErr("Enter a time.");
      body.seconds = total;
    } else {
      if (!weight || !reps) return setErr("Enter weight and reps.");
      body.weight = Number(weight);
      body.reps = Number(reps);
    }
    setBusy(true);
    try {
      await api.post("/workouts/entries", body);
      setOk(true);
      setTimeout(onDone, 900);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="qform" onSubmit={submit}>
      <div className="qform__row">
        <label className="qform__label">Exercise</label>
        <select value={exercise} onChange={(e) => setExercise(e.target.value)} className="qform__input">
          <optgroup label="Lifts">{LIFTS.map((x) => <option key={x}>{x}</option>)}</optgroup>
          <optgroup label="Runs">{RUNS.map((x) => <option key={x}>{x}</option>)}</optgroup>
        </select>
      </div>
      {isRun ? (
        <div className="qform__row">
          <label className="qform__label">Time</label>
          <div className="qform__time">
            <input type="number" inputMode="numeric" placeholder="min" className="mono qform__input" value={mins} onChange={(e) => setMins(e.target.value)} />
            <span>:</span>
            <input type="number" inputMode="numeric" placeholder="sec" className="mono qform__input" value={secs} onChange={(e) => setSecs(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="qform__row">
          <label className="qform__label">Weight × Reps</label>
          <div className="qform__time">
            <input type="number" inputMode="decimal" placeholder="lb" className="mono qform__input" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <span>×</span>
            <input type="number" inputMode="numeric" placeholder="reps" className="mono qform__input" value={reps} onChange={(e) => setReps(e.target.value)} />
          </div>
        </div>
      )}
      {err && <p className="qform__err">{err}</p>}
      <button className="qform__submit" disabled={busy || ok}>
        {ok ? "Logged ✓" : busy ? "Saving…" : "Log it"}
      </button>
    </form>
  );
}

function QuickExpense({ onDone }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [subcategory, setSubcategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!amount || Number(amount) <= 0) return setErr("Enter an amount.");
    setBusy(true);
    try {
      await api.post("/finance/expenses", {
        amount: Number(amount),
        category,
        subcategory: subcategory.trim() || null,
      });
      setOk(true);
      setTimeout(onDone, 900);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="qform" onSubmit={submit}>
      <div className="qform__row">
        <label className="qform__label">Amount</label>
        <input type="number" step="0.01" inputMode="decimal" placeholder="0.00" className="mono qform__input" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="qform__row">
        <label className="qform__label">Category</label>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }} className="qform__input">
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="qform__row">
        <label className="qform__label">Subcategory</label>
        <input placeholder="e.g. Groceries (optional)" className="qform__input" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
      </div>
      {err && <p className="qform__err">{err}</p>}
      <button className="qform__submit" disabled={busy || ok}>
        {ok ? "Added ✓" : busy ? "Saving…" : "Add expense"}
      </button>
    </form>
  );
}

function QuickUpskilling({ onDone }) {
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/upskilling/today").then(setLesson).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="qup">
      {loading ? (
        <p className="qup__hint">Loading today's topic…</p>
      ) : !lesson ? (
        <p className="qup__hint">Could not load lesson.</p>
      ) : (
        <>
          <div className="qup__meta mono">{lesson.domain} · {lesson.level}</div>
          <p className="qup__topic">{lesson.topic}</p>
          <p className="qup__hint">Open the Upskilling page for the full lesson and flashcard review.</p>
        </>
      )}
      <button className="qform__submit" onClick={onDone}>Got it</button>
    </div>
  );
}

function HeaderInfo() {
  const [weather, setWeather] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let alive = true;
    api.get("/external/weather").then((d) => alive && setWeather(d)).catch(() => {});
    const wid = setInterval(() => {
      api.get("/external/weather").then((d) => alive && setWeather(d)).catch(() => {});
    }, 600000);
    const tick = setInterval(() => alive && setNow(new Date()), 30000);
    return () => {
      alive = false;
      clearInterval(wid);
      clearInterval(tick);
    };
  }, []);

  return (
    <div className="header-info">
      <div className="header-date">
        <span className="header-date__dow">
          {now.toLocaleDateString("en-US", { weekday: "long" })}
        </span>
        <span className="header-date__full mono">
          {now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </span>
      </div>
      {weather?.temperature != null && (
        <div className="header-weather">
          <span className="header-weather__temp mono">{Math.round(weather.temperature)}°</span>
          <div className="header-weather__meta">
            <span className="header-weather__desc">{weather.description}</span>
            <span className="header-weather__sub mono">
              {weather.wind != null ? `${Math.round(weather.wind)} mph` : ""}
              {weather.humidity != null ? ` · ${weather.humidity}% hum` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
