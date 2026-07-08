import PropTypes from 'prop-types';

export function ListeningScreen({
  recognitionSupported,
  isListening,
  onStop,
  onStartListening,
  error,
  typedQuery,
  onTypedQueryChange,
  onTypedSubmit,
  onReset
}) {
  return (
    <main className="kiosk kiosk--listening">
      <h1>Ask your question</h1>
      <button
        type="button"
        aria-pressed={isListening}
        className={isListening ? 'kiosk-mic-btn kiosk-mic-btn--active' : 'kiosk-mic-btn'}
        onClick={isListening ? onStop : onStartListening}
      >
        {isListening ? (
          /* Stop Square outline SVG */
          <svg className="kiosk-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
          </svg>
        ) : (
          /* Mic outline SVG */
          <svg className="kiosk-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        )}
        <span>{isListening ? 'Tap to stop' : 'Tap to speak'}</span>
      </button>
      {isListening && <p role="status">Listening…</p>}
      {!recognitionSupported && (
        <p role="alert">
          Voice input is not available on this device. Please ask a nearby volunteer for help.
        </p>
      )}
      {error && <p role="alert">{error}</p>}

      <form onSubmit={onTypedSubmit} className="kiosk-typed-form">
        <label htmlFor="kiosk-typed-query">Or type your question</label>
        <input
          id="kiosk-typed-query"
          name="kiosk-typed-query"
          type="text"
          value={typedQuery}
          onChange={(event) => onTypedQueryChange(event.target.value)}
        />
        <button type="submit" disabled={!typedQuery.trim()}>
          Submit
        </button>
      </form>

      <button type="button" className="kiosk-secondary-btn" onClick={onReset}>
        Start over
      </button>
    </main>
  );
}

ListeningScreen.propTypes = {
  recognitionSupported: PropTypes.bool.isRequired,
  isListening: PropTypes.bool.isRequired,
  onStop: PropTypes.func.isRequired,
  onStartListening: PropTypes.func.isRequired,
  error: PropTypes.string,
  typedQuery: PropTypes.string.isRequired,
  onTypedQueryChange: PropTypes.func.isRequired,
  onTypedSubmit: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired
};
