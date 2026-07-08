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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>This needs human attention</span>
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
          {isSpeaking ? (
            /* Stop square icon */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
              <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
            </svg>
          ) : (
            /* Volume/Speaker outline icon */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
          <span>{isSpeaking ? 'Stop reading aloud' : 'Read alert aloud'}</span>
        </button>
      )}
    </div>
  );
}
