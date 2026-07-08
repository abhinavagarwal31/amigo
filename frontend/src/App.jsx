import { useCallback, useState } from 'react';
import { QueryInput } from './components/QueryInput';
import { VoiceInputButton } from './components/VoiceInputButton';
import { AnswerCard } from './components/AnswerCard';
import { EscalationBanner } from './components/EscalationBanner';
import { VENUES, LANGUAGES } from './constants';
import { fetchWithTimeout } from './fetchWithTimeout';

export default function App() {
  const [venueId, setVenueId] = useState(VENUES[0].id);
  const [language, setLanguage] = useState(LANGUAGES[0].code);
  const [queryText, setQueryText] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submitQuery = useCallback(
    async (overrideText) => {
      const trimmed = (overrideText ?? queryText).trim();
      if (!trimmed) return;

      setLoading(true);
      setError(null);
      setResponse(null);

      try {
        const res = await fetchWithTimeout('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed, venueId, outputLanguage: language })
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Something went wrong. Please try again.');
          return;
        }

        setResponse(data);
        setQueryText('');
      } catch (err) {
        setError('Could not reach the server. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [queryText, venueId, language]
  );

  return (
    <main className="volunteer-layout">
      <header className="app-header">
        <svg className="app-badge" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M8 9h8" />
          <path d="M8 13h6" />
          <circle cx="12" cy="11" r="4" strokeDasharray="2 2" />
        </svg>
        <h1 className="app-title">Amigo</h1>
      </header>

      <div className="selectors">
        <div className="selector-group">
          <label htmlFor="venue-select">Venue</label>
          <select id="venue-select" value={venueId} onChange={(event) => setVenueId(event.target.value)}>
            {VENUES.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>

        <div className="selector-group">
          <label htmlFor="language-select">Fan&apos;s language</label>
          <select
            id="language-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <QueryInput
        value={queryText}
        onChange={setQueryText}
        onSubmit={() => submitQuery()}
        disabled={loading}
      />
      <VoiceInputButton
        lang={language}
        disabled={loading}
        onTranscript={(transcript) => {
          setQueryText(transcript);
          submitQuery(transcript);
        }}
      />

      {loading && <p role="status" className="loading-status">Thinking…</p>}
      {error && (
        <p role="alert" className="query-error">
          {error}
        </p>
      )}

      <EscalationBanner response={response} outputLanguage={language} />
      <AnswerCard response={response} outputLanguage={language} />
    </main>
  );
}
