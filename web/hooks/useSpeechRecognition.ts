"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type RecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type Ctor = new () => RecognitionInstance;

function getRecognitionCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone blocked — allow access in the browser address bar or System Settings.";
    case "no-speech":
      return "No speech detected — try again and speak right after tapping Voice.";
    case "audio-capture":
      return "No microphone found or it is in use by another app.";
    case "network":
      return "Speech recognition needs a network connection (browser uses a cloud service).";
    case "aborted":
      return "";
    default:
      return code ? `Voice error: ${code}` : "Could not capture speech.";
  }
}

export function useSpeechRecognition() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const hadErrorRef = useRef(false);

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, []);

  const listen = useCallback((onText: (t: string) => void) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Voice input is not supported in this browser (try Chrome or Safari).");
      return;
    }

    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }

    setError(null);
    hadErrorRef.current = false;

    const r = new Ctor();
    recognitionRef.current = r;

    r.lang =
      typeof navigator !== "undefined" && navigator.language?.startsWith("en") ? navigator.language : "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    let finals = "";
    let lastInterim = "";

    r.onresult = (ev: Event) => {
      const e = ev as unknown as SpeechRecognitionEventLike;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const chunk = res?.[0]?.transcript ?? "";
        if (res.isFinal) {
          finals += chunk;
          lastInterim = "";
        } else {
          lastInterim = chunk;
        }
      }
    };

    r.onerror = (ev: Event) => {
      const code = (ev as unknown as SpeechRecognitionErrorEventLike).error;
      hadErrorRef.current = true;
      const msg = speechErrorMessage(code);
      if (msg) setError(msg);
      setListening(false);
      recognitionRef.current = null;
    };

    r.onstart = () => setListening(true);

    r.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (hadErrorRef.current) return;
      const out = (finals.trim() || lastInterim.trim());
      if (out) {
        onText(out);
      } else {
        setError("No speech detected — speak clearly after tapping Voice, or type your scenario.");
      }
    };

    try {
      r.start();
    } catch {
      setError("Could not start voice capture.");
      setListening(false);
      recognitionRef.current = null;
    }
  }, []);

  return { supported, listening, error, listen };
}
