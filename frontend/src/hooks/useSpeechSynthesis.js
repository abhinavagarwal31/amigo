import { useCallback, useState } from 'react';

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isSupported =
    typeof window !== 'undefined' &&
    !!window.speechSynthesis &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  const speak = useCallback(
    (text, lang = 'en-US') => {
      if (!isSupported || !text) return;

      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = lang;

      const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      const languagePrefix = lang.split('-')[0];
      const matchedVoice =
        voices.find((voice) => voice.lang === lang) ||
        voices.find((voice) => voice.lang.startsWith(languagePrefix));
      if (matchedVoice) utterance.voice = matchedVoice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [isSupported]
  );

  const stop = useCallback(() => {
    if (isSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  return { isSupported, isSpeaking, speak, stop };
}
