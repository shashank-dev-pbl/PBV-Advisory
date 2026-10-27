import "./proto.css";

// Shown the instant a page is clicked, while the next one loads, so the click is clearly registered.
export default function Loading() {
  return (
    <div className="p5" role="status" aria-live="polite" aria-label="Loading">
      <div className="pageload">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, color: "#57544a", fontSize: 13 }}><span className="spin" />Loading…</div>
        <div className="sk" style={{ height: 38, width: "38%", marginBottom: 14 }} />
        <div className="sk" style={{ height: 120, marginBottom: 14 }} />
        <div className="sk" style={{ height: 220 }} />
      </div>
    </div>
  );
}
