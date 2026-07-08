import { useState } from 'react';
import PropTypes from 'prop-types';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

export function VoiceInputButton({ lang, onTranscript, disabled }) {
  const { isSupported, isListening, start, stop } = useSpeechRecognition({ lang });
  const [error, setError] = useState(null);

  // No native SpeechRecognition in this browser: the text input in QueryInput
  // remains the fully functional path, so we simply omit the mic control.
  if (!isSupported) return null;

  const handleClick = () => {
    if (isListening) {
      stop();
      return;
    }
    setError(null);
    start(
      (transcript) => onTranscript(transcript),
      () => setError('Voice input failed. Please type your question instead.')
    );
  };

  return (
    <div className="voice-input">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={isListening}
        className={isListening ? 'voice-btn voice-btn--listening' : 'voice-btn'}
      >
        {isListening ? (
          /* Stop square outline icon */
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
          </svg>
        ) : (
          /* Mic outline icon */
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        )}
        <span>{isListening ? 'Stop listening' : 'Speak your question'}</span>
      </button>
      {isListening && (
        <p role="status" className="voice-status">
          Listening…
        </p>
      )}
      {error && (
        <p role="alert" className="voice-error">
          {error}
        </p>
      )}
    </div>
  );
}

VoiceInputButton.propTypes = {
  lang: PropTypes.string.isRequired,
  onTranscript: PropTypes.func.isRequired,
  disabled: PropTypes.bool
};
