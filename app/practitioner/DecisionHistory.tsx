import type { DocItem } from "@/lib/types";

type TeamUser = { id: string; name: string | null; role: string };

export default function DecisionHistory({ items, teamUsers }: { items: DocItem[]; teamUsers: TeamUser[] }) {
  const byId = new Map(teamUsers.map((u) => [u.id, u]));
  const decided = items
    .filter((i) => i.status === "accepted" || i.status === "not_applicable")
    .map((i) => {
      if (i.status === "accepted") {
        return { item: i, when: i.accepted_at, by: i.accepted_by, label: "Accepted" as const };
      }
      return { item: i, when: i.na_at, by: i.na_by, label: "Not applicable" as const };
    })
    .filter((d) => d.when)
    .sort((a, b) => new Date(b.when!).getTime() - new Date(a.when!).getTime());

  if (decided.length === 0) return null;

  return (
    <section className="mt-10">
      <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>
        Decision history
      </p>
      <div className="flex flex-col gap-1">
        {decided.map((d) => {
          const actor = d.by ? byId.get(d.by) : null;
          const actorLabel = actor ? (actor.name ?? actor.role) : "—";
          return (
            <div key={d.item.id} className="flex items-center justify-between gap-3 p-3" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{d.item.title}</p>
                {d.label === "Not applicable" && d.item.na_reason && (
                  <p className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>{d.item.na_reason}</p>
                )}
              </div>
              <div className="flex-shrink-0 text-right">
                <span
                  className="pill"
                  style={{
                    background: d.label === "Accepted" ? "rgba(0,77,0,0.08)" : "rgba(107,99,87,0.12)",
                    color: d.label === "Accepted" ? "var(--status-accepted)" : "var(--ink-secondary)",
                  }}
                >
                  {d.label}
                </span>
                <p className="mt-1 text-[11px]" style={{ color: "var(--ink-secondary)" }}>
                  {new Date(d.when!).toLocaleDateString()} · {actorLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
