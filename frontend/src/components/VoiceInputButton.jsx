import { useState } from 'react';
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
        <span aria-hidden="true">{isListening ? '⏹' : '\u{1F3A4}'}</span>{' '}
        {isListening ? 'Stop listening' : 'Speak your question'}
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
