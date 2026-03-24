"use client";

import { useCallback, useEffect, useState } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type Ctor = new () => Recognition;

function getRecognitionCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
  }, []);

  const listen = useCallback(
    (onText: (t: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setError("Voice input is not supported in this browser.");
        return;
      }
      setError(null);
      const r = new Ctor();
      r.lang = "en-GB";
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (ev: Event) => {
        const result = (ev as unknown as { results: { 0: { 0: { transcript: string } } } }).results[0][0]
          .transcript;
        onText(result.trim());
      };
      r.onerror = () => {
        setError("Could not capture speech. Check microphone permission.");
        setListening(false);
      };
      r.onend = () => setListening(false);
      setListening(true);
      try {
        r.start();
      } catch {
        setError("Could not start voice capture.");
        setListening(false);
      }
    },
    []
  );

  return { supported, listening, error, listen };
}
