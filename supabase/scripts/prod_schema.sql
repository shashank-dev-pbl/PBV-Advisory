-- ============================================================
-- PBL Advisory — production schema (schema-only, no data)
-- Generated via read-only introspection of the supabase-pba project.
-- ============================================================

-- ====================================================
-- EXTENSIONS
-- ====================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;
-- plpgsql is enabled by default in every Postgres database.

-- ====================================================
-- TABLES
-- ====================================================

CREATE TABLE public.access_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  at timestamp with time zone NOT NULL DEFAULT now(),
  who_name text NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_name text,
  company_id uuid,
  company_name text,
  detail text,
  CONSTRAINT access_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_user (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text,
  name text,
  role text NOT NULL,
  company_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_login_at timestamp with time zone,
  phone text,
  auth_user_id uuid,
  "position" text,
  can_verify boolean NOT NULL DEFAULT false,
  can_publish boolean NOT NULL DEFAULT false,
  firm_name text,
  account_type text,
  hidden boolean NOT NULL DEFAULT false,
  CONSTRAINT app_user_account_type_check CHECK (account_type = ANY (ARRAY['admin'::text, 'pba'::text, 'external'::text, 'founder'::text])),
  CONSTRAINT app_user_role_check CHECK (role = ANY (ARRAY['founder'::text, 'practitioner'::text, 'pba'::text])),
  CONSTRAINT app_user_pkey PRIMARY KEY (id),
  CONSTRAINT app_user_email_key UNIQUE (email),
  CONSTRAINT app_user_phone_key UNIQUE (phone),
  CONSTRAINT app_user_auth_user_id_key UNIQUE (auth_user_id)
);

CREATE TABLE public.company (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan text DEFAULT 'starter'::text,
  financial_year_start date NOT NULL DEFAULT '2026-04-01'::date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  revenue_classification text,
  gross_net_billing text,
  books_by text NOT NULL DEFAULT 'auditor'::text,
  status text NOT NULL DEFAULT 'live'::text,
  first_collect_period text,
  tracking_start text,
  CONSTRAINT company_status_check CHECK (status = ANY (ARRAY['setting_up'::text, 'live'::text])),
  CONSTRAINT company_books_by_check CHECK (books_by = ANY (ARRAY['auditor'::text, 'pba'::text])),
  CONSTRAINT company_pkey PRIMARY KEY (id)
);

CREATE TABLE public.company_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  role text NOT NULL,
  granted_by_name text,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  revoked_by_name text,
  CONSTRAINT company_access_role_check CHECK (role = ANY (ARRAY['founder'::text, 'external'::text, 'pba'::text])),
  CONSTRAINT company_access_pkey PRIMARY KEY (id)
);

CREATE TABLE public.company_master (
  company_id uuid NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps_done integer[] NOT NULL DEFAULT '{}'::integer[],
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by_name text,
  CONSTRAINT company_master_pkey PRIMARY KEY (company_id)
);

CREATE TABLE public.compliance_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  at timestamp with time zone NOT NULL DEFAULT now(),
  who_name text,
  note text NOT NULL,
  result text,
  CONSTRAINT compliance_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.compliance_rule (
  code text NOT NULL,
  service text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  registration_kind text NOT NULL,
  frequency text NOT NULL,
  due_rule jsonb NOT NULL,
  applies_when jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_default text NOT NULL DEFAULT 'practitioner'::text,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT compliance_rule_frequency_check CHECK (frequency = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text])),
  CONSTRAINT compliance_rule_owner_default_check CHECK (owner_default = ANY (ARRAY['founder'::text, 'practitioner'::text, 'pba'::text])),
  CONSTRAINT compliance_rule_registration_kind_check CHECK (registration_kind = ANY (ARRAY['gst'::text, 'tan'::text, 'entity'::text])),
  CONSTRAINT compliance_rule_pkey PRIMARY KEY (code)
);

CREATE TABLE public.compliance_setting (
  company_id uuid NOT NULL,
  entity_type text,
  effective_from date,
  start_fy integer NOT NULL DEFAULT 2024,
  itr_basis text NOT NULL DEFAULT 'auto'::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT compliance_setting_itr_basis_check CHECK (itr_basis = ANY (ARRAY['auto'::text, 'non_audit'::text, 'audit'::text, 'tp'::text])),
  CONSTRAINT compliance_setting_pkey PRIMARY KEY (company_id)
);

CREATE TABLE public.compliance_team (
  company_id uuid NOT NULL,
  service text NOT NULL,
  owner text NOT NULL,
  CONSTRAINT compliance_team_service_check CHECK (service = ANY (ARRAY['GST'::text, 'TDS'::text, 'ITR'::text, 'Custom'::text])),
  CONSTRAINT compliance_team_owner_check CHECK (owner = ANY (ARRAY['founder'::text, 'practitioner'::text, 'pba'::text])),
  CONSTRAINT compliance_team_pkey PRIMARY KEY (company_id, service)
);

CREATE TABLE public.custom_compliance_type (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  name text NOT NULL,
  frequency text NOT NULL,
  due_rule jsonb NOT NULL,
  owner text NOT NULL DEFAULT 'practitioner'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT custom_compliance_type_owner_check CHECK (owner = ANY (ARRAY['founder'::text, 'practitioner'::text, 'pba'::text])),
  CONSTRAINT custom_compliance_type_frequency_check CHECK (frequency = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text])),
  CONSTRAINT custom_compliance_type_pkey PRIMARY KEY (id)
);

CREATE TABLE public.deliverable (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  period text NOT NULL,
  due_date date,
  input_codes text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'blocked'::text,
  output_path text,
  output_filename text,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deliverable_status_check CHECK (status = ANY (ARRAY['blocked'::text, 'ready'::text, 'in_progress'::text, 'delivered'::text])),
  CONSTRAINT deliverable_pkey PRIMARY KEY (id),
  CONSTRAINT deliverable_company_id_code_period_key UNIQUE (company_id, code, period)
);

CREATE TABLE public.deliverable_template (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL,
  period_type text NOT NULL,
  input_codes text[] NOT NULL,
  sort_order integer NOT NULL,
  CONSTRAINT deliverable_template_period_type_check CHECK (period_type = ANY (ARRAY['once'::text, 'monthly'::text])),
  CONSTRAINT deliverable_template_pkey PRIMARY KEY (id),
  CONSTRAINT deliverable_template_code_key UNIQUE (code)
);

CREATE TABLE public.doc_explainer (
  doc_type text NOT NULL,
  name text NOT NULL,
  what_it_is text,
  why_it_matters text,
  summary_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  where_from text,
  what_pba_checks text,
  if_late text,
  CONSTRAINT doc_explainer_pkey PRIMARY KEY (doc_type)
);

CREATE TABLE public.doc_file (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doc_item_id uuid NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  label text,
  CONSTRAINT doc_file_pkey PRIMARY KEY (id)
);

CREATE TABLE public.doc_item (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  code text NOT NULL,
  group_name text NOT NULL,
  title text NOT NULL,
  prompt text NOT NULL,
  period text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'pending'::text,
  query_text text,
  reply_text text,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  uploaded_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  founder_last_read_at timestamp with time zone,
  practitioner_last_read_at timestamp with time zone,
  na_reason text,
  description text NOT NULL DEFAULT ''::text,
  priority text NOT NULL DEFAULT 'must'::text,
  allows_multiple boolean NOT NULL DEFAULT false,
  needs_label boolean NOT NULL DEFAULT false,
  nil_return_allowed boolean NOT NULL DEFAULT false,
  register_ref text,
  accepted_by uuid,
  na_by uuid,
  na_at timestamp with time zone,
  cadence text,
  due_rule text,
  supplied_by_external boolean NOT NULL DEFAULT false,
  CONSTRAINT doc_item_priority_check CHECK (priority = ANY (ARRAY['must'::text, 'good'::text, 'cosmetic'::text])),
  CONSTRAINT doc_item_cadence_check CHECK (cadence = ANY (ARRAY['once'::text, 'monthly'::text, 'qy'::text])),
  CONSTRAINT doc_item_status_check CHECK (status = ANY (ARRAY['pending'::text, 'uploaded'::text, 'accepted'::text, 'query'::text, 'not_applicable'::text])),
  CONSTRAINT doc_item_pkey PRIMARY KEY (id),
  CONSTRAINT doc_item_company_id_code_period_key UNIQUE (company_id, code, period)
);

CREATE TABLE public.doc_item_message (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doc_item_id uuid NOT NULL,
  sender text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT doc_item_message_sender_check CHECK (sender = ANY (ARRAY['founder'::text, 'practitioner'::text])),
  CONSTRAINT doc_item_message_pkey PRIMARY KEY (id)
);

CREATE TABLE public.doc_item_template (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  group_name text NOT NULL,
  title text NOT NULL,
  prompt text NOT NULL,
  period_type text NOT NULL,
  sort_order integer NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  priority text NOT NULL DEFAULT 'must'::text,
  allows_multiple boolean NOT NULL DEFAULT false,
  needs_label boolean NOT NULL DEFAULT false,
  nil_return_allowed boolean NOT NULL DEFAULT false,
  register_ref text,
  cadence text,
  due_rule text,
  supplied_by_external boolean NOT NULL DEFAULT false,
  CONSTRAINT doc_item_template_priority_check CHECK (priority = ANY (ARRAY['must'::text, 'good'::text, 'cosmetic'::text])),
  CONSTRAINT doc_item_template_period_type_check CHECK (period_type = ANY (ARRAY['once'::text, 'monthly'::text])),
  CONSTRAINT doc_item_template_cadence_check CHECK (cadence = ANY (ARRAY['once'::text, 'monthly'::text, 'qy'::text])),
  CONSTRAINT doc_item_template_pkey PRIMARY KEY (id),
  CONSTRAINT doc_item_template_code_key UNIQUE (code)
);

CREATE TABLE public.doc_library (
  code text NOT NULL,
  name text NOT NULL,
  form text,
  sort integer NOT NULL DEFAULT 0,
  CONSTRAINT doc_library_pkey PRIMARY KEY (code)
);

CREATE TABLE public.event (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  type text NOT NULL,
  event_date date NOT NULL,
  title text NOT NULL,
  description text,
  amount text,
  created_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_pkey PRIMARY KEY (id)
);

CREATE TABLE public.event_document (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  company_id uuid NOT NULL,
  doc_code text,
  other_name text,
  status text NOT NULL,
  na_reason text,
  storage_path text,
  filename text,
  by_name text,
  at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_document_check1 CHECK (status = 'uploaded'::text AND storage_path IS NOT NULL OR status = 'not_applicable'::text),
  CONSTRAINT event_document_status_check CHECK (status = ANY (ARRAY['uploaded'::text, 'not_applicable'::text])),
  CONSTRAINT event_document_check CHECK (doc_code IS NOT NULL OR other_name IS NOT NULL),
  CONSTRAINT event_document_pkey PRIMARY KEY (id)
);

CREATE TABLE public.event_type (
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  CONSTRAINT event_type_pkey PRIMARY KEY (code)
);

CREATE TABLE public.event_type_doc (
  event_type text NOT NULL,
  doc_code text NOT NULL,
  need text NOT NULL,
  condition_note text,
  sort integer NOT NULL DEFAULT 0,
  CONSTRAINT event_type_doc_need_check CHECK (need = ANY (ARRAY['expected'::text, 'if_applies'::text])),
  CONSTRAINT event_type_doc_pkey PRIMARY KEY (event_type, doc_code)
);

CREATE TABLE public.file_version (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  req_key text NOT NULL,
  period text,
  version integer NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  by_name text,
  by_role text,
  at timestamp with time zone NOT NULL DEFAULT now(),
  reason text,
  removed boolean NOT NULL DEFAULT false,
  CONSTRAINT file_version_pkey PRIMARY KEY (id),
  CONSTRAINT file_version_company_id_req_key_period_version_key UNIQUE (company_id, req_key, period, version)
);

CREATE TABLE public.master_document (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  kind text NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  uploaded_by_name text,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  registration_id uuid,
  CONSTRAINT master_document_kind_check CHECK (kind = ANY (ARRAY['gst'::text, 'tan'::text, 'coi'::text])),
  CONSTRAINT master_document_pkey PRIMARY KEY (id)
);

CREATE TABLE public.master_filing (
  filing_id text NOT NULL,
  filing text NOT NULL,
  switched_on_by text,
  frequency text,
  belongs_to text,
  due_text text,
  ticks_needed text,
  proof_for_each_tick text,
  notes text,
  cond text NOT NULL,
  repeat_by text,
  schedule text NOT NULL,
  due_rule jsonb NOT NULL,
  ticks text[] NOT NULL,
  doc_type text,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT master_filing_pkey PRIMARY KEY (filing_id)
);

CREATE TABLE public.master_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  at timestamp with time zone NOT NULL DEFAULT now(),
  who_name text,
  step integer,
  kind text NOT NULL,
  note text NOT NULL,
  reason text,
  CONSTRAINT master_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.master_rule (
  rule_id text NOT NULL,
  step text NOT NULL,
  when_text text,
  request text NOT NULL,
  frequency text,
  tier text,
  default_owner text,
  lands_in text,
  repeats_per text,
  notes text,
  cond text NOT NULL,
  repeat_by text,
  schedule text NOT NULL,
  section text NOT NULL,
  owner_key text NOT NULL,
  doc_type text,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT master_rule_pkey PRIMARY KEY (rule_id)
);

CREATE TABLE public.mis_upload (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period text NOT NULL,
  file_path text NOT NULL,
  filename text NOT NULL,
  file_hash text NOT NULL,
  template_version text NOT NULL,
  checks_all_pass boolean NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT mis_upload_pkey PRIMARY KEY (id)
);

CREATE TABLE public.monthly_financials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  version integer NOT NULL DEFAULT 1,
  published_at timestamp with time zone,
  prepared_by text,
  cash_opening numeric,
  cash_closing numeric,
  cash_restricted numeric,
  gross_burn numeric,
  net_burn numeric,
  expenses_accrual numeric,
  revenue_total numeric,
  revenue_subscription numeric,
  revenue_service numeric,
  revenue_project numeric,
  partner_share_paid numeric,
  clients_active integer,
  clients_added integer,
  clients_lost integer,
  top_client_revenue numeric,
  top5_client_revenue numeric,
  receivables_total numeric,
  receivables_0_30 numeric,
  receivables_31_60 numeric,
  receivables_61_90 numeric,
  receivables_90_plus numeric,
  payables_total numeric,
  billed_month numeric,
  collections_month numeric,
  filings_current boolean,
  filings_due_30d integer,
  filings_due_note text,
  notices_open integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT monthly_financials_status_check CHECK (status = ANY (ARRAY['draft'::text, 'published'::text])),
  CONSTRAINT monthly_financials_pkey PRIMARY KEY (id),
  CONSTRAINT monthly_financials_company_id_period_key UNIQUE (company_id, period)
);

CREATE TABLE public.monthly_financials_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monthly_financials_id uuid NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT monthly_financials_history_pkey PRIMARY KEY (id)
);

CREATE TABLE public.monthly_line (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period text NOT NULL,
  body text NOT NULL,
  posted_by_name text,
  posted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT monthly_line_body_check CHECK (length(btrim(body)) > 0),
  CONSTRAINT monthly_line_pkey PRIMARY KEY (id),
  CONSTRAINT monthly_line_company_id_period_key UNIQUE (company_id, period)
);

CREATE TABLE public.obligation (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  fy text NOT NULL,
  period text NOT NULL,
  statutory_due_date date NOT NULL,
  owner text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  filed_on date,
  evidence_storage_path text,
  evidence_filename text,
  filed_by uuid,
  verified_by uuid,
  verified_at timestamp with time zone,
  due_override date,
  override_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  rule_code text,
  registration_id uuid,
  closed_reason text,
  CONSTRAINT obligation_status_check CHECK (status = ANY (ARRAY['pending'::text, 'filed'::text, 'verified'::text])),
  CONSTRAINT obligation_owner_check CHECK (owner = ANY (ARRAY['founder'::text, 'practitioner'::text, 'pba'::text])),
  CONSTRAINT obligation_pkey PRIMARY KEY (id)
);

CREATE TABLE public.period_figures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'draft'::text,
  source_upload_id uuid NOT NULL,
  cash_opening numeric,
  cash_closing numeric,
  cash_restricted numeric,
  gross_burn numeric,
  net_burn numeric,
  expenses_accrual numeric,
  revenue_total numeric,
  revenue_subscription numeric,
  revenue_service numeric,
  revenue_project numeric,
  partner_share_paid numeric,
  clients_active numeric,
  clients_added numeric,
  clients_lost numeric,
  top_client_revenue numeric,
  top5_client_revenue numeric,
  receivables_total numeric,
  receivables_0_30 numeric,
  receivables_31_60 numeric,
  receivables_61_90 numeric,
  receivables_90_plus numeric,
  payables_total numeric,
  billed_month numeric,
  collections_month numeric,
  submitted_by uuid,
  submitted_at timestamp with time zone,
  verified_by uuid,
  verified_at timestamp with time zone,
  published_by uuid,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  query_text text,
  pdf_storage_path text,
  pdf_filename text,
  CONSTRAINT period_figures_state_check CHECK (state = ANY (ARRAY['draft'::text, 'submitted'::text, 'verified'::text, 'published'::text, 'superseded'::text])),
  CONSTRAINT published_not_submitter CHECK (published_by IS NULL OR submitted_by IS NULL OR published_by <> submitted_by),
  CONSTRAINT verified_not_submitter CHECK (verified_by IS NULL OR submitted_by IS NULL OR verified_by <> submitted_by),
  CONSTRAINT period_figures_pkey PRIMARY KEY (id),
  CONSTRAINT period_figures_company_id_period_version_key UNIQUE (company_id, period, version)
);

CREATE TABLE public.platform_admin (
  phone text NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT platform_admin_pkey PRIMARY KEY (phone)
);

CREATE TABLE public.registration (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  kind text NOT NULL,
  identifier text NOT NULL,
  state text,
  filing_type text,
  forms text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'active'::text,
  confirmed_by_name text,
  confirmed_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  CONSTRAINT registration_filing_type_check CHECK (filing_type = ANY (ARRAY['regular'::text, 'qrmp'::text, 'composition'::text])),
  CONSTRAINT registration_kind_check CHECK (kind = ANY (ARRAY['gst'::text, 'tan'::text, 'entity'::text, 'custom'::text])),
  CONSTRAINT registration_status_check CHECK (status = ANY (ARRAY['active'::text, 'closed'::text])),
  CONSTRAINT registration_pkey PRIMARY KEY (id),
  CONSTRAINT registration_company_id_kind_identifier_key UNIQUE (company_id, kind, identifier)
);

CREATE TABLE public.standard_document (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  kind text NOT NULL,
  version integer NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  source text NOT NULL,
  source_event_id uuid,
  by_name text,
  at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT standard_document_pkey PRIMARY KEY (id),
  CONSTRAINT standard_document_company_id_kind_version_key UNIQUE (company_id, kind, version)
);

CREATE TABLE public.standard_kind (
  code text NOT NULL,
  label text NOT NULL,
  grp text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  doc_codes text[] NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT standard_kind_pkey PRIMARY KEY (code)
);

-- ====================================================
-- FOREIGN KEYS
-- ====================================================

ALTER TABLE public.app_user ADD CONSTRAINT app_user_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.company_access ADD CONSTRAINT company_access_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.company_access ADD CONSTRAINT company_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE;
ALTER TABLE public.company_master ADD CONSTRAINT company_master_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.compliance_log ADD CONSTRAINT compliance_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.compliance_setting ADD CONSTRAINT compliance_setting_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.compliance_team ADD CONSTRAINT compliance_team_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.custom_compliance_type ADD CONSTRAINT custom_compliance_type_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.custom_compliance_type ADD CONSTRAINT custom_compliance_type_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registration(id) ON DELETE CASCADE;
ALTER TABLE public.deliverable ADD CONSTRAINT deliverable_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.doc_file ADD CONSTRAINT doc_file_doc_item_id_fkey FOREIGN KEY (doc_item_id) REFERENCES doc_item(id) ON DELETE CASCADE;
ALTER TABLE public.doc_item ADD CONSTRAINT doc_item_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES app_user(id);
ALTER TABLE public.doc_item ADD CONSTRAINT doc_item_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.doc_item ADD CONSTRAINT doc_item_na_by_fkey FOREIGN KEY (na_by) REFERENCES app_user(id);
ALTER TABLE public.doc_item_message ADD CONSTRAINT doc_item_message_doc_item_id_fkey FOREIGN KEY (doc_item_id) REFERENCES doc_item(id) ON DELETE CASCADE;
ALTER TABLE public.event ADD CONSTRAINT event_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id);
ALTER TABLE public.event ADD CONSTRAINT event_type_fkey FOREIGN KEY (type) REFERENCES event_type(code);
ALTER TABLE public.event_document ADD CONSTRAINT event_document_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id);
ALTER TABLE public.event_document ADD CONSTRAINT event_document_doc_code_fkey FOREIGN KEY (doc_code) REFERENCES doc_library(code);
ALTER TABLE public.event_document ADD CONSTRAINT event_document_event_id_fkey FOREIGN KEY (event_id) REFERENCES event(id) ON DELETE CASCADE;
ALTER TABLE public.event_type_doc ADD CONSTRAINT event_type_doc_doc_code_fkey FOREIGN KEY (doc_code) REFERENCES doc_library(code);
ALTER TABLE public.event_type_doc ADD CONSTRAINT event_type_doc_event_type_fkey FOREIGN KEY (event_type) REFERENCES event_type(code);
ALTER TABLE public.file_version ADD CONSTRAINT file_version_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.master_document ADD CONSTRAINT master_document_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.master_document ADD CONSTRAINT master_document_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registration(id) ON DELETE SET NULL;
ALTER TABLE public.master_log ADD CONSTRAINT master_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.mis_upload ADD CONSTRAINT mis_upload_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.mis_upload ADD CONSTRAINT mis_upload_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES app_user(id);
ALTER TABLE public.monthly_financials ADD CONSTRAINT monthly_financials_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.monthly_financials_history ADD CONSTRAINT monthly_financials_history_monthly_financials_id_fkey FOREIGN KEY (monthly_financials_id) REFERENCES monthly_financials(id) ON DELETE CASCADE;
ALTER TABLE public.monthly_line ADD CONSTRAINT monthly_line_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id);
ALTER TABLE public.obligation ADD CONSTRAINT obligation_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.obligation ADD CONSTRAINT obligation_filed_by_fkey FOREIGN KEY (filed_by) REFERENCES app_user(id);
ALTER TABLE public.obligation ADD CONSTRAINT obligation_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registration(id) ON DELETE SET NULL;
ALTER TABLE public.obligation ADD CONSTRAINT obligation_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES app_user(id);
ALTER TABLE public.period_figures ADD CONSTRAINT period_figures_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.period_figures ADD CONSTRAINT period_figures_published_by_fkey FOREIGN KEY (published_by) REFERENCES app_user(id);
ALTER TABLE public.period_figures ADD CONSTRAINT period_figures_source_upload_id_fkey FOREIGN KEY (source_upload_id) REFERENCES mis_upload(id);
ALTER TABLE public.period_figures ADD CONSTRAINT period_figures_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES app_user(id);
ALTER TABLE public.period_figures ADD CONSTRAINT period_figures_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES app_user(id);
ALTER TABLE public.registration ADD CONSTRAINT registration_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
ALTER TABLE public.standard_document ADD CONSTRAINT standard_document_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id);
ALTER TABLE public.standard_document ADD CONSTRAINT standard_document_kind_fkey FOREIGN KEY (kind) REFERENCES standard_kind(code);
ALTER TABLE public.standard_document ADD CONSTRAINT standard_document_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES event(id) ON DELETE SET NULL;

-- ====================================================
-- INDEXES (beyond those implied by PRIMARY KEY / UNIQUE constraints above)
-- ====================================================

CREATE INDEX access_log_at ON public.access_log USING btree (at DESC);
CREATE INDEX company_access_company ON public.company_access USING btree (company_id);
CREATE UNIQUE INDEX company_access_one_active ON public.company_access USING btree (user_id, company_id) WHERE (revoked_at IS NULL);
CREATE INDEX event_company_id_event_date_idx ON public.event USING btree (company_id, event_date);
CREATE INDEX event_document_event_id_idx ON public.event_document USING btree (event_id);
CREATE INDEX file_version_req ON public.file_version USING btree (company_id, req_key);
CREATE UNIQUE INDEX obligation_generated_key ON public.obligation USING btree (company_id, rule_code, registration_id, period);
CREATE UNIQUE INDEX period_figures_one_active ON public.period_figures USING btree (company_id, period) WHERE (state = ANY (ARRAY['draft'::text, 'submitted'::text]));

-- ====================================================
-- FUNCTIONS (SECURITY DEFINER noted inline where applicable)
-- ====================================================

-- SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.claim_app_user()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p text := regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g');
begin
  if auth.uid() is null or p = '' then return; end if;
  update app_user
  set auth_user_id = auth.uid(), last_login_at = now()
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = p;
end;
$function$;

-- SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.current_app_user()
 RETURNS app_user
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  base app_user; result app_user; acc company_access; pa platform_admin;
  hdr uuid; got boolean;
begin
  begin
    hdr := nullif((nullif(current_setting('request.headers', true), '')::json ->> 'x-company-id'), '')::uuid;
  exception when others then hdr := null;
  end;

  select * into base from app_user where auth_user_id = auth.uid();
  if found then
    -- an admin account only counts if the number is also in platform_admin (the real gate)
    if base.account_type = 'admin' and exists (select 1 from platform_admin where phone = base.phone) then
      result := base;
      result.company_id := coalesce(hdr, (select id from company order by created_at limit 1));
      result.role := 'pba';
      return result;
    end if;
    select * into acc from company_access
    where user_id = base.id and revoked_at is null
    order by (company_id is not distinct from hdr) desc, granted_at
    limit 1;
    got := found;
    result := base;
    if got then
      result.company_id := acc.company_id;
      result.role := case acc.role when 'external' then 'practitioner' else acc.role end;
    else
      result.company_id := null;
    end if;
    return result;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.enforce_period_ended()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' and new.state = 'draft' then return new; end if;
  if (new.period || '-01')::date + interval '1 month' > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'The month % has not ended yet - it can be submitted from the 1st of the next month.', new.period;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.guard_published_figures()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare tmp period_figures;
begin
  if old.state <> 'published' then return new; end if;
  -- the figures themselves are frozen once published; only the PBA query and the delivered PDF may change
  tmp := new;
  tmp.query_text := old.query_text;
  tmp.pdf_storage_path := old.pdf_storage_path;
  tmp.pdf_filename := old.pdf_filename;
  if new.state = 'superseded' then
    tmp.state := old.state;
    if tmp is distinct from old then raise exception 'Superseding a month changes only its status'; end if;
    return new;
  end if;
  if new.state = 'published' then
    if tmp is distinct from old then raise exception 'Published figures cannot be edited'; end if;
    return new;
  end if;
  raise exception 'A published month can only be superseded by a newer published version';
end $function$;

-- SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p text := regexp_replace(coalesce(event -> 'user' ->> 'phone', ''), '\D', '', 'g');
begin
  if p <> '' and (
       exists (select 1 from platform_admin where phone = p)
    or exists (select 1 from app_user where phone = p)
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'message', 'This number is not registered. Contact Prime Bottomline Advisory to get access.',
    'http_code', 403));
end;
$function$;

-- SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_phone_registered(p_phone text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists(select 1 from app_user where phone = p_phone)
      or exists(select 1 from platform_admin where phone = p_phone);
$function$;

-- SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists(select 1 from platform_admin where phone = (auth.jwt() ->> 'phone'));
$function$;

-- SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.my_app_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from app_user where auth_user_id = auth.uid() limit 1
$function$;

-- SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.my_company_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id from company c where is_platform_admin()
  union
  select ca.company_id from company_access ca join app_user u on u.id = ca.user_id
  where u.auth_user_id = auth.uid() and ca.revoked_at is null;
$function$;

-- SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.phone_login_status(p_phone text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when exists (select 1 from platform_admin where phone = p_phone) then 'ok'
    when exists (
      select 1 from app_user u
      join company_access a on a.user_id = u.id and a.revoked_at is null
      where u.phone = p_phone
    ) then 'ok'
    when exists (select 1 from app_user where phone = p_phone) then 'no_company'
    else 'unknown'
  end;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_deliverable_status(p_deliverable_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_company_id uuid;
  v_input_codes text[];
  v_period text;
  v_missing_count int;
  v_current_status text;
begin
  select company_id, input_codes, period, status
    into v_company_id, v_input_codes, v_period, v_current_status
    from deliverable where id = p_deliverable_id;

  if v_current_status in ('in_progress','delivered') then
    return;
  end if;

  select count(*) into v_missing_count
  from unnest(v_input_codes) code
  where exists (
    select 1 from doc_item d
    where d.company_id = v_company_id and d.code = code.code and d.priority = 'must'
  )
  and not exists (
    select 1 from doc_item d
    where d.company_id = v_company_id and d.code = code.code
      and d.status in ('accepted', 'not_applicable')
  );

  update deliverable
    set status = case when v_missing_count = 0 then 'ready' else 'blocked' end
    where id = p_deliverable_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_deliverables_for_code(p_company_id uuid, p_code text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  r record;
begin
  for r in
    select id from deliverable
    where company_id = p_company_id
      and p_code = any(input_codes)
  loop
    perform recompute_deliverable_status(r.id);
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_doc_item_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) or tg_op = 'INSERT' then
    perform recompute_deliverables_for_code(new.company_id, new.code);
  end if;
  return new;
end;
$function$;

-- SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.update_own_profile(p_name text, p_position text)
 RETURNS app_user
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  result app_user;
begin
  update app_user set name = p_name, position = p_position
  where auth_user_id = auth.uid()
  returning * into result;
  return result;
end;
$function$;

-- ====================================================
-- TRIGGERS
-- ====================================================

CREATE TRIGGER doc_item_status_change AFTER INSERT OR UPDATE ON public.doc_item FOR EACH ROW EXECUTE FUNCTION trg_doc_item_status_change();
CREATE TRIGGER guard_published_figures BEFORE UPDATE ON public.period_figures FOR EACH ROW EXECUTE FUNCTION guard_published_figures();
CREATE TRIGGER period_must_have_ended BEFORE INSERT OR UPDATE OF state ON public.period_figures FOR EACH ROW EXECUTE FUNCTION enforce_period_ended();

-- ====================================================
-- ROW LEVEL SECURITY — enable on every public table (all 36 have RLS enabled in prod)
-- ====================================================

ALTER TABLE public.access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_compliance_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverable_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_explainer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_file ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_item_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_item_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_type_doc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_filing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_financials_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obligation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_figures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_kind ENABLE ROW LEVEL SECURITY;

-- ====================================================
-- POLICIES (public schema)
-- ====================================================

CREATE POLICY "admin reads access log" ON public.access_log AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "admin writes access log" ON public.access_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());

CREATE POLICY "admin reads all app_user" ON public.app_user AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "admin updates app_user" ON public.app_user AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "platform admin insert app_user" ON public.app_user AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY "same company read users" ON public.app_user AS PERMISSIVE FOR SELECT TO authenticated USING (((auth_user_id = auth.uid()) OR (company_id IN ( SELECT my_company_ids() AS my_company_ids)) OR (id IN ( SELECT company_access.user_id
   FROM company_access
  WHERE ((company_access.company_id IN ( SELECT my_company_ids() AS my_company_ids)) AND (company_access.revoked_at IS NULL))))));

CREATE POLICY "admin reads all companies" ON public.company AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "admin updates companies" ON public.company AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "platform admin insert company" ON public.company AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY "read my companies" ON public.company AS PERMISSIVE FOR SELECT TO authenticated USING ((id IN ( SELECT my_company_ids() AS my_company_ids)));
CREATE POLICY "same company read company" ON public.company AS PERMISSIVE FOR SELECT TO public USING ((id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at))));
CREATE POLICY "same company update company" ON public.company AS PERMISSIVE FOR UPDATE TO public USING ((id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at))));

CREATE POLICY "admin manages access" ON public.company_access AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "read own or admin access" ON public.company_access AS PERMISSIVE FOR SELECT TO authenticated USING ((is_platform_admin() OR (user_id = my_app_user_id())));

CREATE POLICY "members update company_master" ON public.company_master AS PERMISSIVE FOR UPDATE TO authenticated USING ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type, hidden))));
CREATE POLICY "members write" ON public.company_master AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type, hidden))));
CREATE POLICY "read my companies" ON public.company_master AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "maintainers update" ON public.compliance_log AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "maintainers write" ON public.compliance_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "read my companies" ON public.compliance_log AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "admin writes compliance_rule" ON public.compliance_rule AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "read compliance_rule" ON public.compliance_rule AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "maintainers update" ON public.compliance_setting AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "maintainers write" ON public.compliance_setting AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "read my companies" ON public.compliance_setting AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "maintainers update" ON public.compliance_team AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "maintainers write" ON public.compliance_team AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "read my companies" ON public.compliance_team AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "maintainers update" ON public.custom_compliance_type AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "maintainers write" ON public.custom_compliance_type AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "read my companies" ON public.custom_compliance_type AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "authenticated insert deliverable admin" ON public.deliverable AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "same company read deliverable" ON public.deliverable AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));
CREATE POLICY "same company update deliverable" ON public.deliverable AS PERMISSIVE FOR UPDATE TO public USING ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at))));

CREATE POLICY "authenticated read deliverable_template" ON public.deliverable_template AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin writes doc_explainer" ON public.doc_explainer AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "read doc_explainer" ON public.doc_explainer AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated delete doc_file" ON public.doc_file AS PERMISSIVE FOR DELETE TO authenticated USING ((doc_item_id IN ( SELECT doc_item.id
   FROM doc_item
  WHERE (doc_item.company_id = ( SELECT current_app_user.company_id
           FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at))))));
CREATE POLICY "same company insert doc_file" ON public.doc_file AS PERMISSIVE FOR INSERT TO public WITH CHECK ((doc_item_id IN ( SELECT doc_item.id
   FROM doc_item
  WHERE (doc_item.company_id = ( SELECT current_app_user.company_id
           FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at))))));
CREATE POLICY "same company read doc_file" ON public.doc_file AS PERMISSIVE FOR SELECT TO authenticated USING ((doc_item_id IN ( SELECT doc_item.id
   FROM doc_item
  WHERE (doc_item.company_id IN ( SELECT my_company_ids() AS my_company_ids)))));

CREATE POLICY "authenticated insert doc_item admin" ON public.doc_item AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "same company insert doc_item" ON public.doc_item AS PERMISSIVE FOR INSERT TO public WITH CHECK ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at))));
CREATE POLICY "same company read doc_item" ON public.doc_item AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));
CREATE POLICY "same company update doc_item" ON public.doc_item AS PERMISSIVE FOR UPDATE TO public USING ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at))));

CREATE POLICY "authenticated insert doc_item_message" ON public.doc_item_message AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((doc_item_id IN ( SELECT doc_item.id
   FROM doc_item
  WHERE (doc_item.company_id = ( SELECT current_app_user.company_id
           FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at))))));
CREATE POLICY "authenticated read doc_item_message" ON public.doc_item_message AS PERMISSIVE FOR SELECT TO authenticated USING ((doc_item_id IN ( SELECT doc_item.id
   FROM doc_item
  WHERE (doc_item.company_id IN ( SELECT my_company_ids() AS my_company_ids)))));

CREATE POLICY "authenticated read doc_item_template" ON public.doc_item_template AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "read doc_library" ON public.doc_library AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "maintainers insert" ON public.event AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "maintainers update" ON public.event AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "read my companies" ON public.event AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "maintainers insert" ON public.event_document AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "maintainers update" ON public.event_document AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "read my companies" ON public.event_document AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "read event_type" ON public.event_type AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "read event_type_doc" ON public.event_type_doc AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "members update file_version" ON public.file_version AS PERMISSIVE FOR UPDATE TO authenticated USING ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type, hidden))));
CREATE POLICY "members write" ON public.file_version AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type, hidden))));
CREATE POLICY "read my companies" ON public.file_version AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "maintainers update master_document" ON public.master_document AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "members upload master_document" ON public.master_document AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))));
CREATE POLICY "read my companies" ON public.master_document AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "admin writes master_filing" ON public.master_filing AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "read master_filing" ON public.master_filing AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "members write" ON public.master_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type, hidden))));
CREATE POLICY "read my companies" ON public.master_log AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "admin writes master_rule" ON public.master_rule AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "read master_rule" ON public.master_rule AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "practitioner delete own mis_upload" ON public.mis_upload AS PERMISSIVE FOR DELETE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name)) = 'practitioner'::text)));
CREATE POLICY "practitioner insert mis_upload" ON public.mis_upload AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name)) = 'practitioner'::text)));
CREATE POLICY "same company read mis_upload" ON public.mis_upload AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "same company insert monthly_financials" ON public.monthly_financials AS PERMISSIVE FOR INSERT TO public WITH CHECK ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at))));
CREATE POLICY "same company read monthly_financials" ON public.monthly_financials AS PERMISSIVE FOR SELECT TO public USING ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at))));
CREATE POLICY "same company update monthly_financials" ON public.monthly_financials AS PERMISSIVE FOR UPDATE TO public USING ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at))));

CREATE POLICY "same company insert monthly_financials_history" ON public.monthly_financials_history AS PERMISSIVE FOR INSERT TO public WITH CHECK ((monthly_financials_id IN ( SELECT monthly_financials.id
   FROM monthly_financials
  WHERE (monthly_financials.company_id = ( SELECT current_app_user.company_id
           FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at))))));
CREATE POLICY "same company read monthly_financials_history" ON public.monthly_financials_history AS PERMISSIVE FOR SELECT TO public USING ((monthly_financials_id IN ( SELECT monthly_financials.id
   FROM monthly_financials
  WHERE (monthly_financials.company_id = ( SELECT current_app_user.company_id
           FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at))))));

CREATE POLICY "external edits" ON public.monthly_line AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = 'practitioner'::text)));
CREATE POLICY "external posts" ON public.monthly_line AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = 'practitioner'::text)));
CREATE POLICY "read my companies" ON public.monthly_line AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "maintainers insert obligation" ON public.obligation AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "maintainers update obligation" ON public.obligation AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "same company mark filed obligation" ON public.obligation AS PERMISSIVE FOR UPDATE TO authenticated USING ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name)))) WITH CHECK ((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name))));
CREATE POLICY "same company read obligation" ON public.obligation AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "pba corrects or supersedes published period_figures" ON public.period_figures AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = 'pba'::text) AND (state = 'published'::text))) WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = 'pba'::text) AND (state = ANY (ARRAY['published'::text, 'superseded'::text]))));
CREATE POLICY "pba update submitted period_figures" ON public.period_figures AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name)) = 'pba'::text) AND (state = 'submitted'::text))) WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name)) = 'pba'::text)));
CREATE POLICY "practitioner delete own draft period_figures" ON public.period_figures AS PERMISSIVE FOR DELETE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name)) = 'practitioner'::text) AND (state <> 'published'::text)));
CREATE POLICY "practitioner insert period_figures" ON public.period_figures AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name)) = 'practitioner'::text)));
CREATE POLICY "practitioner update own draft period_figures" ON public.period_figures AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name)) = 'practitioner'::text) AND (state = 'draft'::text))) WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name)) = 'practitioner'::text)));
CREATE POLICY "same company read period_figures" ON public.period_figures AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "admin adds platform_admin" ON public.platform_admin AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY "admin reads platform_admin" ON public.platform_admin AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_admin());

CREATE POLICY "maintainers update" ON public.registration AS PERMISSIVE FOR UPDATE TO authenticated USING (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "maintainers write" ON public.registration AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "read my companies" ON public.registration AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "maintainers insert" ON public.standard_document AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT current_app_user.company_id
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type))) AND (( SELECT current_app_user.role
   FROM current_app_user() current_app_user(id, email, name, role, company_id, created_at, last_login_at, phone, auth_user_id, "position", can_verify, can_publish, firm_name, account_type)) = ANY (ARRAY['practitioner'::text, 'pba'::text]))));
CREATE POLICY "read my companies" ON public.standard_document AS PERMISSIVE FOR SELECT TO authenticated USING ((company_id IN ( SELECT my_company_ids() AS my_company_ids)));

CREATE POLICY "read standard_kind" ON public.standard_kind AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

-- ====================================================
-- GRANTS
-- ====================================================

-- Standard Supabase default: full table privileges to anon/authenticated/service_role on every
-- public table, with RLS policies above as the actual access control.
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.claim_app_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_user() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_period_ended() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_published_figures() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_phone_registered(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_app_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_company_ids() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phone_login_status(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_deliverable_status(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_deliverables_for_code(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_doc_item_status_change() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text) TO anon, authenticated, service_role;

-- ====================================================
-- STORAGE: "docs" bucket + its storage.objects policies
-- ====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('docs', 'docs', false, null, null)
ON CONFLICT (id) DO NOTHING;

-- storage.objects already has ROW LEVEL SECURITY enabled by Supabase by default.

CREATE POLICY "same company delete files" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'docs'::text) AND ((storage.foldername(name))[1] IN ( SELECT (my_company_ids())::text AS my_company_ids))));
CREATE POLICY "same company read files" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'docs'::text) AND ((storage.foldername(name))[1] IN ( SELECT (my_company_ids())::text AS my_company_ids))));
CREATE POLICY "same company upload files" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'docs'::text) AND ((storage.foldername(name))[1] IN ( SELECT (my_company_ids())::text AS my_company_ids))));
