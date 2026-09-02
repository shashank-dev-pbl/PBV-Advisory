export type DocStatus = "pending" | "uploaded" | "accepted" | "query" | "not_applicable";
export type DocPriority = "must" | "good" | "cosmetic";
export type DeliverableStatus = "blocked" | "ready" | "in_progress" | "delivered";
export type Role = "founder" | "practitioner" | "admin";

export type Company = {
  id: string;
  name: string;
  plan: string;
  financial_year_start: string;
  created_at: string;
  revenue_classification: string | null;
  gross_net_billing: string | null;
};

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  company_id: string;
};

export type DocFile = {
  id: string;
  doc_item_id: string;
  storage_path: string;
  filename: string;
  label: string | null;
  uploaded_at: string;
};

export type MessageSender = "founder" | "practitioner";

export type DocItemMessage = {
  id: string;
  doc_item_id: string;
  sender: MessageSender;
  body: string;
  created_at: string;
};

export type DocItem = {
  id: string;
  company_id: string;
  code: string;
  group_name: string;
  title: string;
  prompt: string;
  period: string;
  due_date: string | null;
  status: DocStatus;
  query_text: string | null;
  reply_text: string | null;
  na_reason: string | null;
  description: string;
  priority: DocPriority;
  allows_multiple: boolean;
  needs_label: boolean;
  nil_return_allowed: boolean;
  requested_at: string;
  uploaded_at: string | null;
  accepted_at: string | null;
  founder_last_read_at: string | null;
  practitioner_last_read_at: string | null;
  doc_file?: DocFile[];
  doc_item_message?: DocItemMessage[];
};

export type MonthlyFinancials = {
  id: string;
  company_id: string;
  period: string;
  status: "draft" | "published";
  version: number;
  published_at: string | null;
  prepared_by: string | null;

  cash_opening: number | null;
  cash_closing: number | null;
  cash_restricted: number | null;
  gross_burn: number | null;
  net_burn: number | null;
  expenses_accrual: number | null;

  revenue_total: number | null;
  revenue_subscription: number | null;
  revenue_service: number | null;
  revenue_project: number | null;
  partner_share_paid: number | null;

  clients_active: number | null;
  clients_added: number | null;
  clients_lost: number | null;
  top_client_revenue: number | null;
  top5_client_revenue: number | null;

  receivables_total: number | null;
  receivables_0_30: number | null;
  receivables_31_60: number | null;
  receivables_61_90: number | null;
  receivables_90_plus: number | null;
  payables_total: number | null;
  billed_month: number | null;
  collections_month: number | null;

  filings_current: boolean | null;
  filings_due_30d: number | null;
  filings_due_note: string | null;
  notices_open: number | null;

  created_at: string;
  updated_at: string;
};

export const FINANCIALS_FIELDS = [
  "cash_opening", "cash_closing", "cash_restricted", "gross_burn", "net_burn", "expenses_accrual",
  "revenue_total", "revenue_subscription", "revenue_service", "revenue_project", "partner_share_paid",
  "clients_active", "clients_added", "clients_lost", "top_client_revenue", "top5_client_revenue",
  "receivables_total", "receivables_0_30", "receivables_31_60", "receivables_61_90", "receivables_90_plus",
  "payables_total", "billed_month", "collections_month",
  "filings_current", "filings_due_30d", "filings_due_note", "notices_open",
] as const;

export type Deliverable = {
  id: string;
  company_id: string;
  code: string;
  title: string;
  period: string;
  due_date: string | null;
  input_codes: string[];
  status: DeliverableStatus;
  output_path: string | null;
  output_filename: string | null;
  delivered_at: string | null;
};
