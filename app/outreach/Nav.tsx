"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const VIEWS: [string, string, string][] = [
  ["/outreach", "Dashboard", "dashboard"],
  ["/outreach/pipeline", "Pipeline", "pipeline"],
  ["/outreach/queue", "Swetha's queue", "queue"],
  ["/outreach/messages", "Messages & AI", "messages"],
  ["/outreach/rules", "Sequence & rules", "rules"],
  ["/outreach/sources", "Sources", "sources"],
];

export default function Nav({ replies, toApprove }: { replies: number; toApprove: number }) {
  const path = usePathname();
  return (
    <nav>
      {VIEWS.map(([href, label, id]) => {
        const on = href === "/outreach" ? path === href : path.startsWith(href);
        return (
          <Link key={id} href={href} className={on ? "on" : ""}>
            <span>{label}</span>
            {id === "queue" && replies > 0 && <span className="cnt hot">{replies}</span>}
            {id === "pipeline" && toApprove > 0 && <span className="cnt">{toApprove} to approve</span>}
          </Link>
        );
      })}
    </nav>
  );
}
