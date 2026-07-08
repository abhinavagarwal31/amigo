import { useCallback, useEffect, useRef, useState } from 'react';

// Browsers flag one voice per language as `default` (their own best/native pick) — without
// preferring that, `find()` would grab whichever voice the OS happens to enumerate first,
// which can be a legacy low-quality voice (e.g. macOS's robotic "Fred").
function pickVoice(voices, lang) {
  const languagePrefix = lang.split('-')[0];
  const candidates = voices.filter(
    (voice) => voice.lang === lang || voice.lang.startsWith(languagePrefix)
  );
  return candidates.find((voice) => voice.default) || candidates[0] || null;
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voicesRef = useRef([]);

  const isSupported =
    typeof window !== 'undefined' &&
    !!window.speechSynthesis &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  useEffect(() => {
    if (!isSupported) return undefined;

    const synth = window.speechSynthesis;
    voicesRef.current = synth.getVoices ? synth.getVoices() : [];

    // Voices load asynchronously in most browsers, so the getVoices() call above often
    // returns an empty list on first mount; this keeps the cache current once they arrive.
    if (typeof synth.addEventListener !== 'function') return undefined;
    const handleVoicesChanged = () => {
      voicesRef.current = synth.getVoices();
    };
    synth.addEventListener('voiceschanged', handleVoicesChanged);
    return () => synth.removeEventListener('voiceschanged', handleVoicesChanged);
  }, [isSupported]);

  const speak = useCallback(
    (text, lang = 'en-US') => {
      if (!isSupported || !text) return;

      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = lang;

      const matchedVoice = pickVoice(voicesRef.current, lang);
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
