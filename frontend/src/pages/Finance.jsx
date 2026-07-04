import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EquityHouse from "../components/EquityHouse";
import {
  EmptyState,
  Field,
  Modal,
  Panel,
  Segmented,
  Spinner,
} from "../components/ui";
import { api, fmtMoney, fmtMoneyC } from "../lib/api";
import "./Finance.css";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function Finance() {
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh((r) => r + 1);

  const [auditOpen, setAuditOpen] = useState(false);
  const [due, setDue] = useState(null);

  useEffect(() => {
    api.get("/finance/audit-due").then(setDue).catch(() => {});
  }, [refresh]);

  const monthExists = due && !due.due;

  return (
    <div className="fin">
      <header className="fin__header">
        <div className="fin__title">
          <h1>Finance</h1>
          <p className="fin__sub">Every dollar in, out, and accounted for.</p>
        </div>
        <button
          className="btn btn--primary fin__audit-btn"
          onClick={() => setAuditOpen(true)}
          disabled={monthExists}
          title={
            monthExists
              ? `${due ? MONTHS[due.month - 1] : ""} ${due?.year ?? ""} is already recorded`
              : "Record this month's audit"
          }
        >
          <span aria-hidden>＋</span> New month audit
        </button>
      </header>

      <KpiGrid refresh={refresh} />

      <FinanceCarousel refresh={refresh} onChange={bump} />

      <div className="fin__cols">
        <ExpenseEntry onAdded={bump} />
        <PaycheckEntry onAdded={bump} />
      </div>

      <AuditModal
        open={auditOpen}
        due={due}
        onClose={() => setAuditOpen(false)}
        onDone={() => {
          setAuditOpen(false);
          bump();
        }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- KPIs */
function KpiGrid({ refresh }) {
  const [k, setK] = useState(null);
  useEffect(() => {
    api.get("/finance/kpis").then(setK).catch(() => {});
  }, [refresh]);

  if (!k) {
    return (
      <Panel>
        <Spinner />
      </Panel>
    );
  }

  const b = k.balances;
  const s = k.spend;
  const savingsRate = k.savings_rate;   // null | 0..1
  const savingsMonth = k.savings_month; // null | {year, month}
  const SR_TARGET = 0.30; // 30 % target — matches the design brief

  // Big current-month figures (3 across, 2 rows).
  const big = [
    { label: "Net worth", value: fmtMoney(b.networth) },
    { label: "Total cash", value: fmtMoney(b.total_cash) },
    { label: "Debt", value: fmtMoney(b.debt), tone: "loss" },
    { label: "Investments", value: fmtMoney(b.investments) },
    { label: "401k", value: fmtMoney(b.balance_401k) },
    { label: "Spent this month", value: fmtMoney(s.this_month) },
  ];

  // Smaller comparison stats, one row, separated by | .
  const stats = [
    { label: "Last month", value: fmtMoney(s.last_month) },
    { label: "vs last yr", value: fmtMoney(s.this_month_last_year), delta: pctDelta(s.this_month, s.this_month_last_year), good: s.this_month <= s.this_month_last_year },
    { label: "YTD", value: fmtMoney(s.ytd), delta: pctDelta(s.ytd, s.ytd_last_year), good: s.ytd <= s.ytd_last_year },
    { label: "YTD last yr", value: fmtMoney(s.ytd_last_year) },
    { label: "Rolling 365d", value: fmtMoney(s.rolling_year), delta: pctDelta(s.rolling_year, s.rolling_year_prev), good: s.rolling_year <= s.rolling_year_prev },
    { label: "Home equity", value: fmtMoney(b.home_equity) },
  ];

  return (
    <>
      <Panel title="This month" className="kpi-big-panel">
        <div className="kpi-big">
          {big.map((c) => (
            <div className="kpi-big__cell" key={c.label}>
              <span className="kpi-big__label">{c.label}</span>
              <span
                className="kpi-big__value mono"
                style={c.tone ? { color: `var(--${c.tone})` } : undefined}
              >
                {c.value}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="kpi-strip-panel">
        <div className="kpi-strip">
          {stats.map((st, i) => (
            <div className="kpi-strip__item" key={st.label}>
              <div className="kpi-strip__text">
                <span className="kpi-strip__label">{st.label}</span>
                <span className="kpi-strip__value mono">
                  {st.value}
                  {st.delta != null && (
                    <span className={`kpi-strip__delta ${st.good ? "is-gain" : "is-loss"}`}>
                      {st.delta > 0 ? "+" : ""}
                      {st.delta.toFixed(1)}%
                    </span>
                  )}
                </span>
              </div>
              {i < stats.length - 1 && <span className="kpi-strip__sep" aria-hidden>|</span>}
            </div>
          ))}
        </div>
      </Panel>

      {savingsRate !== null && savingsRate !== undefined && (
        <SavingsRateChip rate={savingsRate} target={SR_TARGET} month={savingsMonth} />
      )}
    </>
  );
}

function pctDelta(now, prev) {
  if (!prev) return null;
  return ((now - prev) / prev) * 100;
}

/* ----------------------------------------- Savings rate chip + chart */
function SavingsRateChip({ rate, target, month }) {
  const pct = Math.round(rate * 100);
  const good = rate >= target;
  const gap = Math.round((rate - target) * 100);
  const monthLabel = month
    ? `${MONTHS[month.month - 1]} ${month.year}`
    : "";

  return (
    <Panel className="sr-panel">
      <div className="sr-row">
        <div className="sr-main">
          <span className="sr-label">Savings rate</span>
          {monthLabel && <span className="sr-month mono">{monthLabel}</span>}
          <span className={`sr-value mono ${good ? "sr-value--good" : "sr-value--bad"}`}>
            {pct}%
          </span>
        </div>
        <div className="sr-meta">
          <span className={`sr-chip ${good ? "sr-chip--good" : "sr-chip--bad"}`}>
            {good ? `+${gap}pp vs target` : `${gap}pp vs target`}
          </span>
          <span className="sr-target mono">target {Math.round(target * 100)}%</span>
        </div>
        <div className="sr-bar-wrap">
          <div className="sr-bar">
            <div
              className={`sr-bar__fill ${good ? "sr-bar__fill--good" : "sr-bar__fill--bad"}`}
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
            <div className="sr-bar__target" style={{ left: `${Math.round(target * 100)}%` }} />
          </div>
          <div className="sr-bar-labels mono">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
      <SavingsRateChart />
    </Panel>
  );
}

function SavingsRateChart() {
  const [data, setData] = useState(null);
  const TARGET = 30;

  useEffect(() => {
    api.get("/finance/savings-rate", { months: 12 }).then(setData).catch(() => {});
  }, []);

  if (!data || data.series.length === 0) return null;

  return (
    <div className="sr-chart">
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={data.series} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barSize={18}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="short" tick={{ fill: "var(--ink-faint)", fontSize: 10 }} />
          <YAxis hide domain={[0, "dataMax + 10"]} />
          <ReferenceLine y={TARGET} stroke="var(--primary)" strokeDasharray="4 3" strokeWidth={1.5} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="rtt">
                  <div className="rtt__label">{label}</div>
                  <div className="rtt__row mono">{d.rate.toFixed(1)}% savings rate</div>
                </div>
              );
            }}
            cursor={{ fill: "var(--surface-2)" }}
          />
          <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
            {data.series.map((d, i) => (
              <Cell key={i} fill={d.rate >= TARGET ? "var(--gain)" : "var(--loss)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="sr-chart-hint mono">Dashed line = 30% target · green = at or above</p>
    </div>
  );
}

/* ------------------------------------------------ 3-slide carousel */
const SLIDES = [
  { key: "equity", label: "Home equity" },
  { key: "report", label: "Expense report" },
  { key: "progress", label: "Progress over time" },
];

function FinanceCarousel({ refresh, onChange }) {
  const [i, setI] = useState(0);
  const go = (d) => setI((v) => (v + d + SLIDES.length) % SLIDES.length);

  return (
    <section className="carousel">
      <div className="carousel__bar">
        <button className="icon-btn carousel__arrow" onClick={() => go(-1)} aria-label="Previous">‹</button>
        <div className="carousel__tabs">
          {SLIDES.map((s, idx) => (
            <button
              key={s.key}
              className={`carousel__tab ${idx === i ? "is-active" : ""}`}
              onClick={() => setI(idx)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button className="icon-btn carousel__arrow" onClick={() => go(1)} aria-label="Next">›</button>
      </div>

      <div className="carousel__stage">
        {i === 0 && <EquityPanel refresh={refresh} />}
        {i === 1 && (
          <>
            <ExpenseReport refresh={refresh} />
            <ExpensesTable refresh={refresh} onChange={onChange} />
          </>
        )}
        {i === 2 && (
          <>
            <ProgressChart refresh={refresh} />
            <MonthlyTable refresh={refresh} />
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------- Expense entry */
const CATEGORIES = [
  "Car", "Dates", "Debt Payments", "Food", "Home",
  "Investments", "Miscellaneous", "Pet", "Subscriptions",
];

function ExpenseEntry({ onAdded }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [subcategory, setSubcategory] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [subs, setSubs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/finance/subcategories", { category }).then(setSubs).catch(() => setSubs([]));
  }, [category]);

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
        recurring,
      });
      setAmount("");
      setSubcategory("");
      setRecurring(false);
      onAdded();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Log an expense">
      <form className="form-grid" onSubmit={submit}>
        <div className="form-row">
          <Field label="Amount">
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              className="mono"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Category">
            <select value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Subcategory" hint="Pick an existing one or type a new one.">
          <input
            list="sublist"
            placeholder="e.g. Groceries"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
          />
          <datalist id="sublist">
            {subs.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <label className="checkrow">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          <span>Recurring expense</span>
          {recurring && <span className="recur-flag" title="Recurring">↻</span>}
        </label>
        {err && <p className="form-err">{err}</p>}
        <button className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : "Add expense"}
        </button>
      </form>
    </Panel>
  );
}

/* -------------------------------------------------------- Paycheck */
function PaycheckEntry({ onAdded }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setBusy(true);
    try {
      await api.post("/finance/paycheck", { amount: Number(amount) });
      setAmount("");
      setOk(true);
      setTimeout(() => setOk(false), 1800);
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Log a paycheck">
      <form className="form-grid paycheck" onSubmit={submit}>
        <Field label="Amount" hint="Raises this month's gain and cash.">
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            className="mono"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <button className="btn btn--primary" disabled={busy}>
          {ok ? "Added ✓" : busy ? "Saving…" : "Add income"}
        </button>
      </form>
    </Panel>
  );
}

/* --------------------------------------------------------- Equity */
function EquityPanel({ refresh }) {
  const [eq, setEq] = useState(null);
  useEffect(() => {
    api.get("/finance/equity").then(setEq).catch(() => {});
  }, [refresh]);
  return (
    <Panel title="Home equity" className="equity-panel">
      {!eq ? (
        <Spinner />
      ) : (
        <EquityHouse percent={eq.percent} homeValue={eq.home_value} homeEquity={eq.home_equity} />
      )}
    </Panel>
  );
}

/* ----------------------------------------------- Expense report (bars) */
function ExpenseReport({ refresh }) {
  const [months, setMonths] = useState(12);
  const [offset, setOffset] = useState(0); // months back from now for the window end
  const [drill, setDrill] = useState(null);
  const [data, setData] = useState(null);

  const end = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - offset);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, [offset]);

  useEffect(() => {
    api
      .get("/finance/expense-report", {
        months,
        end_year: end.year,
        end_month: end.month,
        category: drill || undefined,
      })
      .then(setData)
      .catch(() => setData(null));
  }, [months, end, drill, refresh]);

  const windowLabel = data
    ? `${MONTHS[new Date(data.window.start).getMonth()]} ${new Date(data.window.start).getFullYear()} → ${MONTHS[end.month - 1]} ${end.year}`
    : "";

  return (
    <Panel
      title="Expense report"
      className="report"
      action={
        <div className="report__controls">
          <Segmented
            size="sm"
            options={[{ value: 6, label: "6m" }, { value: 12, label: "12m" }, { value: 24, label: "24m" }]}
            value={months}
            onChange={setMonths}
          />
          <div className="arrows">
            <button className="icon-btn" onClick={() => setOffset((o) => o + months)} aria-label="Earlier">←</button>
            <button className="icon-btn" onClick={() => setOffset((o) => Math.max(0, o - months))} aria-label="Later" disabled={offset === 0}>→</button>
          </div>
        </div>
      }
    >
      <div className="report__top">
        <div className="report__crumbs">
          <button className={`crumb ${!drill ? "is-active" : ""}`} onClick={() => setDrill(null)}>
            All categories
          </button>
          {drill && <span className="crumb__sep">/</span>}
          {drill && <span className="crumb is-active">{drill}</span>}
          {!drill && (
            <select className="report__pick" value="" onChange={(e) => e.target.value && setDrill(e.target.value)}>
              <option value="">drill into…</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
        <div className="report__total">
          <span className="report__totalLabel">Total (excl. inv &amp; debt)</span>
          <span className="report__totalValue mono">
            {data ? fmtMoney(data.total_excluding_inv_debt) : "—"}
          </span>
        </div>
      </div>
      <p className="report__window mono">{windowLabel}</p>

      {!data ? (
        <Spinner />
      ) : data.data.length === 0 ? (
        <EmptyState title="No expenses in this window" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--ink-faint)", fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fill: "var(--ink-faint)", fontSize: 11 }} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
            <Tooltip content={<DarkTooltip money />} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="amount" radius={[5, 5, 0, 0]} cursor={!drill ? "pointer" : "default"}
              onClick={(d) => !drill && d && setDrill(d.label)}>
              {data.data.map((_, i) => (
                <Cell key={i} fill="var(--primary)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      {!drill && <p className="report__hint">Click a bar to drill into its subcategories.</p>}
    </Panel>
  );
}

/* -------------------------------------------- Progress line chart */
const METRICS = [
  { value: "networth", label: "Net worth" },
  { value: "debt", label: "Debt" },
  { value: "expenses", label: "Expenses" },
  { value: "income", label: "Income" },
  { value: "investments", label: "Investments" },
  { value: "401k", label: "401k" },
  { value: "home_equity", label: "Home equity" },
];

function ProgressChart({ refresh }) {
  const [metric, setMetric] = useState("networth");
  const [months, setMonths] = useState(12);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/finance/progress", { metric, months }).then(setData).catch(() => setData(null));
  }, [metric, months, refresh]);

  const trend = data?.trend;
  const isFit = trend?.type === "fit";

  // Add a `trend` value to every point so a single always-rendered <Line>
  // draws the trend: a sloped best-fit line for balances, or a flat line at
  // the mean for flow metrics (expenses/income).
  const chartData = useMemo(() => {
    if (!data?.series) return [];
    if (!trend) return data.series;
    return data.series.map((p, i) => ({
      ...p,
      trend: isFit
        ? trend.intercept + trend.slope_per_month * i
        : trend.average,
    }));
  }, [data, isFit, trend]);

  const rateLabel = isFit
    ? `${trend.slope_per_month >= 0 ? "+" : ""}${fmtMoney(trend.slope_per_month)}/mo`
    : trend
    ? `avg ${fmtMoney(trend.average)}`
    : "";

  // Label drawn on the trend line itself: "average" for the flat line,
  // signed $/month for the best-fit line.
  const lineLabel = isFit
    ? `${trend.slope_per_month >= 0 ? "+" : "−"}${fmtMoney(Math.abs(trend.slope_per_month))}/mo`
    : "average";

  return (
    <Panel
      title="Progress over time"
      className="progress"
      action={
        <div className="report__controls">
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className="report__pick">
            {METRICS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <Segmented
            size="sm"
            options={[
              { value: 6, label: "6m" },
              { value: 12, label: "12m" },
              { value: 24, label: "24m" },
              { value: 0, label: "All" },
            ]}
            value={months}
            onChange={setMonths}
          />
        </div>
      }
    >
      {!data ? (
        <Spinner />
      ) : data.series.length === 0 ? (
        <EmptyState title="No monthly data yet" hint="Add months in the audit popup." />
      ) : (
        <>
          {trend && (
            <div className="progress__trend">
              <span className="progress__trendLabel">
                {isFit ? "Rate of change" : "Average"}
              </span>
              <span
                className="progress__trendValue mono"
                style={
                  isFit
                    ? { color: trend.slope_per_month >= 0 ? "var(--gain)" : "var(--loss)" }
                    : undefined
                }
              >
                {rateLabel}
              </span>
            </div>
          )}
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--ink-faint)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--ink-faint)", fontSize: 11 }} tickFormatter={(v) => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
              <Tooltip content={<DarkTooltip money />} cursor={{ stroke: "var(--border-strong)" }} />
              <Line
                type="linear"
                dataKey="trend"
                name="trend"
                stroke="var(--ink-muted)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                connectNulls
              >
                <LabelList
                  dataKey="trend"
                  content={(props) => (
                    <TrendLabel
                      {...props}
                      text={lineLabel}
                      lastIndex={chartData.length - 1}
                    />
                  )}
                />
              </Line>
              <Line
                type="monotone"
                dataKey="value"
                name="value"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: "var(--primary)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Panel>
  );
}

/* ----------------------------------------------- Expenses table */
function ExpensesTable({ refresh, onChange }) {
  const [rows, setRows] = useState(null);
  const load = () => api.get("/finance/expenses", { limit: 40 }).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, [refresh]);

  const remove = async (id) => {
    await api.del(`/finance/expenses/${id}`);
    load();
    onChange();
  };

  return (
    <Panel title="Recent expenses" className="exp-table">
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No expenses yet" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th className="num">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono dim">{r.date.slice(5)}</td>
                  <td>
                    <span className="cat">
                      {r.category}
                      {r.subcategory && <span className="sub"> · {r.subcategory}</span>}
                      {r.recurring && <span className="recur-flag" title="Recurring">↻</span>}
                    </span>
                  </td>
                  <td className="num mono">{fmtMoneyC(r.amount)}</td>
                  <td className="num">
                    <button className="icon-btn icon-btn--del" onClick={() => remove(r.id)} aria-label="Delete">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------ Monthly finance table */
function MonthlyTable({ refresh }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get("/finance/months").then(setRows).catch(() => setRows([]));
  }, [refresh]);

  return (
    <Panel title="Monthly finance" className="month-table">
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No months recorded" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Net worth</th>
                <th className="num">Cash</th>
                <th className="num">Debt</th>
                <th className="num">Gain</th>
                <th className="num">Loss</th>
                <th className="num">401k</th>
                <th className="num">Equity</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.id}>
                  <td className="mono">{MONTHS[r.month - 1]} {String(r.year).slice(2)}</td>
                  <td className="num mono strong">{fmtMoney(r.networth)}</td>
                  <td className="num mono">{fmtMoney(r.total_cash)}</td>
                  <td className="num mono loss">{fmtMoney(r.debt)}</td>
                  <td className="num mono gain">{fmtMoney(r.monthly_gain)}</td>
                  <td className="num mono loss">{fmtMoney(r.monthly_loss)}</td>
                  <td className="num mono">{fmtMoney(r.balance_401k)}</td>
                  <td className="num mono dim">{fmtMoney(r.home_equity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------------- New-month audit popup */
function AuditModal({ open, due, onClose, onDone }) {
  const [form, setForm] = useState({
    total_cash: "", investments: "", debt: "",
    balance_401k: "", home_equity: "", monthly_gain: "", monthly_loss: "",
  });
  const [busy, setBusy] = useState(false);

  // Prefill from the latest month when opening.
  useEffect(() => {
    if (!open) return;
    api.get("/finance/months").then((rows) => {
      const last = rows[rows.length - 1];
      if (last) {
        setForm((f) => ({
          ...f,
          total_cash: last.total_cash,
          investments: last.investments,
          debt: last.debt,
          balance_401k: last.balance_401k,
          home_equity: last.home_equity,
        }));
      }
    }).catch(() => {});
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/finance/months", {
        year: due.year,
        month: due.month,
        total_cash: Number(form.total_cash || 0),
        investments: Number(form.investments || 0),
        debt: Number(form.debt || 0),
        balance_401k: Number(form.balance_401k || 0),
        home_equity: Number(form.home_equity || 0),
        monthly_gain: Number(form.monthly_gain || 0),
        monthly_loss: Number(form.monthly_loss || 0),
      });
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const networth =
    Number(form.total_cash || 0) + Number(form.investments || 0) +
    Number(form.balance_401k || 0) - Number(form.debt || 0);

  return (
    <Modal open={open} onClose={onClose} title={`Audit · ${due ? MONTHS[due.month - 1] : ""} ${due?.year ?? ""}`} wide>
      <form className="form-grid" onSubmit={submit}>
        <p className="audit-intro">Confirm your account balances to open the new month. Net worth is computed automatically.</p>
        <div className="audit-grid">
          {[
            ["total_cash", "Total cash"],
            ["investments", "Investments"],
            ["debt", "Debt"],
            ["balance_401k", "401k balance"],
            ["home_equity", "Home equity"],
            ["monthly_gain", "Gain so far"],
            ["monthly_loss", "Loss so far"],
          ].map(([k, label]) => (
            <Field key={k} label={label}>
              <input type="number" step="0.01" inputMode="decimal" className="mono" value={form[k]} onChange={set(k)} placeholder="0.00" />
            </Field>
          ))}
        </div>
        <div className="audit-networth">
          <span>Net worth (computed)</span>
          <span className="mono strong">{fmtMoney(networth)}</span>
        </div>
        <button className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : "Record month"}
        </button>
      </form>
    </Modal>
  );
}

/* ----------------------------------------------- shared tooltip */
// Draws a single label at the end of the trend line.
function TrendLabel({ x, y, index, lastIndex, text }) {
  if (index !== lastIndex || x == null || y == null) return null;
  return (
    <text
      x={x}
      y={y - 8}
      textAnchor="end"
      className="mono"
      fontSize={12}
      fontWeight={600}
      fill="var(--ink-muted)"
    >
      {text}
    </text>
  );
}

function DarkTooltip({ active, payload, label, money }) {
  if (!active || !payload?.length) return null;
  // Hide the computed trend series; only show the real value.
  const rows = payload.filter((p) => p.dataKey !== "trend");
  if (!rows.length) return null;
  return (
    <div className="rtt">
      <div className="rtt__label">{label}</div>
      {rows.map((p, i) => (
        <div key={i} className="rtt__row mono">
          {money ? fmtMoney(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}
