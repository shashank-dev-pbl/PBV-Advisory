"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DEV_AS_COOKIE, WHO_LABEL, type Who } from "@/lib/access";

const ORDER: Who[] = ["founder", "external", "pba", "admin"];

function currentRole(): Who {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${DEV_AS_COOKIE}=`));
  const v = hit?.split("=")[1] as Who | undefined;
  return v && ORDER.includes(v) ? v : "external";
}

// Only rendered while real sign-in is off. Not part of the product: it stands in for signing in as each account type.
// Reads the role from the cookie on every navigation (and when the tab regains focus), so it can never show
// a different role from the page — even if another tab switched it.
export default function DevStrip({ note }: { note?: string }) {
  const pathname = usePathname();
  const [who, setWho] = useState<Who | null>(null);
  useEffect(() => {
    const sync = () => setWho(currentRole());
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [pathname]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-[12px]" style={{ background: "#1f1f1a", color: "#d9d6c8" }}>
      <b className="mr-1">Dev preview — view as:</b>
      {ORDER.map((w) => (
        <a
          key={w}
          href={`/dev/as/${w}`}
          className="rounded-full px-3 py-1 font-semibold"
          style={{ background: w === who ? "#f4efe4" : "transparent", color: w === who ? "#1f1f1a" : "#d9d6c8", border: "1px solid #5a5a50" }}
        >
          {WHO_LABEL[w]}
        </a>
      ))}
      <span className="ml-auto opacity-70">{note ? `${note} · ` : ""}Real sign-in is off. Not part of the product.</span>
    </div>
  );
}
