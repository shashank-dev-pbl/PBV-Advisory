"use client";

import { useCallback, useRef, useState } from "react";

// A message that appears at the bottom of the screen for a few seconds.
export function useToast(): [React.ReactNode, (m: string) => void] {
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 4200);
  }, []);
  return [<div key="toast" className={`toast${on ? " on" : ""}`} role="status">{msg}</div>, show];
}
