"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Circle, CircleCheck, ArrowRight, LayoutDashboard } from "lucide-react";
import { currentPeriod, formatPeriodLabel } from "@/lib/period";
import type { Company, DocItem, DocItemMessage, Deliverable } from "@/lib/types";
import { acceptItem, markNotApplicable, sendPractitionerMessage, markPractitionerRead } from "./actions";
import { FileRow, VersionHistory, sortedFiles, sortedMessages, hasUnreadFor, isResolved, isReceived, ChatPopover, MessageButton, UserMenu, type ChatMessage, type CurrentUser } from "../founder/FounderView";

function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export default function PractitionerView({
  company,
  docItems,
  deliverables,
  currentUser,
}: {
  company: Company;
  docItems: DocItem[];
  deliverables: Deliverable[];
  currentUser: CurrentUser;
}) {
  const [items, setItems] = useState(docItems);
  const [dlvs, setDlvs] = useState(deliverables);

  const byCode = useMemo(() => {
    const m = new Map<string, DocItem>();
    for (const i of items) m.set(i.code, i);
    return m;
  }, [items]);

  const received = items.filter((i) => isReceived(i.status)).length;
  const total = items.length;

  const inbox = items.filter((i) => i.status === "uploaded" || i.status === "query");
  const outstanding = items.filter((i) => !isResolved(i.status));
  const oldest = outstanding.length > 0
    ? [...outstanding].sort((a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime())[0]
    : null;

  // Deliverable status is derived from doc_item acceptance, same rule as the DB trigger.
  // Recomputing it locally means "What I can work on" updates the instant an item is accepted,
  // instead of waiting for a full page reload to see the server-side trigger's result.
  const derivedDeliverables = useMemo(() => {
    const resolvedCodes = new Set(items.filter((i) => isResolved(i.status)).map((i) => i.code));
    return dlvs.map((d) => {
      if (d.status === "in_progress" || d.status === "delivered") return d;
      const allResolved = d.input_codes.every((c) => resolvedCodes.has(c));
      return { ...d, status: allResolved ? "ready" : "blocked" } as Deliverable;
    });
  }, [dlvs, items]);

  const canWorkOn = derivedDeliverables.filter((d) => d.status === "ready" || d.status === "in_progress");
  const waitingOnClient = derivedDeliverables.filter((d) => d.status === "blocked");
  const delivered = derivedDeliverables.filter((d) => d.status === "delivered");

  function patchItem(id: string, patch: Partial<DocItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function patchDeliverable(id: string, patch: Partial<Deliverable>) {
    setDlvs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--paper)" }}>
      <div className="sticky top-0 z-40">
        <header
          className="flex items-center justify-between border-b px-5 py-4 md:px-8"
          style={{ background: "var(--paper)", borderColor: "var(--rule)" }}
        >
          <div>
            <p className="eyebrow mb-1">Practitioner desk</p>
            <h1 className="text-[22px] font-extrabold">{company.name}</h1>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{formatPeriodLabel(currentPeriod())} · {received} of {total} received</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/practitioner/dashboard"
              className="btn-small"
              style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", gap: 6 }}
            >
              <LayoutDashboard size={13} strokeWidth={1.75} />
              Dashboard
            </Link>
            <div style={{ width: 1, height: 28, background: "var(--rule)" }} />
            <UserMenu user={currentUser} />
          </div>
        </header>
      </div>

      <main className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <section className="mb-10">
          <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>
            Inbox — {inbox.length} waiting for you
          </p>
          {inbox.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>Nothing waiting. Nice.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {inbox.map((item) => (
                <InboxRow key={item.id} item={item} companyId={company.id} onPatch={patchItem} />
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>
              What I can work on
            </p>
            {canWorkOn.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>Nothing ready yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {canWorkOn.map((d) => (
                  <ReadyDeliverableRow
                    key={d.id}
                    deliverable={d}
                    inputs={d.input_codes.map((code) => byCode.get(code)).filter((i): i is DocItem => !!i)}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>
              Waiting on client
            </p>
            {waitingOnClient.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>Nothing blocked.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {waitingOnClient.map((d) => {
                  const inputs = d.input_codes
                    .map((code) => byCode.get(code))
                    .filter((i): i is DocItem => !!i);
                  return (
                    <div key={d.id} className="p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--ink)" }}>
                          <Circle size={14} strokeWidth={1.75} style={{ color: "var(--status-query)" }} />
                          {d.title}
                        </p>
                        {d.due_date && (
                          <span className="text-[11px]" style={{ color: "var(--ink-secondary)" }}>
                            due {new Date(d.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-col gap-1">
                        {inputs.map((m) => {
                          const done = isResolved(m.status);
                          return (
                            <p
                              key={m.id}
                              className="flex items-center gap-1.5 text-[12px]"
                              style={{ color: done ? "var(--status-accepted)" : "var(--status-query)" }}
                            >
                              {done ? (
                                <CircleCheck size={12} strokeWidth={1.75} />
                              ) : (
                                <Circle size={12} strokeWidth={1.75} />
                              )}
                              <span style={{ textDecoration: done ? "line-through" : "none", opacity: done ? 0.75 : 1 }}>
                                {m.title}
                              </span>
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section className="mt-10 border-t pt-5" style={{ borderColor: "var(--rule)" }}>
          <p className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>
            Outstanding from client — {outstanding.length} items
          </p>
          {oldest && (
            <p className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
              <ArrowRight size={13} strokeWidth={1.75} />
              oldest: {oldest.title}, requested {daysAgo(oldest.requested_at)} days ago
            </p>
          )}
        </section>

        {delivered.length > 0 && (
          <section className="mt-8">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>
              Delivered
            </p>
            <div className="flex flex-col gap-1.5">
              {delivered.map((d) => (
                <p key={d.id} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
                  <CircleCheck size={14} strokeWidth={1.75} style={{ color: "var(--status-accepted)" }} />
                  {d.title} — {d.delivered_at && new Date(d.delivered_at).toLocaleDateString()}
                </p>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function InboxRow({
  item,
  companyId,
  onPatch,
}: {
  item: DocItem;
  companyId: string;
  onPatch: (id: string, patch: Partial<DocItem>) => void;
}) {
  const [markingNa, setMarkingNa] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAccept() {
    setBusy(true);
    await acceptItem(item.id);
    onPatch(item.id, { status: "accepted", accepted_at: new Date().toISOString() });
    setBusy(false);
  }

  async function handleSendMessage(text: string) {
    const optimistic: DocItemMessage = {
      id: `local-${Date.now()}`,
      doc_item_id: item.id,
      sender: "practitioner",
      body: text,
      created_at: new Date().toISOString(),
    };
    await sendPractitionerMessage(item.id, text);
    onPatch(item.id, {
      status: "query",
      practitioner_last_read_at: optimistic.created_at,
      doc_item_message: [...(item.doc_item_message ?? []), optimistic],
    });
  }

  function handleOpenChat() {
    const opening = !chatOpen;
    setChatOpen(opening);
    if (opening) {
      markPractitionerRead(item.id);
      onPatch(item.id, { practitioner_last_read_at: new Date().toISOString() });
    }
  }

  async function handleMarkNa() {
    if (!text) return;
    setBusy(true);
    await markNotApplicable(item.id, text);
    onPatch(item.id, { status: "not_applicable", na_reason: text });
    setBusy(false);
    setMarkingNa(false);
  }

  const messages = sortedMessages(item);
  const chatMessages: ChatMessage[] = messages.map((m) => ({ text: m.body, mine: m.sender === "practitioner", createdAt: m.created_at }));
  const unread = hasUnreadFor(item, "practitioner");

  return (
    <div className="p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-bold" style={{ color: "var(--ink)" }}>{item.title}</p>
          {(() => {
            const files = sortedFiles(item.doc_file);
            if (files.length === 0) return null;
            if (item.allows_multiple) {
              return (
                <div className="mt-1.5 flex flex-col gap-1">
                  {files.map((f) => (
                    <div key={f.id}>
                      {f.label && (
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>
                          {f.label}
                        </p>
                      )}
                      <FileRow filename={f.filename} storagePath={f.storage_path} />
                    </div>
                  ))}
                </div>
              );
            }
            const f = files[0];
            const older = files.slice(1);
            return (
              <div className="mt-1.5">
                <FileRow filename={f.filename} storagePath={f.storage_path} />
                {older.length > 0 && <VersionHistory files={older} />}
              </div>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAccept}
            disabled={busy || item.status === "query"}
            title={item.status === "query" ? "Answer the open question before accepting" : undefined}
            className="btn-small"
            style={{
              background: item.status === "query" ? "var(--rule)" : "var(--bottomline-green)",
              color: "var(--paper)",
              border: item.status === "query" ? "1px solid var(--rule)" : "1px solid var(--bottomline-green)",
              cursor: item.status === "query" ? "not-allowed" : "pointer",
            }}
          >
            Accept
          </button>
          <div className="relative flex items-center" style={{ border: "1px solid var(--rule)", padding: "4px 8px" }}>
            <MessageButton active={unread} needsAttention={unread} onClick={handleOpenChat} />
            {chatOpen && (
              <ChatPopover
                onClose={() => setChatOpen(false)}
                messages={chatMessages}
                onSend={handleSendMessage}
                placeholder="Ask a question…"
                theirLabel="Founder"
              />
            )}
          </div>
          <button onClick={() => setMarkingNa((v) => !v)} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>
            Not applicable
          </button>
        </div>
      </div>
      {markingNa && (
        <div className="mt-3 flex gap-2">
          <input
            className="input-field"
            style={{ minHeight: 36, padding: "8px 10px", fontSize: 13 }}
            placeholder="Note — why is this not applicable?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            onClick={handleMarkNa}
            disabled={busy || !text}
            className="btn-small"
            style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}
          >
            Confirm not applicable
          </button>
        </div>
      )}
    </div>
  );
}

function ReadyDeliverableRow({
  deliverable,
  inputs,
}: {
  deliverable: Deliverable;
  inputs: DocItem[];
}) {
  return (
    <div className="p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--ink)" }}>
          <CircleCheck size={14} strokeWidth={1.75} style={{ color: "var(--status-accepted)" }} />
          {deliverable.title}
        </p>
        {deliverable.due_date && (
          <span className="text-[11px]" style={{ color: "var(--ink-secondary)" }}>
            due {new Date(deliverable.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {inputs.map((i) => {
          const files = sortedFiles(i.doc_file);
          if (files.length > 0) {
            return (
              <div key={i.id}>
                <p className="mb-0.5 text-[10px] font-semibold" style={{ color: "var(--ink-secondary)" }}>{i.title}</p>
                {(i.allows_multiple ? files : files.slice(0, 1)).map((f) => (
                  <div key={f.id}>
                    {f.label && (
                      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>
                        {f.label}
                      </p>
                    )}
                    <FileRow filename={f.filename} storagePath={f.storage_path} />
                  </div>
                ))}
              </div>
            );
          }
          if (i.status === "not_applicable") {
            return (
              <p key={i.id} className="text-[11px]" style={{ color: "var(--ink-secondary)" }}>
                {i.title} — not applicable{i.na_reason ? `: ${i.na_reason}` : ""}
              </p>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
