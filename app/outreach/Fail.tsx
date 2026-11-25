// Shown when the outreach tables cannot be read (the migration has not been run on this project, or the database is down).
export default function Fail({ detail }: { detail: string }) {
  return (
    <div className="wrap">
      <div className="banner bad">
        <b>Could not load the outreach data.</b> {detail}
        {/does not exist|schema cache|column/i.test(detail) && <p style={{ margin: "6px 0 0" }}>The database on this deployment is missing the outreach v3 changes. Run <span className="mono">20261110_outreach_v3.sql</span> in this project&apos;s SQL editor.</p>}
      </div>
    </div>
  );
}
