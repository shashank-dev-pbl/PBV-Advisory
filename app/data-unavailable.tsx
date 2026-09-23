// Shown instead of redirecting when a required row (e.g. company) can't be
// read — a database restart, a transient outage, or (on the free tier) the
// project waking up from auto-pause. Redirecting to "/" here would bounce
// straight back into the same failing page for a signed-in role, looping.
export default function DataUnavailable() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5" style={{ background: "var(--paper)" }}>
      <div className="max-w-[360px] text-center">
        <p className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>Couldn&apos;t load your data</p>
        <p className="mt-2 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          The database may still be waking up. Wait a few seconds and reload.
        </p>
        <a
          href="."
          className="mt-4 inline-block text-[13px] font-semibold"
          style={{ color: "var(--bottomline-green)" }}
        >
          Reload
        </a>
      </div>
    </div>
  );
}
