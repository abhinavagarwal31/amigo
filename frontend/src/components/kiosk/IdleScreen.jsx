import PropTypes from 'prop-types';
import { LANGUAGES } from '../../constants';

export function IdleScreen({ onSelectLanguage }) {
  return (
    <main className="kiosk kiosk--idle">
      {/* Original Logo Badge for Kiosk */}
      <svg className="kiosk-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M8 9h8" />
        <path d="M8 13h6" />
        <circle cx="12" cy="11" r="4" strokeDasharray="2 2" />
      </svg>
      <h1>Welcome to Amigo</h1>
      <p>Select your language to begin.</p>
      <div className="kiosk-language-grid">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            type="button"
            className="kiosk-lang-btn"
            onClick={() => onSelectLanguage(lang.code)}
          >
            {lang.label}
          </button>
        ))}
      </div>
    </main>
  );
}

IdleScreen.propTypes = {
  onSelectLanguage: PropTypes.func.isRequired
};
