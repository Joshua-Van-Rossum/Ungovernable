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

function HamburgerIcon({ open }) {
  return (
    <svg className={`hamburger-icon ${open ? "hamburger-icon--open" : ""}`} viewBox="0 0 20 20" width="20" height="20" aria-hidden>
      <rect className="hb-bar hb-bar--1" x="2" y="5" width="16" height="1.8" rx="0.9" fill="currentColor" />
      <rect className="hb-bar hb-bar--2" x="2" y="9.1" width="16" height="1.8" rx="0.9" fill="currentColor" />
      <rect className="hb-bar hb-bar--3" x="2" y="13.2" width="16" height="1.8" rx="0.9" fill="currentColor" />
    </svg>
  );
}

export default function AppShell() {
  const [me, setMe] = useState(null);
  const [sheet, setSheet] = useState(null); // "workout" | "expense" | "habits" | null
  const [navOpen, setNavOpen] = useState(false);

  // Record a visit once per app open (powers the commit grid).
  useEffect(() => {
    api.post("/dashboard/visit").catch(() => {});
    api.get("/me").then(setMe).catch(() => {});
  }, []);

  // Close nav on route change
  const closeNav = () => setNavOpen(false);

  return (
    <div className="shell">
      {/* Desktop sidebar */}
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
              <span className="nav__icon mono" aria-hidden>{n.icon}</span>
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
          {/* Mobile hamburger — only rendered via CSS on small screens */}
          <button
            className="topbar__hamburger"
            onClick={() => setNavOpen((o) => !o)}
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
          >
            <HamburgerIcon open={navOpen} />
          </button>
          <HeaderInfo />
        </header>

        {/* Mobile nav overlay */}
        {navOpen && (
          <div className="mobile-nav-backdrop" onClick={closeNav} aria-hidden />
        )}
        <nav className={`mobile-nav ${navOpen ? "mobile-nav--open" : ""}`} aria-label="Main navigation">
          <div className="mobile-nav__head">
            <Logo />
            <button className="icon-btn" onClick={closeNav} aria-label="Close menu">✕</button>
          </div>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `mobile-nav__item ${isActive ? "is-active" : ""}`}
              onClick={closeNav}
            >
              <span className="mobile-nav__icon mono" aria-hidden>{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
          <div className="mobile-nav__who">
            <span className="shell__whoDot" />
            <span className="mono">{me?.name ?? "…"}</span>
          </div>
        </nav>

        <main className="content">
          <Outlet />
        </main>
      </div>

      {/* Mobile quick-log bottom bar */}
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
      <button className="qbar__btn qbar__btn--accent" onClick={() => onOpen("habits")}>
        <span className="qbar__icon mono" aria-hidden>✓</span>
        <span className="qbar__label">Habits</span>
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

  const titles = { workout: "Log a set", expense: "Log an expense", habits: "Daily habits" };

  return (
    <div className="qsheet-backdrop" ref={ref} onClick={onBackdrop}>
      <div className="qsheet" role="dialog" aria-modal="true" aria-label={titles[active]}>
        <div className="qsheet__handle" />
        <header className="qsheet__head">
          <h3>{titles[active]}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="qsheet__body">
          {active === "workout" && <QuickWorkout onDone={onClose} />}
          {active === "expense" && <QuickExpense onDone={onClose} />}
          {active === "habits"  && <QuickHabits />}
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

function QuickHabits() {
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState({});

  useEffect(() => {
    api.get("/habits").then(setHabits).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggle = async (habit) => {
    if (logging[habit.id]) return;
    setLogging((p) => ({ ...p, [habit.id]: true }));
    const wasDone = habit.today_done;
    // Optimistic update
    setHabits((prev) =>
      prev.map((h) => h.id === habit.id ? { ...h, today_done: !wasDone } : h)
    );
    try {
      if (!wasDone) {
        await api.post("/habits/log", { habit_id: habit.id, value: 1 });
      }
      // No un-log endpoint; leave optimistic state if already done
    } catch {
      // Revert on failure
      setHabits((prev) =>
        prev.map((h) => h.id === habit.id ? { ...h, today_done: wasDone } : h)
      );
    } finally {
      setLogging((p) => ({ ...p, [habit.id]: false }));
    }
  };

  if (loading) return <p className="qup__hint">Loading habits…</p>;
  if (!habits.length) return <p className="qup__hint">No habits set up yet. Add them on the Dashboard.</p>;

  const done = habits.filter((h) => h.today_done).length;

  return (
    <div className="qhab">
      <div className="qhab__progress">
        <div className="qhab__prog-bar">
          <div
            className="qhab__prog-fill"
            style={{ width: `${habits.length ? (done / habits.length) * 100 : 0}%` }}
          />
        </div>
        <span className="qhab__prog-label mono">{done}/{habits.length}</span>
      </div>
      <ul className="qhab__list">
        {habits.map((h) => (
          <li key={h.id}>
            <button
              className={`qhab__item ${h.today_done ? "qhab__item--done" : ""}`}
              onClick={() => toggle(h)}
              disabled={logging[h.id]}
            >
              <span className={`qhab__check ${h.today_done ? "qhab__check--done" : ""}`} aria-hidden>
                {h.today_done ? "✓" : "○"}
              </span>
              <span className="qhab__name">{h.name}</span>
              {h.streak > 1 && (
                <span className="qhab__streak mono">{h.streak}🔥</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {done === habits.length && habits.length > 0 && (
        <p className="qhab__all-done">All done today! 🎉</p>
      )}
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

  const shortDate = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="header-info">
      <div className="header-date">
        {/* Desktop: full weekday name */}
        <span className="header-date__dow header-date__dow--desktop">
          {now.toLocaleDateString("en-US", { weekday: "long" })}
        </span>
        {/* Mobile: compact "Jul 4" */}
        <span className="header-date__dow header-date__dow--mobile mono">{shortDate}</span>
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
