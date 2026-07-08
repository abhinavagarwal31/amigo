export function Landing() {
  return (
    <main className="landing">
      <div className="landing-inner">
        <h1 className="landing-title">Amigo</h1>
        <p className="landing-subtitle">FIFA World Cup 2026 — Volunteer &amp; Fan Assistant</p>
        <nav aria-label="Mode selection" className="landing-nav">
          <a id="volunteer-link" href="/volunteer" className="landing-btn landing-btn--volunteer">
            <span className="landing-btn-icon" aria-hidden="true">👤</span>
            <span className="landing-btn-label">Continue as Volunteer</span>
            <span className="landing-btn-desc">Answer fan questions at your venue</span>
          </a>
          <a id="kiosk-link" href="/kiosk" className="landing-btn landing-btn--kiosk">
            <span className="landing-btn-icon" aria-hidden="true">🖥️</span>
            <span className="landing-btn-label">Kiosk Mode</span>
            <span className="landing-btn-desc">Self-service walk-up screen for fans</span>
          </a>
        </nav>
      </div>
    </main>
  );
}
