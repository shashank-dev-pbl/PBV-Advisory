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
