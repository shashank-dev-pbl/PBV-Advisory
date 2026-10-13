"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone } from "@/lib/phone";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";

export default function LoginPage() {

  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Phone OTP isn't live while DEV_BYPASS_AUTH is on — bounce straight back
  // rather than stranding anyone who lands here (a stale bookmark, a redirect
  // loop) on a form that can't actually sign them in.
  useEffect(() => {
    if (DEV_BYPASS_AUTH) window.location.href = "/";
    // Sent back here after a sign-in that did not produce an account: say why instead of looping silently.
    const why = new URLSearchParams(window.location.search).get("e");
    if (why && why !== "no_session") {
      const message = `Signed in, but no account was found: ${why}`;
      setTimeout(() => { setErrorMsg(message); setStatus("error"); }, 0);
    }
  }, []);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    setErrorMsg("");
    const supabase = createClient();
    const phone = normalizePhone(phoneInput);

    // 'ok' = registered and added to a company (or a platform admin); 'no_company' = registered but not added to any.
    let status: string | null = null;
    const check = await supabase.rpc("phone_login_status", { p_phone: phone });
    if (!check.error) {
      status = check.data as string;
    } else {
      // Database not updated yet: fall back to the older "is this number registered" check.
      const legacy = await supabase.rpc("is_phone_registered", { p_phone: phone });
      if (legacy.error) {
        setErrorMsg(legacy.error.message);
        setStatus("error");
        return;
      }
      status = legacy.data ? "ok" : "unknown";
    }
    if (status === "no_company") {
      setErrorMsg("You aren't added to any company yet. Ask Prime Bottomline Advisory to add you, then try again.");
      setStatus("error");
      return;
    }
    if (status !== "ok") {
      setErrorMsg("This number isn't registered. Contact Prime Bottomline Advisory to get access.");
      setStatus("error");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({ phone: `+${phone}` });
    if (error) {
      setErrorMsg(error.message);
      setStatus("error");
      return;
    }
    setStatus("idle");
    setStep("code");
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    setErrorMsg("");
    const supabase = createClient();
    const phone = normalizePhone(phoneInput);

    const { error } = await supabase.auth.verifyOtp({ phone: `+${phone}`, token: code, type: "sms" });
    if (error) {
      setErrorMsg(error.message);
      setStatus("error");
      return;
    }
    // Links the number they just proved to the person an admin added (first sign-in only).
    const claim = await supabase.rpc("claim_app_user");
    if (claim.error) {
      setErrorMsg(`Signed in, but your account could not be linked: ${claim.error.message}`);
      setStatus("error");
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="flex flex-1 items-center justify-center px-5" style={{ background: "var(--paper)" }}>
      <div className="w-full max-w-[400px]">
        <p className="eyebrow mb-3" style={{ color: "var(--bottomline-green)" }}>
          Prime Bottomline Advisory
        </p>
        <h1 className="text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em]">
          Advisory <span style={{ color: "var(--bottomline-green)" }}>Portal</span>
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6]" style={{ color: "var(--ink-secondary)" }}>
          {step === "phone"
            ? "Enter your registered mobile number and we'll text you a code."
            : `Enter the code sent to +${normalizePhone(phoneInput)}.`}
        </p>

        {step === "phone" ? (
          <form onSubmit={handleSendCode} className="mt-8 flex flex-col gap-3">
            <div className="flex items-stretch gap-2">
              <span
                className="input-field flex items-center justify-center"
                style={{ flex: "0 0 auto", width: 56, textAlign: "center" }}
              >
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                required
                placeholder="98765 43210"
                maxLength={10}
                autoFocus
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="input-field"
                style={{ flex: 1 }}
              />
            </div>
            <button type="submit" disabled={status === "busy"} className="btn-primary">
              {status === "busy" ? "Checking…" : "Send code"}
            </button>
            {status === "error" && (
              <p className="text-[12px]" style={{ color: "#8c1a1a" }}>{errorMsg}</p>
            )}
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="mt-8 flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              required
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="input-field"
            />
            <button type="submit" disabled={status === "busy"} className="btn-primary">
              {status === "busy" ? "Verifying…" : "Verify and sign in"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("phone"); setCode(""); setStatus("idle"); setErrorMsg(""); }}
              className="text-[12px] font-semibold self-start"
              style={{ color: "var(--ink-secondary)" }}
            >
              Use a different number
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
