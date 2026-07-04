import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EmptyState,
  Field,
  Modal,
  Panel,
  Segmented,
  Spinner,
} from "../components/ui";
import { api, fmtTime } from "../lib/api";
import "./Workouts.css";

const LIFT_LABELS = { bench: "Bench", squat: "Squat", "pull-ups": "Pull-ups" };
const RUN_LABELS = { "1mile": "1 mile", "5k": "5k" };

const LIFTS = ["bench", "squat", "pull-ups"];
const RUNS = ["1mile", "2mile", "3mile", "4mile", "5mile", "5k", "10k", "15k"];
const ALL = [...LIFTS, ...RUNS];

export default function Workouts() {
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh((r) => r + 1);

  return (
    <div className="wo">
      <div className="wo__title">
        <h1>Workouts</h1>
        <p className="wo__sub">Lift heavier. Run faster. Hit 12/31.</p>
      </div>

      <div className="wo__cols">
        <LogEntry onAdded={bump} />
        <Goals refresh={refresh} onChange={bump} />
      </div>

      <VolumeTrends refresh={refresh} />
      <ExerciseProgress refresh={refresh} />
      <History refresh={refresh} onChange={bump} />
    </div>
  );
}

/* ----------------------------------------------------- Log entry */
function LogEntry({ onAdded }) {
  const [exercise, setExercise] = useState("bench");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [mins, setMins] = useState("");
  const [secs, setSecs] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const isRun = RUNS.includes(exercise);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    const body = { exercise, date };
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
      setWeight(""); setReps(""); setMins(""); setSecs("");
      onAdded();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Log a set">
      <form className="form-grid" onSubmit={submit}>
        <div className="form-row">
          <Field label="Exercise">
            <select value={exercise} onChange={(e) => setExercise(e.target.value)}>
              <optgroup label="Lifts">
                {LIFTS.map((x) => <option key={x}>{x}</option>)}
              </optgroup>
              <optgroup label="Runs">
                {RUNS.map((x) => <option key={x}>{x}</option>)}
              </optgroup>
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mono" />
          </Field>
        </div>

        {isRun ? (
          <Field label="Time" hint="Your finishing time.">
            <div className="time-input">
              <input type="number" inputMode="numeric" placeholder="min" className="mono" value={mins} onChange={(e) => setMins(e.target.value)} />
              <span>:</span>
              <input type="number" inputMode="numeric" placeholder="sec" className="mono" value={secs} onChange={(e) => setSecs(e.target.value)} />
            </div>
          </Field>
        ) : (
          <div className="form-row">
            <Field label="Weight (lb)">
              <input type="number" inputMode="decimal" className="mono" placeholder="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </Field>
            <Field label="Reps" hint="Best set only.">
              <input type="number" inputMode="numeric" className="mono" placeholder="0" value={reps} onChange={(e) => setReps(e.target.value)} />
            </Field>
          </div>
        )}
        {err && <p className="form-err">{err}</p>}
        <button className="btn btn--primary" disabled={busy}>{busy ? "Saving…" : "Log it"}</button>
      </form>
    </Panel>
  );
}

/* --------------------------------------------------------- Goals */
function Goals({ refresh, onChange }) {
  const [goals, setGoals] = useState(null);
  const [edit, setEdit] = useState(null);

  useEffect(() => {
    api.get("/workouts/goals").then(setGoals).catch(() => setGoals([]));
  }, [refresh]);

  const byExercise = useMemo(
    () => Object.fromEntries((goals || []).map((g) => [g.exercise, g])),
    [goals]
  );

  const tracked = ["bench", "squat", "pull-ups", "1mile", "5k"];

  return (
    <Panel
      title="Goals · by Dec 31"
      action={<button className="btn btn--ghost btn--sm" onClick={() => setEdit({})}>edit</button>}
    >
      {!goals ? (
        <Spinner />
      ) : (
        <ul className="goals">
          {tracked.map((ex) => {
            const g = byExercise[ex];
            return (
              <li key={ex} className="goal">
                <span className="goal__name">{ex}</span>
                <span className="goal__target mono">{goalLabel(ex, g)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <GoalEditor open={!!edit} goals={byExercise} tracked={tracked} onClose={() => setEdit(null)} onSaved={() => { onChange(); setEdit(null); }} />
    </Panel>
  );
}

function goalLabel(ex, g) {
  if (!g) return "—";
  if (RUNS.includes(ex)) return fmtTime(g.target_seconds);
  return `${g.target_weight ?? 0} × ${g.target_reps ?? 0}`;
}

function GoalEditor({ open, goals, tracked, onClose, onSaved }) {
  const [draft, setDraft] = useState({});
  useEffect(() => {
    if (open) setDraft({});
  }, [open]);

  const save = async (ex) => {
    const d = draft[ex] || {};
    const g = goals[ex] || {};
    const body = { exercise: ex };
    if (RUNS.includes(ex)) {
      const min = d.min ?? Math.floor((g.target_seconds || 0) / 60);
      const sec = d.sec ?? (g.target_seconds || 0) % 60;
      body.target_seconds = Number(min) * 60 + Number(sec);
    } else {
      body.target_weight = Number(d.weight ?? g.target_weight ?? 0);
      body.target_reps = Number(d.reps ?? g.target_reps ?? 0);
    }
    await api.put("/workouts/goals", body);
  };

  const saveAll = async (e) => {
    e.preventDefault();
    for (const ex of tracked) await save(ex);
    onSaved();
  };

  const set = (ex, k) => (e) =>
    setDraft((d) => ({ ...d, [ex]: { ...d[ex], [k]: e.target.value } }));

  return (
    <Modal open={open} onClose={onClose} title="Edit goals" wide>
      <form className="form-grid" onSubmit={saveAll}>
        {tracked.map((ex) => {
          const g = goals[ex] || {};
          const run = RUNS.includes(ex);
          return (
            <div key={ex} className="goal-edit">
              <span className="goal-edit__name">{ex}</span>
              {run ? (
                <div className="time-input">
                  <input type="number" placeholder="min" className="mono" defaultValue={Math.floor((g.target_seconds || 0) / 60)} onChange={set(ex, "min")} />
                  <span>:</span>
                  <input type="number" placeholder="sec" className="mono" defaultValue={(g.target_seconds || 0) % 60} onChange={set(ex, "sec")} />
                </div>
              ) : (
                <div className="goal-edit__lift">
                  <input type="number" placeholder="weight" className="mono" defaultValue={g.target_weight ?? ""} onChange={set(ex, "weight")} />
                  <span>×</span>
                  <input type="number" placeholder="reps" className="mono" defaultValue={g.target_reps ?? ""} onChange={set(ex, "reps")} />
                </div>
              )}
            </div>
          );
        })}
        <button className="btn btn--primary">Save goals</button>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------ Volume trend sparklines */
function VolumeTrends({ refresh }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/workouts/volume").then(setData).catch(() => {});
  }, [refresh]);

  if (!data) return null;

  const lifts = Object.entries(LIFT_LABELS).map(([ex, label]) => ({ ex, label, ...data[ex] }));
  const runs = Object.entries(RUN_LABELS).map(([ex, label]) => ({ ex, label, ...data[ex] }));
  const all = [...lifts, ...runs].filter((e) => e.series?.length > 0);

  if (all.length === 0) return null;

  return (
    <Panel title="Monthly volume">
      <p className="vol__hint mono">Best 1RM per month for lifts · best time for runs</p>
      <div className="vol__grid">
        {all.map(({ ex, label, series, is_run }) => {
          const chartData = series.map((s) => ({ m: s.month.slice(5), v: s.value }));
          const latest = series[series.length - 1];
          const prev = series[series.length - 2];
          const delta = latest && prev ? latest.value - prev.value : null;
          // For runs: lower is better — flip the delta sign for color
          const improving = delta !== null ? (is_run ? delta < 0 : delta > 0) : null;

          return (
            <div key={ex} className="vol__card">
              <div className="vol__card-head">
                <span className="vol__name">{label}</span>
                <span className="vol__latest mono">
                  {latest ? (is_run ? fmtTime(latest.value) : `${latest.value} lb`) : "—"}
                  {delta !== null && (
                    <span className={`vol__delta ${improving ? "vol__delta--up" : "vol__delta--dn"}`}>
                      {is_run
                        ? (delta < 0 ? `−${fmtTime(Math.abs(delta))}` : `+${fmtTime(delta)}`)
                        : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
                    </span>
                  )}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={64}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <XAxis dataKey="m" hide />
                  <YAxis hide domain={["auto", "auto"]} reversed={is_run} />
                  <Tooltip
                    content={({ active, payload, label: lbl }) => {
                      if (!active || !payload?.length) return null;
                      const v = payload[0].value;
                      return (
                        <div className="rtt">
                          <div className="rtt__label">{lbl}</div>
                          <div className="rtt__row mono">{is_run ? fmtTime(v) : `${v} lb`}</div>
                        </div>
                      );
                    }}
                    cursor={{ stroke: "var(--border-strong)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={improving === false ? "var(--loss)" : "var(--primary)"}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ------------------------------------------- Per-exercise progress */
function ExerciseProgress({ refresh }) {
  const [exercise, setExercise] = useState("bench");
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/workouts/progress/${exercise}`).then(setData).catch(() => setData(null));
  }, [exercise, refresh]);

  const chart = useMemo(() => {
    if (!data) return [];
    return data.series.map((s) => ({
      date: s.date.slice(5),
      value: s.value,
    }));
  }, [data]);

  const isRun = data?.is_run;

  return (
    <Panel
      title="Progress by exercise"
      className="exprog"
      action={
        <select value={exercise} onChange={(e) => setExercise(e.target.value)} className="report__pick">
          <optgroup label="Lifts">{LIFTS.map((x) => <option key={x}>{x}</option>)}</optgroup>
          <optgroup label="Runs">{RUNS.map((x) => <option key={x}>{x}</option>)}</optgroup>
        </select>
      }
    >
      <p className="exprog__metric mono">
        {isRun ? "Finishing time (lower is better)" : "Estimated 1-rep max (Epley)"}
      </p>
      {!data ? (
        <Spinner />
      ) : chart.length === 0 ? (
        <EmptyState title={`No ${exercise} entries yet`} hint="Log a set above to start the line." />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--ink-faint)", fontSize: 11 }} />
            <YAxis
              tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
              reversed={isRun}
              domain={["auto", "auto"]}
              tickFormatter={(v) => (isRun ? fmtTime(v) : v)}
            />
            <Tooltip content={<WoTooltip isRun={isRun} />} cursor={{ stroke: "var(--border-strong)" }} />
            {data.pace && (
              <ReferenceLine
                y={data.pace.pace_today}
                stroke="var(--warn)"
                strokeDasharray="5 4"
                label={{
                  value: `pace ${isRun ? fmtTime(data.pace.pace_today) : data.pace.pace_today}`,
                  fill: "var(--warn)",
                  fontSize: 11,
                  position: "insideTopRight",
                }}
              />
            )}
            {data.pace && (
              <ReferenceLine
                y={data.pace.target_value}
                stroke="var(--gain)"
                strokeDasharray="2 3"
                label={{
                  value: `goal ${isRun ? fmtTime(data.pace.target_value) : data.pace.target_value}`,
                  fill: "var(--gain)",
                  fontSize: 11,
                  position: "insideBottomRight",
                }}
              />
            )}
            <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
      {data?.pace && (
        <p className="exprog__hint">
          Dashed amber = where you should be today to hit the 12/31 goal, based on your trajectory.
        </p>
      )}
    </Panel>
  );
}

function WoTooltip({ active, payload, label, isRun }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="rtt">
      <div className="rtt__label">{label}</div>
      <div className="rtt__row mono">{isRun ? fmtTime(v) : v}</div>
    </div>
  );
}

/* --------------------------------------------------------- History */
function History({ refresh, onChange }) {
  const [rows, setRows] = useState(null);
  const load = () => api.get("/workouts/entries", { limit: 200 }).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, [refresh]);

  const remove = async (id) => {
    await api.del(`/workouts/entries/${id}`);
    load();
    onChange();
  };

  return (
    <Panel title="History" className="wo-history">
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No workouts logged yet" />
      ) : (
        <div className="wo-history__scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Group</th>
                <th>Exercise</th>
                <th className="num">Result</th>
                <th className="num">est 1RM</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono dim">{r.date.slice(5)}</td>
                  <td><span className={`grp grp--${r.group.toLowerCase()}`}>{r.group}</span></td>
                  <td>{r.exercise}</td>
                  <td className="num mono">
                    {r.seconds != null ? fmtTime(r.seconds) : `${r.weight} × ${r.reps}`}
                  </td>
                  <td className="num mono dim">{r.est_1rm ?? "—"}</td>
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
