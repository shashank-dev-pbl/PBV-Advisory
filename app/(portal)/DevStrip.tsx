import Link from "next/link";
import { WHO_LABEL, type Who } from "@/lib/access";

const ORDER: Who[] = ["founder", "external", "pba", "admin"];

// Only rendered while real sign-in is off. Not part of the product: it stands in for signing in as each account type.
export default function DevStrip({ who }: { who: Who }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-[12px]" style={{ background: "#1f1f1a", color: "#d9d6c8" }}>
      <b className="mr-1">Dev preview — view as:</b>
      {ORDER.map((w) => (
        <Link
          key={w}
          href={`/dev/as/${w}`}
          prefetch={false}
          className="rounded-full px-3 py-1 font-semibold"
          style={{ background: w === who ? "#f4efe4" : "transparent", color: w === who ? "#1f1f1a" : "#d9d6c8", border: "1px solid #5a5a50" }}
        >
          {WHO_LABEL[w]}
        </Link>
      ))}
      <span className="ml-auto opacity-70">Real sign-in is off. This strip is not part of the product.</span>
    </div>
  );
}
