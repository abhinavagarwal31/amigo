import { useEffect, useRef } from 'react';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { getLanguageDir } from '../constants';

export function AnswerCard({ response, outputLanguage }) {
  const { isSupported, isSpeaking, speak, stop } = useSpeechSynthesis();
  const lastSpokenRef = useRef(null);

  useEffect(() => {
    if (!response || !response.answer) return;
    if (lastSpokenRef.current === response.answer) return;
    lastSpokenRef.current = response.answer;
    speak(response.answer, outputLanguage);
  }, [response, outputLanguage, speak]);

  if (!response || response.escalation) return null;

  const textDir = getLanguageDir(outputLanguage);

  return (
    <section aria-labelledby="answer-heading" className="answer-card">
      <h2 id="answer-heading">Answer</h2>
      <p className="answer-text" dir={textDir}>
        {response.answer}
      </p>
      <p className="answer-meta">
        Category: {response.category} · Confidence: {response.confidence}
      </p>
      {response.confidence === 'low' && (
        <p className="answer-warning">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Low confidence — please double-check with venue staff.</span>
        </p>
      )}
      {isSupported && (
        <button
          type="button"
          onClick={() => (isSpeaking ? stop() : speak(response.answer, outputLanguage))}
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
          <span>{isSpeaking ? 'Stop reading aloud' : 'Read aloud'}</span>
        </button>
      )}
      {response.sourceDocs && response.sourceDocs.length > 0 && (
        <details>
          <summary>Sources</summary>
          <ul>
            {response.sourceDocs.map((doc, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={index}>{doc.text}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
