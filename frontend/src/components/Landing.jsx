export function Landing() {
  return (
    <main className="landing">
      <div className="landing-inner">
        {/* Original, custom stadium-inspired shield badge for Amigo */}
        <svg className="landing-crest" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M8 9h8" />
          <path d="M8 13h6" />
          <circle cx="12" cy="11" r="4" strokeDasharray="2 2" />
        </svg>

        <h1 className="landing-title">Amigo</h1>
        <p className="landing-subtitle">Your venue assistant, in any language</p>
        <nav aria-label="Mode selection" className="landing-nav">
          <a id="volunteer-link" href="/volunteer" className="landing-btn">
            {/* Volunteer silhouette icon */}
            <svg className="landing-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="landing-btn-label">Continue as Volunteer</span>
            <span className="landing-btn-desc">Answer fan questions at your venue</span>
          </a>
          <a id="kiosk-link" href="/kiosk" className="landing-btn">
            {/* Kiosk device screen icon */}
            <svg className="landing-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span className="landing-btn-label">Kiosk Mode</span>
            <span className="landing-btn-desc">Self-service walk-up screen for fans</span>
          </a>
        </nav>
      </div>
    </main>
  );
}
