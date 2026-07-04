"""Upskilling router — daily AI lessons + spaced-repetition flashcard system.

Daily flow:
  1. GET /api/upskilling/today  → returns today's lesson (generates if missing)
  2. GET /api/upskilling/review → returns 20 cards: 5 new (today) + 15 due
  3. POST /api/upskilling/review/{card_id} → submit rating (0-3), updates SRS schedule
  4. GET /api/upskilling/progress → streak, mastery stats, domain breakdown

AI generation uses Azure OpenAI via the openai SDK. Required env vars:
  AZURE_OPENAI_ENDPOINT  — e.g. https://my-resource.openai.azure.com/
  AZURE_OPENAI_API_KEY   — your Azure OpenAI key
  AZURE_OPENAI_DEPLOYMENT — deployment name (e.g. gpt-4o); defaults to "gpt-4o"
  AZURE_OPENAI_API_VERSION — API version (e.g. 2024-08-01-preview); defaults to 2024-08-01-preview

Falls back to deterministic topic content so the app works without a key.
"""
from __future__ import annotations

import json
import os
import random
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DailyLesson, Flashcard, FlashcardReview, UPSKILL_DOMAINS

router = APIRouter(prefix="/api/upskilling", tags=["upskilling"])


# ---------------------------------------------------------------------------
# SRS constants (simplified SM-2)
# ---------------------------------------------------------------------------
_EASE_MIN = 1.3
_EASE_BONUS = {0: -0.3, 1: -0.15, 2: 0.0, 3: 0.15}
_INTERVAL_MAP = {0: 1, 1: 1, 2: None, 3: None}  # None = use ease * prev interval


def _next_interval(reps: int, interval: int, ease: float, rating: int) -> tuple[int, float, date]:
    new_ease = max(_EASE_MIN, ease + _EASE_BONUS[rating])
    if rating == 0:
        new_interval = 1
    elif rating == 1:
        new_interval = max(1, round(interval * 1.2))
    elif reps < 2:
        new_interval = 1 if reps == 0 else 6
    else:
        new_interval = round(interval * new_ease)
    due = date.today() + timedelta(days=new_interval)
    return new_interval, new_ease, due


# ---------------------------------------------------------------------------
# AI generation
# ---------------------------------------------------------------------------
_LEVEL_LABELS = ["intro", "intermediate", "advanced", "senior"]

_TOPIC_BANK: dict[str, list[str]] = {
    "Data Science": [
        "Exploratory Data Analysis (EDA) workflows", "Feature engineering techniques",
        "Handling missing data and outliers", "Train/test/validation splits and data leakage",
        "Time series decomposition", "Dimensionality reduction with PCA",
        "Data pipeline design patterns", "Bias-variance tradeoff",
    ],
    "Statistics & Probability": [
        "Bayesian vs Frequentist inference", "Central Limit Theorem and sampling distributions",
        "Hypothesis testing and p-values", "Confidence intervals", "A/B testing design",
        "Regression to the mean", "Conditional probability and Bayes' theorem",
        "MLE vs MAP estimation", "Bootstrap resampling",
    ],
    "Linear Algebra": [
        "Matrix multiplication and its meaning", "Eigenvalues and eigenvectors",
        "Singular Value Decomposition (SVD)", "Vector spaces and linear transformations",
        "The dot product and cosine similarity", "Orthogonality and projections",
        "Matrix decompositions (LU, QR, Cholesky)",
    ],
    "Calculus & Optimization": [
        "Gradient descent and its variants (SGD, Adam, RMSProp)", "Backpropagation mechanics",
        "Chain rule in neural networks", "Convexity and local vs global minima",
        "Learning rate schedules", "Second-order optimization methods",
    ],
    "Database Administration": [
        "ACID properties and transactions", "Database indexing strategies",
        "Query execution plans and EXPLAIN", "Normalization forms (1NF–3NF, BCNF)",
        "CAP theorem and distributed databases", "Connection pooling",
        "Database sharding and partitioning", "Vacuuming and autovacuum in PostgreSQL",
    ],
    "SQL & Query Optimization": [
        "Window functions (RANK, ROW_NUMBER, LAG/LEAD)", "CTEs vs subqueries vs temp tables",
        "Joins: inner, outer, cross, self", "Index types: B-tree, hash, GIN, GiST",
        "Aggregate functions and GROUP BY", "Query planner hints and statistics",
        "Lateral joins and correlated subqueries",
    ],
    "Python Programming": [
        "Python memory model and garbage collection", "Generators and iterators",
        "Decorators and metaclasses", "Context managers", "AsyncIO and event loops",
        "Type hints and mypy", "Dataclasses vs NamedTuple vs attrs",
        "Python packaging (pyproject.toml, hatch, uv)", "Profiling Python code",
    ],
    "AI Engineering": [
        "Prompt engineering patterns (CoT, few-shot, ReAct)", "RAG architecture and chunking strategies",
        "Embedding models and vector stores", "Tool use and function calling",
        "Agentic loops and multi-step reasoning", "Evaluation frameworks for LLM apps",
        "Streaming and token budgeting", "Fine-tuning vs RAG tradeoffs",
        "Model context windows and positional encodings",
    ],
    "Machine Learning": [
        "Decision trees and information gain", "Ensemble methods (bagging, boosting, stacking)",
        "Support Vector Machines and the kernel trick", "k-Nearest Neighbors",
        "Regularization: L1 (Lasso), L2 (Ridge), Elastic Net", "Cross-validation strategies",
        "ROC curves and AUC", "Precision, recall, F1 and when to use each",
        "Clustering: k-means, DBSCAN, hierarchical",
    ],
    "Deep Learning & Neural Networks": [
        "Activation functions and their gradients", "Batch normalization",
        "Dropout and other regularization", "Convolutional neural networks",
        "Attention mechanisms and transformers", "Recurrent networks and LSTMs",
        "Transfer learning and fine-tuning", "Loss functions for classification vs regression",
    ],
    "Cloud Engineering": [
        "IAM roles, policies, and least-privilege", "VPC design and subnetting",
        "Serverless vs containerized architectures", "Object storage (blob/S3) patterns",
        "Managed databases vs self-hosted tradeoffs", "CDN and edge caching",
        "Infrastructure as Code (Terraform, Bicep)", "Cost optimization strategies",
        "Azure App Service vs Container Apps vs AKS",
    ],
    "Systems Design": [
        "Load balancing strategies", "Caching layers (CDN, Redis, in-process)",
        "Message queues and event-driven architecture", "API design: REST vs GraphQL vs gRPC",
        "Rate limiting and back-pressure", "Circuit breakers and retries",
        "Consistency models in distributed systems", "Database replication and failover",
    ],
    "Software Engineering Fundamentals": [
        "SOLID principles", "Domain-driven design (DDD) concepts",
        "Testing pyramid (unit, integration, e2e)", "Version control workflows (trunk-based, gitflow)",
        "Code review best practices", "Technical debt and refactoring",
        "Dependency injection", "Observer and strategy design patterns",
    ],
    "Data Structures & Algorithms": [
        "Big-O complexity analysis", "Hash maps internals and collision handling",
        "Binary trees and BSTs", "Heaps and priority queues",
        "Graph traversal (BFS, DFS, Dijkstra)", "Dynamic programming patterns",
        "Sliding window and two-pointer techniques", "Sorting algorithms compared",
    ],
    "DevOps & CI/CD": [
        "CI/CD pipeline design", "Docker multi-stage builds",
        "Container orchestration with Kubernetes", "Blue-green and canary deployments",
        "Observability: metrics, logs, traces", "Secret management",
        "Feature flags and progressive delivery",
    ],
}


def _pick_topic(db: Session) -> tuple[str, str]:
    """Pick a domain+topic not covered in the last 30 days, weighted toward gaps."""
    thirty_ago = date.today() - timedelta(days=30)
    recent = db.query(DailyLesson.domain, DailyLesson.topic).filter(
        DailyLesson.date >= thirty_ago
    ).all()
    recent_topics = {(r.domain, r.topic) for r in recent}

    candidates = [
        (domain, topic)
        for domain, topics in _TOPIC_BANK.items()
        for topic in topics
        if (domain, topic) not in recent_topics
    ]
    if not candidates:
        candidates = [(d, t) for d, ts in _TOPIC_BANK.items() for t in ts]

    return random.choice(candidates)


def _pick_level(db: Session, domain: str) -> str:
    """Scale difficulty based on how many lessons the user has completed in this domain."""
    count = db.query(func.count(DailyLesson.id)).filter(DailyLesson.domain == domain).scalar() or 0
    if count < 3:
        return "intro"
    if count < 10:
        return "intermediate"
    if count < 25:
        return "advanced"
    return "senior"


_FALLBACK_SUMMARY = """
{topic} is a foundational concept in {domain}.

**Core idea:** Understanding {topic} requires grasping how its components interact
at a systems level. Practitioners use this knowledge daily when designing, debugging,
and optimizing production systems.

**Key principles:**
1. First principles matter — before applying a technique, understand *why* it works.
2. The tradeoffs are context-dependent; there is rarely a universal best approach.
3. Measurement always beats intuition — benchmark, profile, and validate.

**Practical application:** In real-world scenarios, you'll encounter {topic} when
scaling systems, debugging subtle bugs, or choosing between competing approaches.
Senior engineers distinguish themselves by reasoning from first principles rather
than cargo-culting solutions.

**Common pitfalls:**
- Premature optimization before understanding the bottleneck
- Ignoring edge cases that only appear at scale
- Over-engineering simple problems

**What to explore next:** Look at canonical implementations, read primary sources
(papers or RFCs), and implement a toy version to build genuine intuition.
""".strip()

_FALLBACK_CARDS = [
    ("What is the core problem that {topic} solves?",
     "{topic} addresses the challenge of {domain} practitioners needing a principled approach to a recurring class of problems."),
    ("Name two tradeoffs to consider when applying {topic}.",
     "1. Complexity vs. simplicity — more powerful techniques often require more setup and maintenance. 2. Performance vs. correctness — optimizations can introduce subtle bugs."),
    ("How does {topic} relate to the broader field of {domain}?",
     "It forms a building block that more advanced techniques depend on; mastering it unlocks a cluster of related concepts."),
    ("What should you measure to know if your use of {topic} is working?",
     "Define a quantitative success metric before applying the technique, then validate with held-out data or a controlled experiment."),
    ("Describe a scenario where {topic} would be the wrong tool.",
     "When the problem scale or constraints differ significantly from the assumptions the technique was designed for."),
]


async def _generate_lesson(domain: str, topic: str, level: str) -> tuple[str, list[dict]]:
    """Call Azure OpenAI to generate a lesson summary + 5 flashcards. Falls back gracefully."""
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
    api_key = os.getenv("AZURE_OPENAI_API_KEY", "")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")

    def _fallback():
        summary = _FALLBACK_SUMMARY.format(topic=topic, domain=domain)
        cards = [{"question": q.format(topic=topic, domain=domain),
                  "answer": a.format(topic=topic, domain=domain)}
                 for q, a in _FALLBACK_CARDS]
        return summary, cards

    if not endpoint or not api_key:
        return _fallback()

    prompt = f"""You are a world-class technical educator. Generate a lesson on the following topic for a software engineer / data scientist studying for career growth.

Domain: {domain}
Topic: {topic}
Level: {level} (intro=101, intermediate=300-level, advanced=400-level, senior=graduate/industry-expert)

Return ONLY valid JSON with this exact structure:
{{
  "summary": "A {level}-level summary of {topic}. 350-500 words. Use markdown: bold key terms, use numbered lists for steps/principles, use a code snippet if relevant. Practical and concrete.",
  "flashcards": [
    {{"question": "...", "answer": "..."}},
    {{"question": "...", "answer": "..."}},
    {{"question": "...", "answer": "..."}},
    {{"question": "...", "answer": "..."}},
    {{"question": "...", "answer": "..."}}
  ]
}}

Flashcard rules:
- 5 cards total, varying difficulty
- Questions: specific and unambiguous
- Answers: 1-3 sentences, correct and complete
- Cover: definition, mechanism, tradeoff, application, pitfall
- NO filler like "Great question!" — just the answer"""

    try:
        from openai import AsyncAzureOpenAI
        client = AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=api_version,
        )
        response = await client.chat.completions.create(
            model=deployment,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1500,
            temperature=0.7,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or ""
        data = json.loads(raw)
        return data["summary"], data["flashcards"]
    except Exception:
        return _fallback()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/today")
async def today_lesson(db: Session = Depends(get_db)):
    """Return today's lesson, generating it if it doesn't exist yet."""
    today = date.today()
    lesson = db.query(DailyLesson).filter(DailyLesson.date == today).first()

    if lesson is None:
        domain, topic = _pick_topic(db)
        level = _pick_level(db, domain)
        summary, cards_data = await _generate_lesson(domain, topic, level)

        lesson = DailyLesson(date=today, domain=domain, topic=topic, level=level, summary=summary)
        db.add(lesson)
        db.flush()

        for c in cards_data:
            db.add(Flashcard(
                lesson_id=lesson.id,
                question=c["question"],
                answer=c["answer"],
                due_date=today,
            ))
        db.commit()
        db.refresh(lesson)

    return {
        "id": lesson.id,
        "date": lesson.date.isoformat(),
        "domain": lesson.domain,
        "topic": lesson.topic,
        "level": lesson.level,
        "summary": lesson.summary,
        "card_count": len(lesson.cards),
    }


@router.get("/review")
def review_queue(db: Session = Depends(get_db)):
    """Return up to 20 cards for today's session: 5 new (today's lesson) + 15 due."""
    today = date.today()

    # Today's lesson cards (new)
    lesson = db.query(DailyLesson).filter(DailyLesson.date == today).first()
    new_cards: list[Flashcard] = []
    if lesson:
        new_cards = db.query(Flashcard).filter(Flashcard.lesson_id == lesson.id).all()

    # Due cards from previous lessons (not today's), overdue first
    due_cards = (
        db.query(Flashcard)
        .join(DailyLesson)
        .filter(DailyLesson.date < today, Flashcard.due_date <= today)
        .order_by(Flashcard.due_date.asc())
        .limit(20)
        .all()
    )

    # Fill to 20: 5 new + 15 due (or fewer if not enough)
    selected_new = new_cards[:5]
    remaining_slots = 20 - len(selected_new)
    selected_due = due_cards[:remaining_slots]

    # Shuffle so new cards aren't always first
    combined = selected_new + selected_due
    random.shuffle(combined)

    def _card_shape(c: Flashcard):
        return {
            "id": c.id,
            "lesson_id": c.lesson_id,
            "question": c.question,
            "answer": c.answer,
            "reps": c.reps,
            "interval": c.interval,
            "due_date": c.due_date.isoformat(),
            "is_new": lesson and c.lesson_id == lesson.id,
        }

    return {"cards": [_card_shape(c) for c in combined], "total": len(combined)}


class ReviewIn(BaseModel):
    rating: int  # 0=Again, 1=Hard, 2=Good, 3=Easy


@router.post("/review/{card_id}")
def submit_review(card_id: int, body: ReviewIn, db: Session = Depends(get_db)):
    """Submit a review rating for a card and update its SRS schedule."""
    if body.rating not in (0, 1, 2, 3):
        raise HTTPException(status_code=422, detail="rating must be 0-3")

    card = db.query(Flashcard).filter(Flashcard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    new_interval, new_ease, new_due = _next_interval(card.reps, card.interval, card.ease, body.rating)
    card.interval = new_interval
    card.ease = new_ease
    card.due_date = new_due
    card.reps += 1

    review = FlashcardReview(card_id=card_id, date=date.today(), rating=body.rating)
    db.add(review)
    db.commit()

    return {"id": card_id, "interval": new_interval, "due_date": new_due.isoformat()}


@router.get("/progress")
def progress(db: Session = Depends(get_db)):
    """Aggregate learning stats: streak, mastery, domain breakdown, recent history."""
    today = date.today()

    # Lesson streak
    lessons = (
        db.query(DailyLesson.date)
        .order_by(DailyLesson.date.desc())
        .all()
    )
    lesson_dates = {r.date for r in lessons}
    streak = 0
    check = today
    while check in lesson_dates:
        streak += 1
        check -= timedelta(days=1)

    # Total cards created / reviewed / mastered (interval >= 21 days = "mastered")
    total_cards = db.query(func.count(Flashcard.id)).scalar() or 0
    mastered = db.query(func.count(Flashcard.id)).filter(Flashcard.interval >= 21).scalar() or 0
    total_reviews = db.query(func.count(FlashcardReview.id)).scalar() or 0

    # Retention rate: Good+Easy / all reviews (last 30 days)
    thirty_ago = today - timedelta(days=30)
    recent_reviews = db.query(FlashcardReview).filter(FlashcardReview.date >= thirty_ago).all()
    retention = (
        sum(1 for r in recent_reviews if r.rating >= 2) / len(recent_reviews)
        if recent_reviews else None
    )

    # Domain breakdown: lessons per domain
    domain_rows = (
        db.query(DailyLesson.domain, func.count(DailyLesson.id).label("count"))
        .group_by(DailyLesson.domain)
        .all()
    )
    by_domain = {r.domain: r.count for r in domain_rows}

    # Recent lessons (last 14)
    recent_lessons = (
        db.query(DailyLesson)
        .order_by(DailyLesson.date.desc())
        .limit(14)
        .all()
    )

    # Cards due today (review burden)
    due_today = db.query(func.count(Flashcard.id)).filter(Flashcard.due_date <= today).scalar() or 0

    return {
        "streak": streak,
        "total_lessons": len(lesson_dates),
        "total_cards": total_cards,
        "mastered_cards": mastered,
        "total_reviews": total_reviews,
        "retention_rate": retention,
        "due_today": due_today,
        "by_domain": by_domain,
        "recent_lessons": [
            {
                "date": l.date.isoformat(),
                "domain": l.domain,
                "topic": l.topic,
                "level": l.level,
            }
            for l in recent_lessons
        ],
    }


@router.get("/history")
def lesson_history(db: Session = Depends(get_db), limit: int = 30):
    """Return recent lessons for the history panel."""
    lessons = (
        db.query(DailyLesson)
        .order_by(DailyLesson.date.desc())
        .limit(limit)
        .all()
    )
    return {
        "lessons": [
            {
                "id": l.id,
                "date": l.date.isoformat(),
                "domain": l.domain,
                "topic": l.topic,
                "level": l.level,
            }
            for l in lessons
        ]
    }


@router.get("/lesson/{lesson_id}")
def get_lesson(lesson_id: int, db: Session = Depends(get_db)):
    """Fetch a specific past lesson by ID."""
    lesson = db.query(DailyLesson).filter(DailyLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return {
        "id": lesson.id,
        "date": lesson.date.isoformat(),
        "domain": lesson.domain,
        "topic": lesson.topic,
        "level": lesson.level,
        "summary": lesson.summary,
        "cards": [{"id": c.id, "question": c.question, "answer": c.answer} for c in lesson.cards],
    }
