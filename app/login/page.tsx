"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-5" style={{ background: "var(--paper)" }}>
      <div className="w-full max-w-[400px]">
        <p className="eyebrow mb-3" style={{ color: "var(--bottomline-green)" }}>
          Prime Bottomline Advisory
        </p>
        <h1 className="text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em]">
          Xploro <span style={{ color: "var(--bottomline-green)" }}>CFO Portal</span>
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6]" style={{ color: "var(--ink-secondary)" }}>
          Enter your email and we&apos;ll send you a sign-in link. No password needed.
        </p>

        {status === "sent" ? (
          <div className="mt-8 p-5" style={{ background: "rgba(0,77,0,0.06)", border: "1px solid rgba(0,77,0,0.18)" }}>
            <p className="text-[14px] font-bold" style={{ color: "var(--bottomline-green)" }}>Check your email</p>
            <p className="mt-1.5 text-[13px] leading-[1.55]" style={{ color: "var(--ink-secondary)" }}>
              We sent a sign-in link to <strong style={{ color: "var(--ink)" }}>{email}</strong>. Open it on this device to continue.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
            />
            <button type="submit" disabled={status === "sending"} className="btn-primary">
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
            {status === "error" && (
              <p className="text-[12px]" style={{ color: "#8c1a1a" }}>{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
