import { useCallback, useRef, useState } from 'react';

export function useSpeechRecognition({ lang = 'en-US' } = {}) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const isSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = useCallback(
    (onResult, onError) => {
      if (!isSupported) {
        if (onError) onError(new Error('SpeechRecognition is not supported in this browser'));
        return;
      }

      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        onResult(transcript);
      };
      recognition.onerror = (event) => {
        setIsListening(false);
        if (onError) onError(event);
      };
      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    },
    [lang, isSupported]
  );

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  return { isSupported, isListening, start, stop };
}
