import { useMemo, useState } from "react";
import "./CommitGrid.css";

// GitHub-style contribution grid. `cells` = [{date, count}] ascending.
function intensity(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

export default function CommitGrid({ cells = [] }) {
  const [hover, setHover] = useState(null);

  const weeks = useMemo(() => {
    if (!cells.length) return [];
    // Pad the front so the first column starts on Sunday.
    const first = new Date(cells[0].date + "T00:00:00");
    const pad = first.getDay();
    const padded = [...Array(pad).fill(null), ...cells];
    const cols = [];
    for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7));
    return cols;
  }, [cells]);

  const monthLabels = useMemo(() => {
    const labels = [];
    let last = -1;
    weeks.forEach((w, i) => {
      const firstReal = w.find(Boolean);
      if (!firstReal) return;
      const m = new Date(firstReal.date + "T00:00:00").getMonth();
      if (m !== last) {
        labels.push({ col: i, label: new Date(firstReal.date + "T00:00:00").toLocaleString("en-US", { month: "short" }) });
        last = m;
      }
    });
    return labels;
  }, [weeks]);

  return (
    <div className="cgrid">
      <div className="cgrid__scroll">
        <div className="cgrid__months">
          {monthLabels.map((m) => (
            <span key={m.col} className="cgrid__month" style={{ gridColumn: m.col + 1 }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="cgrid__cols">
          {weeks.map((w, ci) => (
            <div className="cgrid__col" key={ci}>
              {Array.from({ length: 7 }).map((_, ri) => {
                const cell = w[ri];
                if (!cell) return <span key={ri} className="cgrid__cell is-empty" />;
                return (
                  <span
                    key={ri}
                    className="cgrid__cell"
                    data-level={intensity(cell.count)}
                    onMouseEnter={() => setHover(cell)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(cell)}
                    tabIndex={0}
                    aria-label={`${cell.count} visits on ${cell.date}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="cgrid__legend">
        {hover ? (
          <span className="mono">
            {hover.count} visit{hover.count === 1 ? "" : "s"} ·{" "}
            {new Date(hover.date + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        ) : (
          <span className="cgrid__legendRamp">
            Less
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className="cgrid__cell cgrid__cell--legend" data-level={l} />
            ))}
            More
          </span>
        )}
      </div>
    </div>
  );
}
