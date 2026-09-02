"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatPeriodLabel } from "@/lib/period";
import { saveDraft, publish } from "../financials-actions";
import FinancialTiles from "@/app/dashboard/FinancialTiles";
import { UserMenu, type CurrentUser } from "@/app/founder/FounderView";
import type { Company, MonthlyFinancials } from "@/lib/types";

type Fields = Partial<Record<keyof MonthlyFinancials, string>>;

function toFields(m: MonthlyFinancials | null): Fields {
  if (!m) return {};
  const out: Fields = {};
  for (const key of Object.keys(m) as (keyof MonthlyFinancials)[]) {
    const v = m[key];
    if (v === null || v === undefined) continue;
    out[key] = String(v);
  }
  return out;
}

function num(fields: Fields, key: keyof MonthlyFinancials): number | null {
  const v = fields[key];
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

const NUMERIC_FIELDS: (keyof MonthlyFinancials)[] = [
  "cash_opening", "cash_closing", "cash_restricted", "gross_burn", "net_burn", "expenses_accrual",
  "revenue_total", "revenue_subscription", "revenue_service", "revenue_project", "partner_share_paid",
  "clients_active", "clients_added", "clients_lost", "top_client_revenue", "top5_client_revenue",
  "receivables_total", "receivables_0_30", "receivables_31_60", "receivables_61_90", "receivables_90_plus",
  "payables_total", "billed_month", "collections_month",
  "filings_due_30d", "notices_open",
];

function buildPayload(fields: Fields) {
  const payload: Record<string, number | string | boolean | null> = {};
  for (const key of NUMERIC_FIELDS) payload[key] = num(fields, key);
  payload.filings_due_note = fields.filings_due_note ?? null;
  payload.filings_current = fields.filings_current === "true" ? true : fields.filings_current === "false" ? false : null;
  return payload;
}

function validate(fields: Fields): string[] {
  const errors: string[] = [];
  const revSum = (num(fields, "revenue_subscription") ?? 0) + (num(fields, "revenue_service") ?? 0) + (num(fields, "revenue_project") ?? 0);
  const revTotal = num(fields, "revenue_total");
  if (revTotal !== null && Math.round(revSum) !== Math.round(revTotal)) {
    errors.push(`Subscription + service + project (${revSum}) must equal revenue total (${revTotal}).`);
  }

  const ageingSum = (num(fields, "receivables_0_30") ?? 0) + (num(fields, "receivables_31_60") ?? 0) + (num(fields, "receivables_61_90") ?? 0) + (num(fields, "receivables_90_plus") ?? 0);
  const recTotal = num(fields, "receivables_total");
  if (recTotal !== null && Math.round(ageingSum) !== Math.round(recTotal)) {
    errors.push(`The four ageing buckets (${ageingSum}) must equal receivables total (${recTotal}).`);
  }

  const opening = num(fields, "cash_opening");
  const closing = num(fields, "cash_closing");
  const netBurn = num(fields, "net_burn");
  if (opening !== null && closing !== null && netBurn !== null) {
    const expected = opening - netBurn;
    if (Math.round(expected) !== Math.round(closing)) {
      errors.push(`Closing cash (${closing}) must equal opening cash minus net burn (${expected}).`);
    }
  }

  return errors;
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold" style={{ color: "var(--ink-secondary)" }}>{label}</span>
      {children}
      {note && <span className="text-[10px]" style={{ color: "var(--ink-secondary)" }}>{note}</span>}
    </label>
  );
}

function NumInput({ fields, setFields, name }: { fields: Fields; setFields: (f: Fields) => void; name: keyof MonthlyFinancials }) {
  return (
    <input
      type="number"
      className="input-field"
      style={{ minHeight: 36, padding: "6px 10px", fontSize: 13 }}
      value={fields[name] ?? ""}
      onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
    />
  );
}

export default function PractitionerDashboardView({
  company,
  period,
  existing,
  history,
  currentUser,
}: {
  company: Company;
  period: string;
  existing: MonthlyFinancials | null;
  history: MonthlyFinancials[];
  currentUser: CurrentUser;
}) {
  const [fields, setFields] = useState<Fields>(toFields(existing));
  const [status, setStatus] = useState<"idle" | "saving" | "publishing">("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(!existing || existing.status === "draft");

  const publishedHistory = history.filter((m) => m.status === "published");

  async function handleSaveDraft() {
    setStatus("saving");
    setErrors([]);
    await saveDraft(company.id, period, buildPayload(fields));
    setStatus("idle");
    setMessage("Draft saved.");
  }

  async function handlePublish() {
    const validationErrors = validate(fields);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setStatus("publishing");
    setErrors([]);
    try {
      await publish(company.id, period, buildPayload(fields));
      setMessage(`${formatPeriodLabel(period)} published.`);
      setFormOpen(false);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Failed to publish"]);
    }
    setStatus("idle");
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--paper)" }}>
      <header className="flex items-center justify-between border-b px-5 py-4 md:px-8" style={{ borderColor: "var(--rule)" }}>
        <div>
          <p className="eyebrow mb-1">Dashboard</p>
          <h1 className="text-[22px] font-extrabold">{company.name}</h1>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{formatPeriodLabel(period)}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/practitioner"
            className="btn-small"
            style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", gap: 6 }}
          >
            <ArrowLeft size={13} strokeWidth={1.75} />
            Back to practitioner desk
          </Link>
          <div style={{ width: 1, height: 28, background: "var(--rule)" }} />
          <UserMenu user={currentUser} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <section className="mb-8">
          <button
            onClick={() => setFormOpen((v) => !v)}
            className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink)" }}
          >
            {formatPeriodLabel(period)} entry {formOpen ? "▾" : "▸"}
          </button>

          {formOpen && (
            <div className="flex flex-col gap-6 p-5" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--ink-secondary)" }}>Cash</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <Field label="Cash opening"><NumInput fields={fields} setFields={setFields} name="cash_opening" /></Field>
                  <Field label="Cash closing"><NumInput fields={fields} setFields={setFields} name="cash_closing" /></Field>
                  <Field label="Cash restricted"><NumInput fields={fields} setFields={setFields} name="cash_restricted" /></Field>
                  <Field label="Gross burn"><NumInput fields={fields} setFields={setFields} name="gross_burn" /></Field>
                  <Field label="Net burn"><NumInput fields={fields} setFields={setFields} name="net_burn" /></Field>
                  <Field label="Expenses (accrual)"><NumInput fields={fields} setFields={setFields} name="expenses_accrual" /></Field>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--ink-secondary)" }}>Revenue</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <Field label="Revenue total"><NumInput fields={fields} setFields={setFields} name="revenue_total" /></Field>
                  <Field label="Subscription"><NumInput fields={fields} setFields={setFields} name="revenue_subscription" /></Field>
                  <Field label="Service"><NumInput fields={fields} setFields={setFields} name="revenue_service" /></Field>
                  <Field label="Project"><NumInput fields={fields} setFields={setFields} name="revenue_project" /></Field>
                  <Field label="Partner share paid"><NumInput fields={fields} setFields={setFields} name="partner_share_paid" /></Field>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--ink-secondary)" }}>Customers</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <Field label="Clients active"><NumInput fields={fields} setFields={setFields} name="clients_active" /></Field>
                  <Field label="Clients added"><NumInput fields={fields} setFields={setFields} name="clients_added" /></Field>
                  <Field label="Clients lost"><NumInput fields={fields} setFields={setFields} name="clients_lost" /></Field>
                  <Field label="Top client revenue"><NumInput fields={fields} setFields={setFields} name="top_client_revenue" /></Field>
                  <Field label="Top 5 client revenue"><NumInput fields={fields} setFields={setFields} name="top5_client_revenue" /></Field>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--ink-secondary)" }}>Working capital</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <Field label="Receivables total"><NumInput fields={fields} setFields={setFields} name="receivables_total" /></Field>
                  <Field label="0-30 days"><NumInput fields={fields} setFields={setFields} name="receivables_0_30" /></Field>
                  <Field label="31-60 days"><NumInput fields={fields} setFields={setFields} name="receivables_31_60" /></Field>
                  <Field label="61-90 days"><NumInput fields={fields} setFields={setFields} name="receivables_61_90" /></Field>
                  <Field label="90+ days"><NumInput fields={fields} setFields={setFields} name="receivables_90_plus" /></Field>
                  <Field label="Payables total"><NumInput fields={fields} setFields={setFields} name="payables_total" /></Field>
                  <Field label="Billed this month"><NumInput fields={fields} setFields={setFields} name="billed_month" /></Field>
                  <Field label="Collected this month"><NumInput fields={fields} setFields={setFields} name="collections_month" /></Field>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--ink-secondary)" }}>Compliance</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <Field label="Filings current">
                    <select
                      className="input-field"
                      style={{ minHeight: 36, padding: "6px 10px", fontSize: 13 }}
                      value={fields.filings_current ?? ""}
                      onChange={(e) => setFields({ ...fields, filings_current: e.target.value })}
                    >
                      <option value="">—</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </Field>
                  <Field label="Due in 30 days"><NumInput fields={fields} setFields={setFields} name="filings_due_30d" /></Field>
                  <Field label="Open notices"><NumInput fields={fields} setFields={setFields} name="notices_open" /></Field>
                  <Field label="Which filings — one line">
                    <input
                      className="input-field"
                      style={{ minHeight: 36, padding: "6px 10px", fontSize: 13 }}
                      value={fields.filings_due_note ?? ""}
                      onChange={(e) => setFields({ ...fields, filings_due_note: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              {errors.length > 0 && (
                <div className="p-3" style={{ background: "rgba(140,26,26,0.06)", border: "1px solid rgba(140,26,26,0.2)" }}>
                  {errors.map((e, i) => (
                    <p key={i} className="text-[12px]" style={{ color: "#8c1a1a" }}>{e}</p>
                  ))}
                </div>
              )}
              {message && <p className="text-[12px]" style={{ color: "var(--bottomline-green)" }}>{message}</p>}

              <div className="flex gap-3">
                <button onClick={handleSaveDraft} disabled={status !== "idle"} className="btn-ghost">
                  {status === "saving" ? "Saving…" : "Save draft"}
                </button>
                <button onClick={handlePublish} disabled={status !== "idle"} className="btn-primary">
                  {status === "publishing" ? "Publishing…" : existing?.status === "published" ? "Republish" : "Publish"}
                </button>
              </div>
            </div>
          )}
        </section>

        <FinancialTiles history={publishedHistory} isPractitioner />
      </main>
    </div>
  );
}
