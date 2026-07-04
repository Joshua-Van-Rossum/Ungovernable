# DESIGN.md — Ungovernable

## Theme

Dark personal-terminal. A near-black true-neutral surface with a single warm ember/coral accent. Charts and signal colors (gain green, loss ember) carry meaning; the surface stays out of the way. Evening, focused, glance-and-log.

## Color (OKLCH)

Defined as CSS custom properties in `frontend/src/styles/tokens.css`.

| Role | Token | OKLCH | Use |
|---|---|---|---|
| Background | `--bg` | `oklch(0.17 0 0)` | App canvas (true neutral, no tint) |
| Surface | `--surface` | `oklch(0.21 0.004 240)` | Panels, cards |
| Surface raised | `--surface-2` | `oklch(0.25 0.005 240)` | Inputs, hover, nested |
| Border | `--border` | `oklch(0.30 0.006 240)` | Hairlines |
| Ink | `--ink` | `oklch(0.97 0 0)` | Primary text |
| Ink muted | `--ink-muted` | `oklch(0.72 0.008 240)` | Secondary text (≥4.5:1 on bg) |
| Ink faint | `--ink-faint` | `oklch(0.56 0.008 240)` | Labels, axis |
| Primary (ember) | `--primary` | `oklch(0.66 0.18 36)` | Brand, interactive, focus |
| Primary hover | `--primary-hi` | `oklch(0.72 0.17 38)` | Hover |
| Gain | `--gain` | `oklch(0.74 0.16 155)` | Positive money, done, on-track |
| Loss | `--loss` | `oklch(0.64 0.20 25)` | Negative money, behind |
| Warn | `--warn` | `oklch(0.80 0.14 85)` | Recurring flag, audit due |

Commit-grid ramp uses 5 steps of `--gain` chroma/lightness from empty `--surface-2` to full `--gain`.

## Typography

- **UI / body**: `Inter` (variable), system fallback. 15px base, 1.5 line-height.
- **Numerals / data**: `"Geist Mono", ui-monospace, "SF Mono", monospace` — tabular figures for all money, stats, table cells, axis labels. This is the data voice.
- Pairing is contrast-axis safe: humanist sans (Inter) + mono (Geist Mono).
- Headings: Inter, weight 600–700, letter-spacing -0.02em. No display sizes above ~2.25rem — this is a tool, not a poster.
- All numeric values use `font-variant-numeric: tabular-nums`.

## Components

- **Stat / KPI**: label (faint, uppercase-free) + big tabular-mono value + optional delta chip (gain/loss colored). No gradient, no giant hero metric.
- **Panel**: `--surface`, 1px `--border`, 14px radius, 16–20px padding. Section title row with optional action on the right.
- **Habit row**: checkbox or numeric input + label + streak hint. ≥44px tap target.
- **Commit grid**: 7-row × N-week grid of rounded cells, color by intensity, tooltip on hover/tap.
- **Table**: mono cells, sticky header, zebra via `--surface-2` at low alpha. Collapses to stacked label/value cards under 640px.
- **Chart**: thin lines, 1px grid in `--border`, dashed average/target lines with a small value callout pill. Tooltips on hover.
- **Equity house**: SVG rectangle + triangle roof; equity % fills from the bottom in `--gain`, remainder in `--surface-2`, with a callout line.
- **Modal / sheet**: native `<dialog>`, backdrop blur kept subtle. Mobile nav is a slide-in sheet from the hamburger.

## Layout

- App shell: sticky top bar (hamburger + title + quick info ticker) over a content column, `max-width: 1200px`, centered, 16–24px gutters.
- Dashboard uses CSS grid: `repeat(auto-fit, minmax(280px, 1fr))` for stat/panel rows; never fixed identical card grids.
- Mobile-first; flex for 1D rows, grid for 2D. Tables and multi-column panels stack under 640px.
- z-index scale tokens: `--z-dropdown / --z-sticky / --z-backdrop / --z-modal / --z-toast / --z-tooltip`.

## Motion

- Ease-out-expo for entrances; 150–240ms. Number counters animate up on first mount.
- Commit-grid and list items stagger in. Charts draw their line once on mount.
- Every animation has a `prefers-reduced-motion: reduce` crossfade/instant fallback.
