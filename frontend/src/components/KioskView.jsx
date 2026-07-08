import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { useAmigoQuery } from '../hooks/useAmigoQuery';
import { VENUES } from '../constants';
import { fetchWithTimeout } from '../fetchWithTimeout';
import { IdleScreen } from './kiosk/IdleScreen';
import { ListeningScreen } from './kiosk/ListeningScreen';
import { ProcessingScreen } from './kiosk/ProcessingScreen';
import { RespondingErrorScreen } from './kiosk/RespondingErrorScreen';
import { EscalationScreen } from './kiosk/EscalationScreen';
import { RespondingScreen } from './kiosk/RespondingScreen';
import { getKioskEscalationText } from './kiosk/kioskEscalationText';

const INACTIVITY_TIMEOUT_MS = 15000;

const STATE = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  RESPONDING: 'RESPONDING'
};

// A real kiosk is physically deployed at one specific stadium, configured at build/deploy
// time via VITE_KIOSK_VENUE_ID (see vite.config.js), falling back to the first known venue
// if unset or invalid. `__KIOSK_VENUE_ID__` is undefined (not a ReferenceError) when this
// component runs outside Vite's build, e.g. under Jest.
export function resolveKioskVenueId() {
  const configured = typeof __KIOSK_VENUE_ID__ !== 'undefined' ? __KIOSK_VENUE_ID__ : '';
  const isValid = configured && VENUES.some((venue) => venue.id === configured);
  return isValid ? configured : VENUES[0].id;
}

const KIOSK_VENUE_ID = resolveKioskVenueId();

export function KioskView() {
  const [state, setState] = useState(STATE.IDLE);
  const [venueId] = useState(KIOSK_VENUE_ID);
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
  const { submitQuery: performQuery } = useAmigoQuery();

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

      const result = await performQuery({ query: transcript, venueId, outputLanguage: lang });

      if (!result.ok) {
        setError(result.error);
        setState(STATE.RESPONDING);
        return;
      }

      setResponse(result.data);
      setState(STATE.RESPONDING);

      if (result.data.escalation) {
        speak(getKioskEscalationText(lang).body, lang);
      } else if (result.data.answer) {
        speak(result.data.answer, lang);
      }
    },
    [venueId, speak, performQuery]
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
    return <IdleScreen onSelectLanguage={handleSelectLanguage} />;
  }

  if (state === STATE.LISTENING) {
    return (
      <ListeningScreen
        recognitionSupported={recognitionSupported}
        isListening={isListening}
        onStop={stop}
        onStartListening={handleStartListening}
        error={error}
        typedQuery={typedQuery}
        onTypedQueryChange={setTypedQuery}
        onTypedSubmit={handleTypedSubmit}
        onReset={resetSession}
      />
    );
  }

  if (state === STATE.PROCESSING) {
    return <ProcessingScreen />;
  }

  // RESPONDING
  if (error) {
    return <RespondingErrorScreen error={error} onReset={resetSession} />;
  }

  if (response && response.escalation) {
    return (
      <EscalationScreen
        language={language}
        alertSent={alertSent}
        onAlertStaff={handleAlertStaff}
        onReset={resetSession}
      />
    );
  }

  return <RespondingScreen response={response} language={language} onReset={resetSession} />;
}
