import { fyForPeriod } from "@/lib/period";

// The compliance engine, as plain functions: confirmed facts + editable rules -> the obligation rows to create.
// No database, no clock except the `today` passed in, so it can be tested on its own.

export type RuleFrequency = "monthly" | "quarterly" | "yearly";
export type RegistrationKind = "gst" | "tan" | "entity" | "custom";
export type Owner = "founder" | "practitioner" | "pba";
export type FilingType = "regular" | "qrmp" | "composition";
export type ItrBasis = "auto" | "non_audit" | "audit" | "tp";

export type Rule = {
  code: string;
  service: string;
  name: string;
  category: string;
  registration_kind: RegistrationKind;
  frequency: RuleFrequency;
  due_rule: { day?: number; months_after?: number; by_quarter?: Record<string, string>; mmdd?: string; years_after_fy_start?: number };
  applies_when: { filing_type?: string; form?: string; itr_basis?: string };
  owner_default: Owner;
  sort: number;
};

export type Registration = {
  id: string;
  kind: RegistrationKind;
  identifier: string;
  state: string | null;
  filing_type: FilingType | null;
  forms: string[];
  status: "active" | "closed";
};

export type Setting = {
  entity_type: string | null;
  effective_from: string | null; // YYYY-MM-DD: periods ending before this are not generated
  start_fy: number;              // first financial year tracked, by the year it starts in (2024 = FY 2024-25)
  itr_basis: ItrBasis;
};

export type GeneratedObligation = {
  rule_code: string;
  registration_id: string;
  name: string;
  category: string;
  fy: string;
  period: string;                // YYYY-MM: the month, the quarter's last month, or the financial year's last month
  statutory_due_date: string;    // YYYY-MM-DD
  owner: Owner;
};

export const ENTITY_TYPES = ["Private Limited", "Public Limited", "Small Company", "OPC", "LLP", "Section 8", "Other"] as const;
const COMPANY_TYPES = new Set(["Private Limited", "Public Limited", "Small Company", "OPC", "Section 8"]);

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal",
] as const;

export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const TAN_PATTERN = /^[A-Z]{4}\d{5}[A-Z]$/;
export const TDS_FORMS = ["24Q", "26Q", "27Q", "27EQ"] as const;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;          // m is 1-12
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m is 1-12

// "auto" resolves from the entity type: companies are treated as audited, an LLP or anything else as non-audit.
export function resolveItrBasis(setting: Pick<Setting, "itr_basis" | "entity_type">): Exclude<ItrBasis, "auto"> {
  if (setting.itr_basis !== "auto") return setting.itr_basis;
  return setting.entity_type && COMPANY_TYPES.has(setting.entity_type) ? "audit" : "non_audit";
}

function applies(rule: Rule, reg: Registration, basis: string): boolean {
  if (rule.registration_kind !== reg.kind || reg.status !== "active") return false;
  if (rule.registration_kind === "custom") return rule.code === `custom_${reg.id}`;
  const w = rule.applies_when ?? {};
  if (w.filing_type && w.filing_type !== reg.filing_type) return false;
  if (w.form && !reg.forms.includes(w.form)) return false;
  if (w.itr_basis && w.itr_basis !== basis) return false;
  return true;
}

// The financial year (April-March, the statutory year for GST, TDS and ITR) a date falls in, by the year it starts in.
export function fyStartYear(d: Date): number {
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

function periodLabel(rule: Rule, fy: number, period: string, quarter?: number): string {
  if (rule.frequency === "monthly") return `${MON[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
  if (rule.frequency === "quarterly") return `Q${quarter} FY${String(fy + 1).slice(-2)}`;
  return `FY ${fy}-${String(fy + 1).slice(-2)}`;
}

// `owners` is the Team page: the default owner per service, which overrides a rule's own default.
export function generateObligations(rules: Rule[], regs: Registration[], setting: Setting, today: Date = new Date(), owners: Partial<Record<string, Owner>> = {}): GeneratedObligation[] {
  const basis = resolveItrBasis(setting);
  const lastFy = fyStartYear(today);
  const from = setting.effective_from; // periods ending before this are skipped
  const out: GeneratedObligation[] = [];

  for (const reg of regs) {
    for (const rule of rules) {
      if (!applies(rule, reg, basis)) continue;
      const tag = reg.kind === "gst" ? `${reg.identifier}${reg.state ? ` (${reg.state})` : ""}` : reg.kind === "tan" ? reg.identifier : "";
      const push = (fy: number, period: string, periodEnd: string, due: string, quarter?: number) => {
        if (from && periodEnd < from) return;
        out.push({
          rule_code: rule.code,
          registration_id: reg.id,
          name: [rule.name, tag, periodLabel(rule, fy, period, quarter)].filter(Boolean).join(" · "),
          category: rule.category,
          fy: fyForPeriod(period, "2026-04-01"),
          period,
          statutory_due_date: due,
          owner: owners[rule.service] ?? rule.owner_default,
        });
      };

      for (let fy = setting.start_fy; fy <= lastFy; fy++) {
        if (rule.frequency === "monthly") {
          const { day = 1, months_after = 1 } = rule.due_rule;
          for (let i = 0; i < 12; i++) {
            const m0 = 3 + i; // April = month index 3
            const y = fy + Math.floor(m0 / 12);
            const m = (m0 % 12) + 1;
            const dm0 = m - 1 + months_after;
            const dy = y + Math.floor(dm0 / 12);
            const dm = (dm0 % 12) + 1;
            push(fy, `${y}-${pad(m)}`, ymd(y, m, lastDay(y, m)), ymd(dy, dm, Math.min(day, lastDay(dy, dm))));
          }
        } else if (rule.frequency === "quarterly") {
          for (let q = 1; q <= 4; q++) {
            const endM0 = 3 + q * 3 - 1; // last month of the quarter, 0-indexed from the FY's April
            const y = fy + Math.floor(endM0 / 12);
            const m = (endM0 % 12) + 1;
            const end = ymd(y, m, lastDay(y, m));
            const mmdd = rule.due_rule.by_quarter?.[String(q)];
            if (!mmdd) continue;
            let due = `${y}-${mmdd}`;
            if (due <= end) due = `${y + 1}-${mmdd}`; // the due date falls in the next calendar year
            push(fy, `${y}-${pad(m)}`, end, due, q);
          }
        } else {
          const { mmdd = "12-31", years_after_fy_start = 1 } = rule.due_rule;
          push(fy, `${fy + 1}-03`, ymd(fy + 1, 3, 31), `${fy + years_after_fy_start}-${mmdd}`);
        }
      }
    }
  }
  return out;
}

export function isOverdue(o: { status: string; statutory_due_date: string; due_override: string | null; closed_reason: string | null }, today: string): boolean {
  return !o.closed_reason && o.status === "pending" && (o.due_override ?? o.statutory_due_date) < today;
}
