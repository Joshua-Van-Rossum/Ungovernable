import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";
import { EmptyState, Modal, Panel, Spinner, Stat } from "../components/ui";
import { api } from "../lib/api";
import "./Upskilling.css";

// ---------------------------------------------------------------------------
// Markdown renderer — handles **bold**, `code`, numbered lists, bullet lists
// ---------------------------------------------------------------------------
function SimpleMarkdown({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      elements.push(<br key={key++} />);
      continue;
    }
    const rendered = renderInline(line, key++);
    if (/^\d+\.\s/.test(line)) {
      elements.push(<div key={key++} className="md-li md-li--num">{renderInline(line.replace(/^\d+\.\s/, ""), key++)}</div>);
    } else if (/^[-•]\s/.test(line)) {
      elements.push(<div key={key++} className="md-li">{renderInline(line.replace(/^[-•]\s/, ""), key++)}</div>);
    } else if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
      elements.push(<p key={key++} className="md-bold-line">{renderInline(line, key++)}</p>);
    } else {
      elements.push(<p key={key++} className="md-p">{rendered}</p>);
    }
  }
  return <div className="md">{elements}</div>;
}

function renderInline(text, baseKey) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${baseKey}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${baseKey}-${i}`} className="md-code">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

// ---------------------------------------------------------------------------
// Level badge
// ---------------------------------------------------------------------------
const LEVEL_COLOR = {
  intro: "var(--gain)",
  intermediate: "var(--primary)",
  advanced: "var(--loss)",
  senior: "var(--ink-muted)",
};

function LevelBadge({ level }) {
  return (
    <span className="level-badge" style={{ color: LEVEL_COLOR[level] || "var(--ink-muted)" }}>
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Flashcard component — flip on click
// ---------------------------------------------------------------------------
function Flashcard({ card, onRate, isLast }) {
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState(false);

  const handleRate = (r) => {
    setRated(true);
    onRate(card.id, r);
  };

  return (
    <div className={`fc ${flipped ? "fc--flipped" : ""} ${rated ? "fc--rated" : ""}`}>
      <div className="fc__inner" onClick={() => !rated && setFlipped((f) => !f)}>
        <div className="fc__front">
          <span className="fc__side-label mono">Question</span>
          <p className="fc__text">{card.question}</p>
          <span className="fc__tap-hint">tap to reveal answer</span>
        </div>
        <div className="fc__back">
          <span className="fc__side-label mono">Answer</span>
          <p className="fc__text">{card.answer}</p>
        </div>
      </div>
      {flipped && !rated && (
        <div className="fc__ratings">
          <span className="fc__rate-label">How well did you know this?</span>
          <div className="fc__rate-btns">
            <button className="fc__rate fc__rate--again" onClick={() => handleRate(0)}>Again</button>
            <button className="fc__rate fc__rate--hard" onClick={() => handleRate(1)}>Hard</button>
            <button className="fc__rate fc__rate--good" onClick={() => handleRate(2)}>Good</button>
            <button className="fc__rate fc__rate--easy" onClick={() => handleRate(3)}>Easy</button>
          </div>
        </div>
      )}
      {rated && (
        <div className="fc__done">
          {isLast ? "Session complete!" : "Next card →"}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// YouTube daily picks panel
// ---------------------------------------------------------------------------
function YouTubePanel() {
  const [videos, setVideos] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get("/external/youtube", { limit: 5 })
      .then((d) => setVideos(d.videos || []))
      .catch(() => setErr(true));
  }, []);

  if (err) return null;

  return (
    <Panel title="Daily picks">
      {!videos ? (
        <Spinner />
      ) : videos.length === 0 ? (
        <EmptyState title="No videos fetched" hint="YouTube RSS may be temporarily unavailable." />
      ) : (
        <div className="yt-list">
          {videos.map((v) => (
            <a key={v.video_id} href={v.url} target="_blank" rel="noreferrer" className="yt-card">
              {v.thumbnail && (
                <img className="yt-card__thumb" src={v.thumbnail} alt="" loading="lazy" />
              )}
              <div className="yt-card__info">
                <span className="yt-card__channel mono">{v.channel}</span>
                <span className="yt-card__title">{v.title}</span>
                {v.published && (
                  <span className="yt-card__date mono">
                    {new Date(v.published).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
              <span className="yt-card__go mono">▶</span>
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Domain bar chart
// ---------------------------------------------------------------------------
function DomainChart({ byDomain }) {
  if (!byDomain || Object.keys(byDomain).length === 0) return null;
  const data = Object.entries(byDomain)
    .map(([domain, count]) => ({ domain: domain.split(" ")[0], count }))
    .sort((a, b) => b.count - a.count);

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 24, left: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="domain" tick={{ fontSize: 10, fill: "var(--ink-faint)" }} interval={0} angle={-30} textAnchor="end" />
        <YAxis hide allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          formatter={(v) => [v, "lessons"]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === 0 ? "var(--primary)" : "var(--surface-3)"} stroke="var(--border)" strokeWidth={1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Upskilling() {
  const [lesson, setLesson] = useState(null);
  const [lessonLoading, setLessonLoading] = useState(true);

  const [queue, setQueue] = useState(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [ratedCount, setRatedCount] = useState(0);

  const [progress, setProgress] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState(null);
  const [pastLesson, setPastLesson] = useState(null);
  const [pastLessonOpen, setPastLessonOpen] = useState(false);

  // Streak habit data (existing system)
  const [habitProgress, setHabitProgress] = useState(null);

  useEffect(() => {
    // Load today's lesson
    api.get("/upskilling/today")
      .then(setLesson)
      .catch(() => {})
      .finally(() => setLessonLoading(false));

    // Load progress stats
    api.get("/upskilling/progress").then(setProgress).catch(() => {});

    // Load existing habit progress for the streak chart
    api.get("/habits").then((hs) => {
      const h = hs.find((x) => x.name.toLowerCase().includes("upskill"));
      if (h) {
        api.get(`/habits/${h.id}/progress`, { days: 90 }).then(setHabitProgress).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const startReview = useCallback(() => {
    setQueueLoading(true);
    api.get("/upskilling/review")
      .then((d) => {
        setQueue(d.cards || []);
        setCardIndex(0);
        setRatedCount(0);
        setReviewMode(true);
      })
      .catch(() => {})
      .finally(() => setQueueLoading(false));
  }, []);

  const handleRate = useCallback((cardId, rating) => {
    api.post(`/upskilling/review/${cardId}`, { rating }).catch(() => {});
    setRatedCount((n) => n + 1);
    setTimeout(() => {
      setCardIndex((i) => i + 1);
    }, 600);
  }, []);

  const openHistory = () => {
    setHistoryOpen(true);
    if (!history) {
      api.get("/upskilling/history", { limit: 30 }).then((d) => setHistory(d.lessons)).catch(() => {});
    }
  };

  const openPastLesson = (id) => {
    setPastLessonOpen(true);
    setPastLesson(null);
    api.get(`/upskilling/lesson/${id}`).then(setPastLesson).catch(() => {});
  };

  const sessionDone = queue && cardIndex >= queue.length;

  const habitChart = habitProgress?.series.map((s) => ({ date: s.date.slice(5), v: s.done ? 1 : 0 }));

  return (
    <div className="up">
      <div className="up__title">
        <h1>Upskilling</h1>
        <p className="up__sub">Daily AI lessons + spaced repetition. Deliberate practice, tracked.</p>
      </div>

      {/* ── Stats row ── */}
      <div className="up__kpi-row">
        <Panel className="up__kpi-panel">
          <Stat label="Lesson streak" value={`${progress?.streak ?? "—"}d`} accent="var(--primary)" />
        </Panel>
        <Panel className="up__kpi-panel">
          <Stat label="Total lessons" value={progress?.total_lessons ?? "—"} />
        </Panel>
        <Panel className="up__kpi-panel">
          <Stat label="Cards mastered" value={progress?.mastered_cards ?? "—"} accent="var(--gain)" />
        </Panel>
        <Panel className="up__kpi-panel">
          <Stat label="Retention (30d)" value={progress?.retention_rate != null ? `${Math.round(progress.retention_rate * 100)}%` : "—"} />
        </Panel>
        <Panel className="up__kpi-panel">
          <Stat label="Due today" value={progress?.due_today ?? "—"} />
        </Panel>
      </div>

      {/* ── Today's lesson ── */}
      <Panel
        title="Today's lesson"
        action={
          <button className="up__history-btn" onClick={openHistory}>
            History
          </button>
        }
      >
        {lessonLoading ? (
          <Spinner />
        ) : !lesson ? (
          <EmptyState title="Lesson unavailable" hint="Check your connection or backend logs." />
        ) : (
          <div className="lesson">
            <div className="lesson__meta">
              <span className="lesson__domain mono">{lesson.domain}</span>
              <LevelBadge level={lesson.level} />
            </div>
            <h2 className="lesson__topic">{lesson.topic}</h2>
            <div className="lesson__summary">
              <SimpleMarkdown text={lesson.summary} />
            </div>
          </div>
        )}
      </Panel>

      {/* ── Flashcard review ── */}
      <Panel
        title={reviewMode ? `Review session — card ${Math.min(cardIndex + 1, queue?.length ?? 1)} of ${queue?.length ?? "…"}` : "Flashcard review"}
        action={
          !reviewMode && (
            <button className="up__start-btn" onClick={startReview} disabled={queueLoading}>
              {queueLoading ? "Loading…" : `Start review${progress?.due_today ? ` (${progress.due_today} due)` : ""}`}
            </button>
          )
        }
      >
        {!reviewMode ? (
          <div className="review-idle">
            <p className="review-idle__hint">
              Each session: 5 new cards from today's lesson + up to 15 cards due for review.
              Rate each card to schedule its next appearance.
            </p>
            <div className="review-legend">
              <span className="rl rl--again">Again — forgot completely</span>
              <span className="rl rl--hard">Hard — struggled</span>
              <span className="rl rl--good">Good — recalled with effort</span>
              <span className="rl rl--easy">Easy — instant recall</span>
            </div>
          </div>
        ) : sessionDone ? (
          <div className="review-done">
            <p className="review-done__icon">✓</p>
            <p className="review-done__title">Session complete</p>
            <p className="review-done__sub">{ratedCount} cards reviewed</p>
            <button
              className="up__start-btn"
              onClick={() => { setReviewMode(false); api.get("/upskilling/progress").then(setProgress).catch(() => {}); }}
            >
              Done
            </button>
          </div>
        ) : queue && queue[cardIndex] ? (
          <div className="review-session">
            <div className="review-progress">
              <div className="review-progress__bar" style={{ width: `${(cardIndex / queue.length) * 100}%` }} />
            </div>
            <Flashcard
              key={queue[cardIndex].id}
              card={queue[cardIndex]}
              onRate={handleRate}
              isLast={cardIndex === queue.length - 1}
            />
          </div>
        ) : (
          <Spinner />
        )}
      </Panel>

      {/* ── Domain coverage ── */}
      {progress?.by_domain && Object.keys(progress.by_domain).length > 0 && (
        <Panel title="Domain coverage">
          <DomainChart byDomain={progress.by_domain} />
        </Panel>
      )}

      {/* ── YouTube daily picks ── */}
      <YouTubePanel />

      {/* ── Habit streak chart (existing system) ── */}
      {habitChart && habitChart.length > 0 && (
        <Panel title="90-day upskilling habit">
          <div className="up__stats">
            <Stat label="Current streak" value={`${habitProgress?.current_streak ?? 0}d`} accent="var(--primary)" />
            <Stat label="90-day rate" value={`${Math.round((habitProgress?.completion_rate ?? 0) * 100)}%`} />
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={habitChart} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis hide domain={[0, 1]} />
              <Tooltip content={() => null} />
              <Line type="step" dataKey="v" stroke="var(--gain)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}

      {/* ── History modal ── */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Lesson history" wide>
        {!history ? (
          <Spinner />
        ) : history.length === 0 ? (
          <EmptyState title="No lessons yet" hint="Come back tomorrow after your first lesson generates." />
        ) : (
          <div className="hist-list">
            {history.map((l) => (
              <button key={l.id} className="hist-item" onClick={() => { openPastLesson(l.id); setHistoryOpen(false); }}>
                <span className="hist-item__date mono">{new Date(l.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span className="hist-item__domain">{l.domain}</span>
                <span className="hist-item__topic">{l.topic}</span>
                <LevelBadge level={l.level} />
                <span className="hist-item__go mono">→</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* ── Past lesson modal ── */}
      <Modal open={pastLessonOpen} onClose={() => setPastLessonOpen(false)} title="Past lesson" wide>
        {!pastLesson ? (
          <Spinner />
        ) : (
          <div className="lesson">
            <div className="lesson__meta">
              <span className="lesson__domain mono">{pastLesson.domain}</span>
              <LevelBadge level={pastLesson.level} />
              <span className="mono" style={{ color: "var(--ink-faint)", fontSize: "0.8rem" }}>
                {new Date(pastLesson.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </span>
            </div>
            <h2 className="lesson__topic">{pastLesson.topic}</h2>
            <div className="lesson__summary">
              <SimpleMarkdown text={pastLesson.summary} />
            </div>
            {pastLesson.cards?.length > 0 && (
              <>
                <h3 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>Flashcards</h3>
                <div className="past-cards">
                  {pastLesson.cards.map((c) => (
                    <div key={c.id} className="past-card">
                      <p className="past-card__q">{c.question}</p>
                      <p className="past-card__a">{c.answer}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
