"use client";

import { useState } from "react";
import { completeOnboarding } from "./actions";

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  practitioner: "Practitioner",
  pba: "PBA",
};

export default function OnboardingForm({ role }: { role: string }) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    try {
      await completeOnboarding(name.trim(), position.trim());
      window.location.href = "/";
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-5" style={{ background: "var(--paper)" }}>
      <div className="w-full max-w-[400px]">
        <p className="eyebrow mb-3" style={{ color: "var(--bottomline-green)" }}>
          Prime Bottomline Advisory
        </p>
        <h1 className="text-[28px] font-extrabold leading-[1.05] tracking-[-0.02em]">
          Complete your profile
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6]" style={{ color: "var(--ink-secondary)" }}>
          Signing in as {ROLE_LABEL[role] ?? role}. This is what the rest of the team sees.
        </p>
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
          <input
            type="text"
            required
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
          />
          <input
            type="text"
            required
            placeholder="Position (e.g. Founder & CEO, Audit Partner)"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="input-field"
          />
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Saving…" : "Continue"}
          </button>
          {errorMsg && <p className="text-[12px]" style={{ color: "#8c1a1a" }}>{errorMsg}</p>}
        </form>
      </div>
    </div>
  );
}
