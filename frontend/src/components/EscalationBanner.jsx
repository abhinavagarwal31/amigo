import { useEffect, useRef } from 'react';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';

export function EscalationBanner({ response, outputLanguage }) {
  const { isSupported, isSpeaking, speak, stop } = useSpeechSynthesis();
  const lastSpokenRef = useRef(null);

  useEffect(() => {
    if (!response || !response.escalation) return;
    const spokenText = `${response.reason}. ${response.action}`;
    if (lastSpokenRef.current === spokenText) return;
    lastSpokenRef.current = spokenText;
    speak(spokenText, outputLanguage);
  }, [response, outputLanguage, speak]);

  if (!response || !response.escalation) return null;

  return (
    <div role="alert" className="escalation-banner">
      <h2>
        <span aria-hidden="true">⚠</span> This needs human attention
      </h2>
      <p>{response.reason}</p>
      <p>{response.action}</p>
      {isSupported && (
        <button
          type="button"
          onClick={() =>
            isSpeaking ? stop() : speak(`${response.reason}. ${response.action}`, outputLanguage)
          }
        >
          {isSpeaking ? 'Stop reading aloud' : 'Read alert aloud'}
        </button>
      )}
    </div>
  );
}
