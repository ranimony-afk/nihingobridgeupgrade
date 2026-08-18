"use client";

import { useEffect, useState } from "react";

type Progress = {
  feathers: number;
  weeklyFeathers: number;
  streak: number;
  lessonsCompleted: number;
};

const fallbackProgress: Progress = {
  feathers: 126,
  weeklyFeathers: 38,
  streak: 12,
  lessonsCompleted: 8,
};

const burstFeathers = [0, 1, 2, 3, 4, 5, 6, 7];

function FeatherIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 42 52" aria-hidden="true" fill="none">
      <path
        d="M11.4 42.5C1.7 29.2 7.1 9.8 30.8 3.5c4.4 20.2-3.3 34.2-19.4 39Z"
        fill="currentColor"
      />
      <path d="M9.2 45.5 29 10.8M14.6 35l2.5-8.1m4.7-8.4 2.2-4.3" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".72" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M12.1 21c4.2 0 7-2.8 7-6.8 0-3.1-1.8-5.6-4.8-8.5.2 2.3-1 3.7-2.1 4.3C11.9 7 10.5 4.8 7.2 3c.2 4-2.5 5.9-2.5 10.1C4.7 17.8 7.7 21 12.1 21Z" fill="currentColor" />
      <path d="M12 19c1.9 0 3.2-1.2 3.2-3.1 0-1.2-.8-2.5-2.2-3.7.1 1-.5 1.7-1.2 2.1-.3-1.1-1-2-2.2-2.7.1 1.5-1.1 2.2-1.1 3.9C8.5 17.5 9.9 19 12 19Z" fill="white" opacity=".8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
      <path d="m4.4 10.2 3.4 3.4 7.8-7.7" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
      <path d="M3.5 10h12M10.5 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LearningDashboard() {
  const [progress, setProgress] = useState<Progress>(fallbackProgress);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showBurst, setShowBurst] = useState(false);
  const [message, setMessage] = useState("Ready for your next small win.");

  useEffect(() => {
    let active = true;

    fetch("/api/feathers")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load progress");
        return response.json() as Promise<{ progress: Progress }>;
      })
      .then(({ progress: savedProgress }) => {
        if (active) setProgress(savedProgress);
      })
      .catch(() => {
        if (active) setMessage("Your practice space is ready — progress will sync soon.");
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  async function completeLesson() {
    if (isCompleting || isComplete) return;

    setIsCompleting(true);
    try {
      const response = await fetch("/api/feathers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete-lesson" }),
      });

      if (!response.ok) throw new Error("Could not complete lesson");

      const data = (await response.json()) as { progress: Progress; award: number };
      setProgress(data.progress);
      setIsComplete(true);
      setShowBurst(true);
      setMessage(`Beautiful work — ${data.award} feathers added to your collection.`);
      window.setTimeout(() => setShowBurst(false), 1300);
    } catch {
      setMessage("That feather flew away. Please try the lesson again.");
    } finally {
      setIsCompleting(false);
    }
  }

  const dailyProgress = isComplete ? 4 : 3;
  const weeklyPercent = Math.min(100, Math.round((progress.weeklyFeathers / 50) * 100));

  return (
    <main className="app-shell">
      <aside className="desktop-rail" aria-label="Primary navigation">
        <a className="brand-mark" href="#top" aria-label="Koto home">
          こと
        </a>
        <nav className="rail-nav">
          <a className="rail-link rail-link-active" href="#path" aria-label="Learning path">
            <span className="rail-symbol">⌂</span>
          </a>
          <a className="rail-link" href="#collection" aria-label="Feather collection">
            <FeatherIcon className="rail-feather" />
          </a>
          <a className="rail-link" href="#goals" aria-label="Goals">
            <span className="rail-symbol">◎</span>
          </a>
        </nav>
        <div className="rail-profile" aria-label="Akira profile">A</div>
      </aside>

      <div className="page-content" id="top">
        <header className="topbar">
          <a className="mobile-brand" href="#top">こと</a>
          <p className="crumb"><span>Japanese journey</span><b>•</b> Unit 4</p>
          <div className="header-actions">
            <div className="streak-pill" aria-label={`${progress.streak} day streak`}>
              <FlameIcon />
              <strong>{progress.streak}</strong>
            </div>
            <button className="avatar" aria-label="Open profile">A</button>
          </div>
        </header>

        <section className="hero-section" aria-labelledby="hero-title">
          <div className="eyebrow"><span></span> TODAY&apos;S PRACTICE</div>
          <div className="hero-copy">
            <div>
              <p className="greeting">Ohayō, Akira</p>
              <h1 id="hero-title">Make today <em>take flight.</em></h1>
              <p className="hero-description">A few focused minutes turn into a feather in your collection. Let&apos;s keep your Japanese moving forward.</p>
            </div>
            <div className="feather-orbit" aria-hidden="true">
              <span className="orbit-spark orbit-spark-one"></span>
              <span className="orbit-spark orbit-spark-two"></span>
              <span className="orbit-spark orbit-spark-three"></span>
              <span className="orbit-ring"></span>
              <FeatherIcon className="hero-feather hero-feather-back" />
              <FeatherIcon className="hero-feather hero-feather-front" />
            </div>
          </div>
        </section>

        <section className="status-strip" aria-label="Daily progress">
          <div className="daily-progress">
            <div className="progress-copy">
              <span>DAILY PATH</span>
              <strong>{dailyProgress} of 4 stops</strong>
            </div>
            <div className="path-dots" aria-hidden="true">
              {[0, 1, 2, 3].map((step) => (
                <span className={step < dailyProgress ? "path-dot path-dot-filled" : "path-dot"} key={step}>
                  {step < 3 ? <CheckIcon /> : step + 1}
                </span>
              ))}
              <i></i><i></i><i></i>
            </div>
          </div>
          <div className="status-divider"></div>
          <div className="feather-total" id="collection">
            <span className="mini-feather"><FeatherIcon /></span>
            <div><span>YOUR FEATHERS</span><strong>{progress.feathers.toLocaleString()}</strong></div>
          </div>
        </section>

        <section className="main-grid" id="path">
          <div className="lesson-column">
            <div className="section-heading">
              <div><p className="section-kicker">UP NEXT</p><h2>Keep the rhythm</h2></div>
              <button className="quiet-button" type="button">View path <ArrowIcon /></button>
            </div>

            <article className={`lesson-card ${isComplete ? "lesson-card-complete" : ""}`}>
              {showBurst && (
                <div className="feather-burst" aria-hidden="true">
                  {burstFeathers.map((feather) => <FeatherIcon className={`burst-feather burst-feather-${feather}`} key={feather} />)}
                </div>
              )}
              <div className="lesson-topline">
                <span className="lesson-tag">SPEAKING • 5 MIN</span>
                <span className="award-chip"><FeatherIcon /> +3</span>
              </div>
              <div className="lesson-body">
                <div className="lesson-art" aria-hidden="true">
                  <span className="sun-disc"></span>
                  <span className="speech-bubble">こんにちは</span>
                  <span className="art-stroke art-stroke-one"></span>
                  <span className="art-stroke art-stroke-two"></span>
                </div>
                <div className="lesson-details">
                  <h3>{isComplete ? "Conversation complete!" : "First conversations"}</h3>
                  <p>{isComplete ? "Your collection is growing beautifully. Come back tomorrow for another small flight." : "Introduce yourself and make your first connection in Japanese."}</p>
                  <button className="lesson-button" type="button" onClick={completeLesson} disabled={isCompleting || isComplete}>
                    {isCompleting ? "Saving your feathers…" : isComplete ? <><CheckIcon /> Feathers collected</> : <>Start lesson <ArrowIcon /></>}
                  </button>
                </div>
              </div>
            </article>

            <div className="section-heading smaller-heading">
              <div><p className="section-kicker">PICK A PRACTICE</p><h2>More ways to grow</h2></div>
            </div>
            <div className="practice-grid">
              <article className="practice-card practice-card-aqua">
                <span className="practice-number">01</span>
                <span className="practice-icon">あ</span>
                <div><h3>Hiragana sprint</h3><p>Recall 12 characters</p></div>
                <span className="card-reward"><FeatherIcon /> 2</span>
              </article>
              <article className="practice-card practice-card-lilac">
                <span className="practice-number">02</span>
                <span className="practice-icon">話</span>
                <div><h3>Listen &amp; choose</h3><p>Train your ear</p></div>
                <span className="card-reward"><FeatherIcon /> 2</span>
              </article>
            </div>
          </div>

          <aside className="insight-column" id="goals">
            <article className="weekly-card">
              <div className="weekly-header"><div><p className="section-kicker">THIS WEEK</p><h2>Gentle momentum</h2></div><span className="week-label">MON — SUN</span></div>
              <div className="weekly-visual">
                <div className="weekly-feather-wrap"><FeatherIcon className="weekly-feather" /><span>{progress.weeklyFeathers}</span></div>
                <div className="weekly-copy"><strong>{50 - Math.min(50, progress.weeklyFeathers)} more feathers</strong><p>to reach your weekly intention.</p></div>
              </div>
              <div className="meter" aria-label={`${weeklyPercent}% of weekly goal`}><span style={{ width: `${weeklyPercent}%` }}></span></div>
              <div className="meter-ends"><span>0</span><strong>50</strong></div>
            </article>

            <article className="note-card">
              <span className="note-line"></span>
              <p className="section-kicker">A SMALL REMINDER</p>
              <p className="note-quote">&ldquo;Every word you learn is a bridge you can cross.&rdquo;</p>
              <p className="note-author">— Koto learning notes</p>
            </article>

            <p className="sync-message" role="status"><span className={isLoaded ? "sync-dot sync-dot-ready" : "sync-dot"}></span>{message}</p>
          </aside>
        </section>
      </div>
    </main>
  );
}
