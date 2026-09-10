"use client";

import { getSignedDownloadUrl } from "@/app/founder/actions";

export default function DownloadLink({ storagePath }: { storagePath: string }) {
  async function handleDownload() {
    const url = await getSignedDownloadUrl(storagePath);
    window.open(url, "_blank");
  }
  return (
    <button onClick={handleDownload} className="text-[12.5px] font-semibold" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--bottomline-green)" }}>
      Download
    </button>
  );
}
