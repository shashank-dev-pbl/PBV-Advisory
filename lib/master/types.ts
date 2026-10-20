// The company master's answers, and the plan the rules engine builds from them. Plain data, no database.

export type Entity = "private" | "opc" | "public" | "llp" | "section8" | "partnership";
export type Scheme = "regular" | "qrmp" | "composition";
export type Owner = "founder" | "external" | "pba";

export type Answers = {
  na?: Record<string, string>;            // documents marked Not applicable: request key -> reason
  has?: { loans?: boolean; debentures?: boolean; rounds?: boolean; investments?: boolean };   // "does the company have any?" answered, including No
  entity?: Entity;
  incorporatedOn?: string;                 // YYYY-MM-DD
  trackingStart?: string;                  // YYYY-MM
  details?: { legalName?: string; cin?: string; pan?: string; tan?: string; state?: string };
  books?: { software?: string; closer?: "firm" | "own" | "pba"; firmOnPortal?: boolean; firmName?: string };
  banks?: { id: string; bank: string; type: string; last4: string }[];
  gst?: { registered?: boolean; gstins?: { id: string; gstin: string; state: string; scheme: Scheme }[] };
  salaries?: { pays?: boolean; employees?: number; contractors?: number; payrollTool?: string; pf?: boolean; esi?: boolean; ptStates?: string[]; foundersPaid?: boolean };
  tds?: { types?: ("salaries" | "vendors" | "rent" | "nonresident")[] };
  revenue?: { types?: string[]; partners?: boolean; sharing?: "full" | "own"; gateways?: string[]; advances?: boolean; exports?: boolean };
  loans?: { id: string; lender: string; type: string; sanctioned?: number; takenOn?: string; secured?: boolean }[];
  debentures?: { id: string; issuedOn?: string; type: "secured_ncd" | "unsecured_ncd" | "ccd" | "ocd"; amount?: number; status: "outstanding" | "redeemed"; redeemedOn?: string }[];
  rounds?: { id: string; round: string; instrument: "equity" | "ccps" | "ccd" | "ocps_ocd" | "note" | "grant" | "venture_debt"; closedOn?: string; amount?: number; foreign?: boolean }[];
  investments?: { id: string; what: "fd" | "mf" | "shares" | "odi" | "loan_given" | "other"; heldWith?: string; amount?: number }[];
};

export type MasterRule = {
  rule_id: string; step: string; request: string; tier: string; notes: string;
  cond: string; repeat_by: string | null; schedule: string; section: string; owner_key: string; doc_type: string | null; sort: number;
};

export type DueRule = {
  kind: "day_next_month" | "day_after_quarter" | "quarter_fixed" | "half_year";
  day?: number; alt_day?: number; early_states?: string[]; overrides?: Record<string, string>;
  by_quarter?: Record<string, string>; h1?: string; h2?: string;
};
export type MasterFiling = {
  filing_id: string; filing: string; cond: string; repeat_by: string | null; schedule: string; due_rule: DueRule; ticks: ("paid" | "filed")[]; doc_type: string | null; sort: number;
};

export type EventTypeDoc = { event_type: string; doc_code: string; need: "expected" | "if_applies"; condition_note: string | null };
export type LibDoc = { code: string; name: string; form: string | null };

export type Tier = "mandatory" | "good to have" | "others";
export type StdDoc = { key: string; rule_id: string; name: string; owner: Owner; tier: Tier; doc_type: string | null };
export type EventDocReq = { code: string | null; name: string; expected: boolean; sharedWith?: string };
export type TimelineEvent = { key: string; rule_id: string; kind: string; title: string; date: string | null; docs: EventDocReq[] };
export type Recurring = {
  key: string; rule_id: string; name: string; tier: Tier; owner: Owner; section: "from_company" | "books";
  schedule: "monthly" | "quarter_end" | "march"; doc_type: string | null;
};
export type FilingDef = {
  key: string; filing_id: string; name: string; ticks: ("paid" | "filed")[]; schedule: string; due_rule: DueRule; owner: Owner; doc_type: string | null; state?: string;
};
export type Plan = { standard: StdDoc[]; events: TimelineEvent[]; recurring: Recurring[]; filings: FilingDef[] };

export type Request = Recurring & { period: string; due: string };
export type FilingRow = FilingDef & { period: string; due: string };
