"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Trash2, TriangleAlert, MessageCircle, Send, X, LogOut, LayoutDashboard, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentPeriod, formatPeriodLabel } from "@/lib/period";
import { safeStorageSegment } from "@/lib/storagePath";
import { isResolved, isReceived } from "@/lib/docItemStatus";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import type { Company, DocItem, DocItemMessage, Deliverable } from "@/lib/types";
import { recordUpload, deleteUpload, deleteFile, markNilReturn, sendFounderMessage, markFounderRead, saveRevenueInfo, getSignedDownloadUrl } from "./actions";

type ChipStyle = { label: string; bg: string; color: string };

function statusChip(item: DocItem): ChipStyle {
  switch (item.status) {
    case "accepted":
      return { label: "Accepted", bg: "rgba(0,77,0,0.08)", color: "var(--status-accepted)" };
    case "query":
      return { label: "Question from us", bg: "rgba(140,26,26,0.08)", color: "var(--status-query)" };
    case "uploaded":
      return { label: "With us", bg: "rgba(184,134,11,0.1)", color: "var(--status-uploaded)" };
    case "not_applicable":
      return {
        label: item.na_reason === "Founder confirmed — none to report" ? "You said: none" : "Not applicable",
        bg: "rgba(107,99,87,0.12)",
        color: "var(--ink-secondary)",
      };
    default:
      return { label: "Not started", bg: "rgba(107,99,87,0.12)", color: "var(--ink-secondary)" };
  }
}

// Re-exported for callers that already import these from here (e.g. PractitionerView.tsx) —
// the actual definitions live in lib/docItemStatus.ts so server components can use them too.
export { isResolved, isReceived };

export function sortedFiles(files: DocItem["doc_file"]) {
  if (!files || files.length === 0) return [];
  return [...files].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
}

export function latestOf(files: DocItem["doc_file"]) {
  return sortedFiles(files)[0] ?? null;
}

export function sortedMessages(item: DocItem): DocItemMessage[] {
  return [...(item.doc_item_message ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function hasUnreadFor(item: DocItem, role: "founder" | "practitioner"): boolean {
  const messages = sortedMessages(item);
  const lastFromOther = [...messages].reverse().find((m) => m.sender !== role);
  if (!lastFromOther) return false;
  const readAt = role === "founder" ? item.founder_last_read_at : item.practitioner_last_read_at;
  if (!readAt) return true;
  return new Date(lastFromOther.created_at).getTime() > new Date(readAt).getTime();
}

function groupItems(items: DocItem[]) {
  const groups = new Map<string, DocItem[]>();
  for (const item of items) {
    if (!groups.has(item.group_name)) groups.set(item.group_name, []);
    groups.get(item.group_name)!.push(item);
  }
  return groups;
}

function GroupSection({
  groupName,
  items,
  companyId,
  currentUserId,
  onPatch,
}: {
  groupName: string;
  items: DocItem[];
  companyId: string;
  currentUserId: string;
  onPatch: (id: string, patch: Partial<DocItem>) => void;
}) {
  return (
    <section className="mb-8">
      <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink-secondary)" }}>
        {groupName}
      </p>
      <div className="flex flex-col gap-2.5">
        {items.map((item) => (
          <ChecklistCard key={item.id} item={item} companyId={companyId} currentUserId={currentUserId} onPatch={onPatch} />
        ))}
      </div>
    </section>
  );
}

export type CurrentUser = { id: string; name: string | null; position: string | null; role: "founder" | "practitioner" | "pba" };

export default function FounderView({
  company,
  docItems,
  deliveredItems,
  currentUser,
}: {
  company: Company;
  docItems: DocItem[];
  deliveredItems: Deliverable[];
  currentUser: CurrentUser;
}) {
  const [items, setItems] = useState(docItems);
  const [showCosmetic, setShowCosmetic] = useState(false);
  const received = items.filter((i) => isReceived(i.status)).length;
  const total = items.length;

  const mustItems = items.filter((i) => i.priority === "must");
  const mustResolved = mustItems.filter((i) => isReceived(i.status)).length;
  const mustTotal = mustItems.length;
  const pct = mustTotal > 0 ? Math.round((mustResolved / mustTotal) * 100) : 0;

  const unresolvedMust = mustItems.filter((i) => !isReceived(i.status));
  const nextDue = unresolvedMust
    .map((i) => i.due_date)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null;
  const daysUntilDue = nextDue ? Math.ceil((new Date(nextDue).getTime() - Date.now()) / 86400000) : null;

  const mustGoodItems = items.filter((i) => i.priority !== "cosmetic");
  const cosmeticItems = items.filter((i) => i.priority === "cosmetic");
  const groupedMustGood = useMemo(() => groupItems(mustGoodItems), [mustGoodItems]);
  const groupedCosmetic = useMemo(() => groupItems(cosmeticItems), [cosmeticItems]);

  const questionCount = items.filter((i) => i.status === "query").length;

  const needsRevenueInfo = !company.revenue_classification || !company.gross_net_billing;

  function patchItem(id: string, patch: Partial<DocItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--paper)" }}>
      <div className="sticky top-0 z-40">
        <header
          className="flex items-center justify-between border-b px-5 py-4 md:px-8"
          style={{ background: "var(--paper)", borderColor: "var(--rule)" }}
        >
          <div className="flex items-center gap-4">
            <div>
              <p className="eyebrow mb-1" style={{ color: "var(--bottomline-green)" }}>Prime Bottomline Advisory</p>
              <h1 className="text-[22px] font-extrabold">{company.name} <span style={{ color: "var(--bottomline-green)" }}>· Founder</span></h1>
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{formatPeriodLabel(currentPeriod())}</p>
            </div>
            <CircularProgress pct={pct} />
            <div>
              <p className="text-[12px] font-bold tnum" style={{ color: "var(--ink)" }}>{mustResolved} of {mustTotal} essentials</p>
              <p className="mt-0.5 text-[11px] tnum" style={{ color: "var(--ink-secondary)" }}>{received} of {total} in total</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/founder/dashboard"
              className="btn-small"
              style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", gap: 6 }}
            >
              <LayoutDashboard size={13} strokeWidth={1.75} />
              Dashboard
            </Link>
            <Link
              href="/year"
              className="btn-small"
              style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", gap: 6 }}
            >
              <CalendarDays size={13} strokeWidth={1.75} />
              Year
            </Link>
            <div style={{ width: 1, height: 28, background: "var(--rule)" }} />
            <UserMenu user={currentUser} />
          </div>
        </header>
      </div>

      <main className="mx-auto w-full max-w-[760px] px-5 py-8 md:px-8">
        {needsRevenueInfo && (
          <RevenueInfoBanner
            companyId={company.id}
            revenueClassification={company.revenue_classification ?? ""}
            grossNetBilling={company.gross_net_billing ?? ""}
          />
        )}

        {questionCount > 0 && (
          <div className="mb-8 p-4" style={{ background: "rgba(140,26,26,0.05)", border: "1px solid rgba(140,26,26,0.16)" }}>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--status-query)" }}>
              <TriangleAlert size={14} strokeWidth={1.75} />
              {questionCount} question{questionCount > 1 ? "s" : ""} need your answer
            </p>
          </div>
        )}

        <div className="mb-8 flex flex-wrap items-center gap-5 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
          <div>
            <p className="text-[18px] font-extrabold tnum" style={{ color: "var(--ink)" }}>{mustResolved} of {mustTotal} essentials</p>
            <p className="mt-0.5 text-[12px] tnum" style={{ color: "var(--ink-secondary)" }}>{received} of {total} items in total</p>
          </div>
          <div className="h-[7px] flex-1" style={{ minWidth: 140, background: "var(--rule)", borderRadius: 4, overflow: "hidden" }}>
            <div className="h-full" style={{ width: `${pct}%`, background: "var(--bottomline-green)", transition: "width 400ms ease" }} />
          </div>
          {daysUntilDue !== null && unresolvedMust.length > 0 && (
            <p className="whitespace-nowrap text-[12px]" style={{ color: "var(--ink-secondary)" }}>
              {unresolvedMust.length} item{unresolvedMust.length > 1 ? "s" : ""} left · due in {daysUntilDue} day{daysUntilDue === 1 ? "" : "s"}
            </p>
          )}
        </div>

        <div className="flex flex-col">
          {[...groupedMustGood.entries()].map(([groupName, groupItemsList]) => (
            <GroupSection
              key={groupName}
              groupName={groupName}
              items={groupItemsList}
              companyId={company.id}
              currentUserId={currentUser.id}
              onPatch={patchItem}
            />
          ))}
        </div>

        {cosmeticItems.length > 0 && (
          <section className="mb-8">
            {!showCosmetic ? (
              <button
                onClick={() => setShowCosmetic(true)}
                className="w-full p-4 text-left text-[13px]"
                style={{ background: "transparent", border: "1px dashed var(--rule)", color: "var(--ink-secondary)", cursor: "pointer" }}
              >
                <strong style={{ color: "var(--ink)" }}>{cosmeticItems.length} nice-to-have item{cosmeticItems.length > 1 ? "s" : ""}</strong> — never blocks anything. Show them →
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowCosmetic(false)}
                  className="mb-4 text-[12px] font-semibold"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-secondary)" }}
                >
                  Hide nice-to-have items
                </button>
                {[...groupedCosmetic.entries()].map(([groupName, groupItemsList]) => (
                  <GroupSection
                    key={groupName}
                    groupName={groupName}
                    items={groupItemsList}
                    companyId={company.id}
                    currentUserId={currentUser.id}
                    onPatch={patchItem}
                  />
                ))}
              </>
            )}
          </section>
        )}

        <p className="mt-2 text-center text-[11.5px] leading-[1.7]" style={{ color: "var(--ink-secondary)" }}>
          Items marked <strong style={{ color: "var(--ink)" }}>essential</strong> stop us producing your MIS. Everything else improves it but never holds it up.
          <br />
          If something is late we tell you the new delivery date rather than letting it drift.
        </p>

        {deliveredItems.length > 0 && (
          <section className="mt-10">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>
              What you&apos;ve received from us
            </p>
            <div className="flex flex-col gap-2">
              {deliveredItems.map((d) => (
                <DeliverableDownloadRow key={d.id} deliverable={d} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

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

const ROLE_LABEL: Record<CurrentUser["role"], string> = {
  founder: "Founder",
  practitioner: "Practitioner",
  pba: "PBA",
};

export function UserMenu({ user }: { user: CurrentUser }) {
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-3">
      <div className="text-right">
        <p className="truncate text-[13px] font-bold" style={{ color: "var(--ink)" }}>{user.name ?? ROLE_LABEL[user.role]}</p>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-secondary)" }}>{user.position ?? ROLE_LABEL[user.role]}</p>
      </div>
      {/* Sign-out hidden while DEV_BYPASS_AUTH is on — phone OTP isn't live yet, so
          signing out would strand whoever clicked it with no way back in. */}
      {!DEV_BYPASS_AUTH && (
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
        >
          <LogOut size={18} strokeWidth={1.75} style={{ color: "var(--ink-secondary)" }} />
        </button>
      )}
    </div>
  );
}

function RevenueInfoBanner({
  companyId,
  revenueClassification,
  grossNetBilling,
}: {
  companyId: string;
  revenueClassification: string;
  grossNetBilling: string;
}) {
  const [rev, setRev] = useState(revenueClassification);
  const [billing, setBilling] = useState(grossNetBilling);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await saveRevenueInfo(companyId, rev, billing);
    setSaving(false);
    setSaved(true);
  }

  if (saved) return null;

  return (
    <div className="mb-8 p-5" style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.3)" }}>
      <p className="mb-3 text-[13px] font-bold" style={{ color: "#7a5a00" }}>
        Before anything else — two quick questions
      </p>
      <label className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
        Revenue classification — how much is recurring subscription, hands-on service, or one-off project work?
      </label>
      <textarea className="input-field mb-3" rows={2} value={rev} onChange={(e) => setRev(e.target.value)} />
      <label className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
        Gross vs. net billing — where revenue is shared with a partner, are you invoiced the full amount or only your share?
      </label>
      <textarea className="input-field mb-3" rows={2} value={billing} onChange={(e) => setBilling(e.target.value)} />
      <button onClick={handleSave} disabled={saving || !rev || !billing} className="btn-primary">
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

export type ChatMessage = { text: string; mine: boolean; createdAt: string };

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatMessageDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function MessageButton({
  active,
  needsAttention,
  onClick,
}: {
  active: boolean;
  needsAttention: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Messages"
      style={{ position: "relative", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2, flexShrink: 0 }}
    >
      <MessageCircle size={16} strokeWidth={1.75} style={{ color: active ? "var(--status-query)" : "var(--ink-secondary)" }} />
      {needsAttention && (
        <span
          className="absolute rounded-full"
          style={{ top: -1, right: -1, width: 6, height: 6, background: "var(--status-query)" }}
        />
      )}
    </button>
  );
}

export function ChatPopover({
  onClose,
  messages,
  onSend,
  placeholder,
  theirLabel,
}: {
  onClose: () => void;
  messages: ChatMessage[];
  onSend?: (text: string) => Promise<void>;
  placeholder: string;
  theirLabel: string;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [onClose]);

  async function handleSend() {
    if (!text.trim() || !onSend || sending) return;
    setSending(true);
    await onSend(text.trim());
    setSending(false);
    setText("");
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-30 mt-2 flex flex-col"
      style={{ width: 288, background: "var(--paper)", border: "1px solid var(--rule)", boxShadow: "0 10px 28px rgba(0,0,0,0.16)" }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--rule)" }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink-secondary)" }}>Messages</p>
        <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
          <X size={14} strokeWidth={1.75} style={{ color: "var(--ink-secondary)" }} />
        </button>
      </div>

      <div className="flex flex-col gap-2 p-3" style={{ maxHeight: 220, overflowY: "auto" }}>
        {messages.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>No messages yet.</p>
        ) : (
          messages.map((m, i) => {
            const prevDate = i > 0 ? formatMessageDate(messages[i - 1].createdAt) : null;
            const thisDate = formatMessageDate(m.createdAt);
            const showDateSeparator = thisDate !== prevDate;
            return (
              <div key={i} className="flex flex-col">
                {showDateSeparator && (
                  <div className="my-1 flex justify-center">
                    <span
                      className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]"
                      style={{ background: "var(--paper-deep)", color: "var(--ink-secondary)", border: "1px solid var(--rule)" }}
                    >
                      {thisDate}
                    </span>
                  </div>
                )}
                <div className="flex flex-col" style={{ alignItems: m.mine ? "flex-end" : "flex-start" }}>
                  <p className="mb-0.5 px-1 text-[9px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--ink-secondary)" }}>
                    {m.mine ? "You" : theirLabel}
                  </p>
                  <div
                    className="px-3 py-2 text-[12px] leading-[1.4]"
                    style={{
                      maxWidth: "85%",
                      background: m.mine ? "var(--bottomline-green)" : "var(--paper-deep)",
                      color: m.mine ? "var(--paper)" : "var(--ink)",
                      border: m.mine ? "none" : "1px solid var(--rule)",
                      borderRadius: m.mine ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                    }}
                  >
                    {m.text}
                  </div>
                  <p className="mt-0.5 px-1 text-[9px]" style={{ color: "var(--ink-secondary)" }}>
                    {formatMessageTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {onSend && (
        <div className="flex gap-2 border-t p-2" style={{ borderColor: "var(--rule)" }}>
          <input
            className="input-field"
            style={{ minHeight: 34, padding: "6px 10px", fontSize: 12 }}
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            aria-label="Send message"
            style={{
              background: "var(--bottomline-green)",
              border: "1px solid var(--bottomline-green)",
              color: "var(--paper)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              flexShrink: 0,
              cursor: "pointer",
              opacity: !text.trim() || sending ? 0.5 : 1,
            }}
          >
            <Send size={14} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}

function ChecklistCard({
  item,
  companyId,
  currentUserId,
  onPatch,
}: {
  item: DocItem;
  companyId: string;
  currentUserId: string;
  onPatch: (id: string, patch: Partial<DocItem>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmingNil, setConfirmingNil] = useState(false);
  const [nilBusy, setNilBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  async function uploadFile(file: File, fileLabel?: string) {
    setUploading(true);
    const supabase = createClient();
    const path = `${companyId}/${item.id}/${Date.now()}-${safeStorageSegment(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("docs").upload(path, file);
    if (uploadError) {
      alert(uploadError.message);
      setUploading(false);
      return;
    }
    await recordUpload(item.id, path, file.name, fileLabel);
    setUploading(false);
    return path;
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = await uploadFile(file);
    e.target.value = "";
    if (!path) return;
    onPatch(item.id, {
      status: "uploaded",
      doc_file: [{ id: path, doc_item_id: item.id, storage_path: path, filename: file.name, label: null, uploaded_at: new Date().toISOString() }],
    });
  }

  async function handleAddLabeledFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || (item.needs_label && !label.trim())) return;
    const fileLabel = label.trim() || undefined;
    const path = await uploadFile(file, fileLabel);
    e.target.value = "";
    if (!path) return;
    onPatch(item.id, {
      status: "uploaded",
      doc_file: [
        ...(item.doc_file ?? []),
        { id: path, doc_item_id: item.id, storage_path: path, filename: file.name, label: fileLabel ?? null, uploaded_at: new Date().toISOString() },
      ],
    });
    setLabel("");
  }

  async function handleDelete() {
    const latestFile = latestOf(item.doc_file);
    if (!latestFile) return;
    await deleteUpload(item.id);
    onPatch(item.id, { status: "pending", doc_file: [] });
  }

  async function handleDeleteOne(fileId: string) {
    await deleteFile(fileId, item.id);
    const remaining = (item.doc_file ?? []).filter((f) => f.id !== fileId);
    onPatch(item.id, remaining.length > 0 ? { doc_file: remaining } : { doc_file: remaining, status: "pending" });
  }

  async function handleNilReturn() {
    if (!confirmingNil) {
      setConfirmingNil(true);
      return;
    }
    setNilBusy(true);
    await markNilReturn(item.id);
    onPatch(item.id, { status: "not_applicable", na_reason: "Founder confirmed — none to report", na_at: new Date().toISOString(), na_by: currentUserId });
    setNilBusy(false);
  }

  async function handleSendMessage(text: string) {
    const optimistic: DocItemMessage = {
      id: `local-${Date.now()}`,
      doc_item_id: item.id,
      sender: "founder",
      body: text,
      created_at: new Date().toISOString(),
    };
    await sendFounderMessage(item.id, text);
    onPatch(item.id, {
      founder_last_read_at: optimistic.created_at,
      doc_item_message: [...(item.doc_item_message ?? []), optimistic],
    });
  }

  async function handleInlineReply() {
    if (!reply.trim() || replying) return;
    setReplying(true);
    const text = reply.trim();
    setReply("");
    await handleSendMessage(text);
    setReplying(false);
  }

  function handleOpenChat() {
    const opening = !chatOpen;
    setChatOpen(opening);
    if (opening) {
      markFounderRead(item.id);
      onPatch(item.id, { founder_last_read_at: new Date().toISOString() });
    }
  }

  const files = sortedFiles(item.doc_file);
  const latestFile = files[0] ?? null;
  const olderFiles = files.slice(1);
  const hasFile = !!latestFile;
  const hasAnyFile = files.length > 0;
  const messages = sortedMessages(item);
  const hasMessages = messages.length > 0;
  const unread = hasUnreadFor(item, "founder");
  const chatMessages: ChatMessage[] = messages.map((m) => ({ text: m.body, mine: m.sender === "founder", createdAt: m.created_at }));
  const chip = statusChip(item);
  const isQuery = item.status === "query";
  const latestQuery = isQuery ? [...messages].reverse().find((m) => m.sender === "practitioner") : undefined;

  return (
    <div
      className="p-4"
      style={{
        background: isQuery ? "#fffcf3" : "var(--paper)",
        border: `1px solid ${isQuery ? "#d9cfae" : "var(--rule)"}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[14.5px] font-semibold" style={{ color: "var(--ink)" }}>{item.title}</p>
            {!isQuery && hasMessages && (
              <div className="relative flex-shrink-0">
                <MessageButton active={unread} needsAttention={unread} onClick={handleOpenChat} />
                {chatOpen && (
                  <ChatPopover
                    onClose={() => setChatOpen(false)}
                    messages={chatMessages}
                    onSend={handleSendMessage}
                    placeholder="Type your reply…"
                    theirLabel="Practitioner"
                  />
                )}
              </div>
            )}
          </div>
          {item.description && (
            <p className="mt-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
              {item.description}
            </p>
          )}
        </div>
        <span className="pill flex-shrink-0" style={{ background: chip.bg, color: chip.color }}>{chip.label}</span>
      </div>

      {item.status === "not_applicable" ? (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--rule)" }}>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            {item.na_reason ?? "Marked not applicable."}
          </p>
        </div>
      ) : (
        hasAnyFile && (
          <div className="mt-3 flex flex-col gap-1 border-t pt-3" style={{ borderColor: "var(--rule)" }}>
            {item.allows_multiple ? (
              files.map((f) => (
                <div key={f.id}>
                  {f.label && (
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>
                      {f.label}
                    </p>
                  )}
                  <FileRow
                    filename={f.filename}
                    storagePath={f.storage_path}
                    onDelete={isResolved(item.status) ? undefined : () => handleDeleteOne(f.id)}
                  />
                </div>
              ))
            ) : (
              <>
                {latestFile && (
                  <FileRow
                    filename={latestFile.filename}
                    storagePath={latestFile.storage_path}
                    onDelete={isResolved(item.status) ? undefined : handleDelete}
                  />
                )}
                {olderFiles.length > 0 && <VersionHistory files={olderFiles} />}
              </>
            )}
          </div>
        )
      )}

      {isQuery && (
        <div className="mt-3 p-3" style={{ background: "var(--paper)", border: "1px solid #e3d4a8", borderRadius: 6 }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "#8a6412" }}>
            Practitioner asked
          </p>
          {latestQuery && (
            <p className="mt-1 text-[13.5px]" style={{ color: "var(--ink)" }}>{latestQuery.body}</p>
          )}
          {chatMessages.length > 1 && (
            <div className="mt-2">
              <button
                onClick={handleOpenChat}
                className="text-[11px] font-semibold"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#8a6412", padding: 0 }}
              >
                {chatOpen ? "Hide full thread" : "Show full thread"}
              </button>
              {chatOpen && (
                <div className="mt-2 flex flex-col gap-2" style={{ maxHeight: 200, overflowY: "auto" }}>
                  {chatMessages.map((m, i) => (
                    <div key={i} className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>
                      <span className="font-semibold" style={{ color: "var(--ink)" }}>{m.mine ? "You" : "Practitioner"}:</span> {m.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <input
            className="input-field mt-2"
            style={{ minHeight: 36, padding: "8px 10px", fontSize: 13, width: "100%", background: "var(--paper)" }}
            placeholder="Type your reply…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleInlineReply(); }}
            disabled={replying}
          />
          <p className="mt-1.5 text-[11.5px]" style={{ color: "#8a6412" }}>
            We can&apos;t accept this item until the question is answered.
          </p>
        </div>
      )}

      {!isResolved(item.status) && (
        <div className="mt-3 flex flex-col gap-2">
          {item.allows_multiple ? (
            <div className="flex items-center gap-2 p-3" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
              {item.needs_label && (
                <input
                  className="input-field"
                  style={{ minHeight: 36, padding: "8px 10px", fontSize: 12, flex: 1 }}
                  placeholder="Label (e.g. HDFC Bank, or Founder A)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              )}
              <label className={item.needs_label ? "flex-shrink-0 cursor-pointer" : "flex-1 cursor-pointer"}>
                <span
                  className="btn-ghost"
                  style={{
                    minHeight: 36,
                    padding: "8px 16px",
                    fontSize: 12,
                    opacity: item.needs_label && !label.trim() ? 0.5 : 1,
                  }}
                >
                  {uploading ? "Uploading…" : hasAnyFile ? "Add another" : "Upload file"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleAddLabeledFile}
                  disabled={uploading || (item.needs_label && !label.trim())}
                />
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
              <label className="flex-1 cursor-pointer">
                <span className="btn-ghost" style={{ minHeight: 36, padding: "8px 16px", fontSize: 12 }}>
                  {uploading ? "Uploading…" : hasFile ? "Replace file" : "Upload file"}
                </span>
                <input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
              </label>
            </div>
          )}

          {item.nil_return_allowed && !hasAnyFile && (
            <button
              onClick={handleNilReturn}
              disabled={nilBusy}
              className="self-start text-[11px] font-semibold"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-secondary)", padding: "2px 0" }}
            >
              {nilBusy ? "Saving…" : confirmingNil ? "Confirm — we have none" : "We have none"}
            </button>
          )}
        </div>
      )}
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

function DeliverableDownloadRow({ deliverable }: { deliverable: Deliverable }) {
  async function handleClick() {
    if (!deliverable.output_path) return;
    const url = await getSignedDownloadUrl(deliverable.output_path);
    window.open(url, "_blank");
  }
  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-between gap-3 p-3 text-left"
      style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}
    >
      <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{deliverable.title}</span>
      <span className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-secondary)" }}>
        <Download size={14} strokeWidth={1.75} />
        {deliverable.delivered_at ? new Date(deliverable.delivered_at).toLocaleDateString() : ""}
      </span>
    </button>
  );
}
