"use client";

import * as React from "react";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
  length: number;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function useSpeechRecognition(onTranscript: (text: string) => void) {
  const [supported, setSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [error, setError] = React.useState("");
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const callbackRef = React.useRef(onTranscript);
  callbackRef.current = onTranscript;

  React.useEffect(() => {
    setSupported(Boolean(getConstructor()));
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const start = React.useCallback(() => {
    const Constructor = getConstructor();
    if (!Constructor) {
      setError("当前浏览器不支持语音输入，请使用 Chrome 或 Edge，或直接输入文字。");
      return;
    }
    setError("");
    const recognition = new Constructor();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let text = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        text += event.results[index][0].transcript;
      }
      if (text.trim()) callbackRef.current(text.trim());
    };
    recognition.onerror = (event) => {
      setListening(false);
      const messages: Record<string, string> = {
        "not-allowed": "麦克风权限被拒绝，请在浏览器地址栏允许麦克风权限。",
        "no-speech": "没有识别到语音，请再试一次。",
        network: "语音识别服务暂时不可用，请检查网络或直接输入文字。",
      };
      setError(messages[event.error] || "语音识别失败，请直接输入文字。");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("无法启动语音输入，请直接输入文字。");
      setListening(false);
    }
  }, []);

  const stop = React.useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, error, start, stop };
}
