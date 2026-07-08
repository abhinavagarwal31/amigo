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
          <span aria-hidden="true">⚠</span> Low confidence — please double-check with venue
          staff.
        </p>
      )}
      {isSupported && (
        <button
          type="button"
          onClick={() => (isSpeaking ? stop() : speak(response.answer, outputLanguage))}
        >
          {isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
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
