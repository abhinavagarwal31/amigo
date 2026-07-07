import { useCallback, useState } from 'react';
import { QueryInput } from './components/QueryInput';
import { VoiceInputButton } from './components/VoiceInputButton';
import { AnswerCard } from './components/AnswerCard';
import { EscalationBanner } from './components/EscalationBanner';
import { VENUES, LANGUAGES } from './constants';

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
        const res = await fetch('/api/query', {
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
    <main>
      <h1>Volunteer Co-Pilot</h1>

      <div className="selectors">
        <label htmlFor="venue-select">Venue</label>
        <select id="venue-select" value={venueId} onChange={(event) => setVenueId(event.target.value)}>
          {VENUES.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </select>

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

      {loading && <p role="status">Thinking…</p>}
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
