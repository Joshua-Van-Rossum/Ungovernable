import { fmtMoney } from "../lib/api";
import "./EquityHouse.css";

// A simple house (rectangle body + triangle roof). The bottom `percent`% of the
// whole silhouette is filled bright (equity); the rest is dim.
export default function EquityHouse({ percent = 0, homeValue, homeEquity }) {
  const p = Math.max(0, Math.min(100, percent));
  // Silhouette spans y=10 (roof apex) to y=150 (floor). Fill from the bottom up.
  const top = 10;
  const bottom = 150;
  const fillY = bottom - ((bottom - top) * p) / 100;
  const clipId = "equityFill";

  return (
    <div className="house">
      <svg viewBox="0 0 200 170" className="house__svg" role="img" aria-label={`${p}% home equity`}>
        <defs>
          <clipPath id={clipId}>
            {/* roof */}
            <polygon points="100,10 180,70 20,70" />
            {/* body */}
            <rect x="32" y="70" width="136" height="80" />
          </clipPath>
        </defs>

        {/* Dim base (the whole house) */}
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width="200" height="170" fill="var(--surface-2)" />
          {/* Bright equity fill rising from the floor */}
          <rect x="0" y={fillY} width="200" height={bottom - fillY} fill="var(--gain)" />
          <rect x="0" y={fillY} width="200" height="2.5" fill="var(--gain-hi, var(--gain))" opacity="0.9" />
        </g>

        {/* Outline */}
        <polygon points="100,10 180,70 20,70" fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeLinejoin="round" />
        <rect x="32" y="70" width="136" height="80" fill="none" stroke="var(--border-strong)" strokeWidth="2" />
        {/* door */}
        <rect x="86" y="110" width="28" height="40" fill="none" stroke="var(--border-strong)" strokeWidth="1.5" />

        {/* fill level callout line */}
        <line x1="168" y1={fillY} x2="196" y2={fillY} stroke="var(--ink)" strokeWidth="1" strokeDasharray="2 2" />
      </svg>

      <div className="house__callout">
        <span className="house__pct mono">{p.toFixed(1)}%</span>
        <span className="house__label">equity</span>
        <div className="house__nums mono">
          <span>{fmtMoney(homeEquity)} of {fmtMoney(homeValue)}</span>
        </div>
      </div>
    </div>
  );
}
