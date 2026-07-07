import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { VENUES, LANGUAGES } from '../constants';
import { fetchWithTimeout } from '../fetchWithTimeout';

const INACTIVITY_TIMEOUT_MS = 15000;

const STATE = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  RESPONDING: 'RESPONDING'
};

// Fan-facing safety copy, kept separate from the volunteer-facing "reason"/"action"
// fields the backend returns (those are instructions for a volunteer, not a fan
// standing alone at an unattended kiosk).
const KIOSK_ESCALATION_TEXT = {
  'en-US': {
    heading: 'This may need urgent help',
    body: 'Please find the nearest staff member right away, or use the button below to alert staff.',
    alertButton: 'Alert Nearby Staff',
    alertSent: 'Staff alerted'
  },
  'es-ES': {
    heading: 'Esto puede necesitar ayuda urgente',
    body: 'Por favor busque al miembro del personal más cercano de inmediato, o use el botón de abajo para alertar al personal.',
    alertButton: 'Alertar al personal cercano',
    alertSent: 'Personal alertado'
  },
  'pt-BR': {
    heading: 'Isso pode precisar de ajuda urgente',
    body: 'Por favor, encontre o funcionário mais próximo imediatamente, ou use o botão abaixo para alertar a equipe.',
    alertButton: 'Alertar equipe próxima',
    alertSent: 'Equipe alertada'
  },
  'fr-FR': {
    heading: 'Cela pourrait nécessiter une aide urgente',
    body: 'Veuillez trouver le membre du personnel le plus proche immédiatement, ou utilisez le bouton ci-dessous pour alerter le personnel.',
    alertButton: 'Alerter le personnel à proximité',
    alertSent: 'Personnel alerté'
  }
};

function getKioskEscalationText(lang) {
  return KIOSK_ESCALATION_TEXT[lang] || KIOSK_ESCALATION_TEXT['en-US'];
}

export function KioskView() {
  const [state, setState] = useState(STATE.IDLE);
  const [venueId] = useState(VENUES[0].id);
  const [language, setLanguage] = useState(null);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [alertSent, setAlertSent] = useState(false);
  const [typedQuery, setTypedQuery] = useState('');
  const inactivityTimerRef = useRef(null);

  const { isSupported: recognitionSupported, isListening, start, stop } = useSpeechRecognition({
    lang: language || 'en-US'
  });
  const { speak, stop: stopSpeaking } = useSpeechSynthesis();

  const resetSession = useCallback(() => {
    stop();
    stopSpeaking();
    clearTimeout(inactivityTimerRef.current);
    setState(STATE.IDLE);
    setLanguage(null);
    setResponse(null);
    setError(null);
    setAlertSent(false);
    setTypedQuery('');
  }, [stop, stopSpeaking]);

  useEffect(() => {
    if (state !== STATE.RESPONDING) return undefined;
    inactivityTimerRef.current = setTimeout(resetSession, INACTIVITY_TIMEOUT_MS);
    return () => clearTimeout(inactivityTimerRef.current);
  }, [state, resetSession]);

  const submitQuery = useCallback(
    async (transcript, lang) => {
      setState(STATE.PROCESSING);
      setError(null);

      try {
        const res = await fetchWithTimeout('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: transcript, venueId, outputLanguage: lang })
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Something went wrong. Please try again.');
          setState(STATE.RESPONDING);
          return;
        }

        setResponse(data);
        setState(STATE.RESPONDING);

        if (data.escalation) {
          speak(getKioskEscalationText(lang).body, lang);
        } else if (data.answer) {
          speak(data.answer, lang);
        }
      } catch (err) {
        setError('Could not reach the server. Please try again.');
        setState(STATE.RESPONDING);
      }
    },
    [venueId, speak]
  );

  const handleSelectLanguage = (langCode) => {
    setLanguage(langCode);
    setState(STATE.LISTENING);
  };

  const handleStartListening = () => {
    if (!recognitionSupported) {
      setError('Voice input is not available on this device. Please ask a nearby volunteer for help.');
      return;
    }
    setError(null);
    start(
      (transcript) => submitQuery(transcript, language),
      () => setError('We could not hear you clearly. Please try again.')
    );
  };

  const handleTypedSubmit = (event) => {
    event.preventDefault();
    const trimmed = typedQuery.trim();
    if (!trimmed) return;
    setTypedQuery('');
    submitQuery(trimmed, language);
  };

  const handleAlertStaff = async () => {
    try {
      await fetchWithTimeout('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId,
          reason: response && response.reason ? `Kiosk escalation: ${response.reason}` : 'Kiosk escalation'
        })
      });
      setAlertSent(true);
    } catch (err) {
      setAlertSent(false);
    }
  };

  if (state === STATE.IDLE) {
    return (
      <main className="kiosk kiosk--idle">
        <h1>Welcome to Amigo</h1>
        <p>Select your language to begin.</p>
        <div className="kiosk-language-grid">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              className="kiosk-lang-btn"
              onClick={() => handleSelectLanguage(lang.code)}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (state === STATE.LISTENING) {
    return (
      <main className="kiosk kiosk--listening">
        <h1>Ask your question</h1>
        <button
          type="button"
          aria-pressed={isListening}
          className={isListening ? 'kiosk-mic-btn kiosk-mic-btn--active' : 'kiosk-mic-btn'}
          onClick={isListening ? stop : handleStartListening}
        >
          <span aria-hidden="true">{isListening ? '⏹' : '\u{1F3A4}'}</span>
          <span>{isListening ? 'Tap to stop' : 'Tap to speak'}</span>
        </button>
        {isListening && <p role="status">Listening…</p>}
        {!recognitionSupported && (
          <p role="alert">
            Voice input is not available on this device. Please ask a nearby volunteer for help.
          </p>
        )}
        {error && <p role="alert">{error}</p>}

        <form onSubmit={handleTypedSubmit} className="kiosk-typed-form">
          <label htmlFor="kiosk-typed-query">Or type your question</label>
          <input
            id="kiosk-typed-query"
            name="kiosk-typed-query"
            type="text"
            value={typedQuery}
            onChange={(event) => setTypedQuery(event.target.value)}
          />
          <button type="submit" disabled={!typedQuery.trim()}>
            Submit
          </button>
        </form>

        <button type="button" className="kiosk-secondary-btn" onClick={resetSession}>
          Start over
        </button>
      </main>
    );
  }

  if (state === STATE.PROCESSING) {
    return (
      <main className="kiosk kiosk--processing" role="status">
        <p>Finding your answer…</p>
      </main>
    );
  }

  // RESPONDING
  if (error) {
    return (
      <main className="kiosk kiosk--responding">
        <p role="alert">{error}</p>
        <button type="button" onClick={resetSession}>
          Ask another question
        </button>
      </main>
    );
  }

  if (response && response.escalation) {
    const kioskText = getKioskEscalationText(language);
    return (
      <main className="kiosk kiosk--escalation" role="alert">
        <h1>{kioskText.heading}</h1>
        <p>{kioskText.body}</p>
        <button
          type="button"
          className="kiosk-alert-btn"
          disabled={alertSent}
          onClick={handleAlertStaff}
        >
          {alertSent ? kioskText.alertSent : kioskText.alertButton}
        </button>
        <button type="button" className="kiosk-secondary-btn" onClick={resetSession}>
          Done
        </button>
      </main>
    );
  }

  return (
    <main className="kiosk kiosk--responding">
      <h1>Answer</h1>
      <p className="kiosk-answer-text">{response && response.answer}</p>
      <button type="button" onClick={resetSession}>
        Ask another question
      </button>
    </main>
  );
}
