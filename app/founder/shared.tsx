"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import type { DocItem, DocItemMessage } from "@/lib/types";
import { getSignedDownloadUrl } from "./actions";

// Small shared pieces: the file rows used by the Uploads tabs, and the progress ring.

export function sortedFiles(files: DocItem["doc_file"]) {
  if (!files || files.length === 0) return [];
  return [...files].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
}

export function sortedMessages(item: DocItem): DocItemMessage[] {
  return [...(item.doc_item_message ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export type CurrentUser = { id: string; name: string | null; position: string | null; role: "founder" | "practitioner" | "pba" };

export function CircularProgress({ pct, size = 48, strokeWidth = 4, label }: { pct: number; size?: number; strokeWidth?: number; label?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--rule)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bottomline-green)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[12px] font-extrabold tnum" style={{ color: "var(--bottomline-green)" }}>{label ?? `${pct}%`}</span>
      </div>
    </div>
  );
}

export function VersionHistory({ files }: { files: NonNullable<DocItem["doc_file"]> }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="text-[11px] font-semibold"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-secondary)", padding: 0 }}
      >
        {open ? "Hide" : "Show"} previous version{files.length > 1 ? "s" : ""} ({files.length})
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-2">
          {files.map((f) => (
            <div key={f.id} style={{ opacity: 0.65 }}>
              <FileRow filename={f.filename} storagePath={f.storage_path} />
              <p className="-mt-1 text-[10px]" style={{ color: "var(--ink-secondary)" }}>
                replaced {new Date(f.uploaded_at).toLocaleDateString()} · {new Date(f.uploaded_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FileRow({
  filename,
  storagePath,
  onDelete,
}: {
  filename: string;
  storagePath: string;
  onDelete?: () => void;
}) {
  async function handleDownload() {
    const url = await getSignedDownloadUrl(storagePath);
    window.open(url, "_blank");
  }
  return (
    <div
      className="flex items-center justify-between gap-3 border-b py-2"
      style={{ borderColor: "var(--rule)" }}
    >
      <span className="truncate text-[13px]" style={{ color: "var(--ink)" }}>{filename}</span>
      <div className="flex flex-shrink-0 items-center gap-3">
        <button onClick={handleDownload} aria-label="Download file" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 }}>
          <Download size={15} strokeWidth={1.75} style={{ color: "var(--ink-secondary)" }} />
        </button>
        {onDelete && (
          <button onClick={onDelete} aria-label="Delete file" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 }}>
            <Trash2 size={15} strokeWidth={1.75} style={{ color: "var(--status-query)" }} />
          </button>
        )}
      </div>
    </div>
  );
}
