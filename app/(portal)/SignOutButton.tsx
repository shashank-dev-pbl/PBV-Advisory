"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }
  return (
    <button onClick={signOut} aria-label="Sign out" title="Sign out" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}>
      <LogOut size={18} strokeWidth={1.75} style={{ color: "var(--ink-secondary)" }} />
    </button>
  );
}
