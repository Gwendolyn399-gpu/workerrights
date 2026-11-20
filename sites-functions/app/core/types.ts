export type Facts = Record<string, unknown> & {
  scene?: string;
  location_province?: string | null;
  location_city?: string | null;
  location_district?: string | null;
  location_detail?: string | null;
  project_name?: string | null;
  developer_name?: string | null;
  contractor_name?: string | null;
  subcontractor_name?: string | null;
  work_type?: string | null;
  work_start?: string | null;
  work_end?: string | null;
  duration_text?: string | null;
  duration_months?: number | null;
  recruiter_type?: string | null;
  recruiter_name?: string | null;
  recruiter_phone?: string | null;
  manager_role?: string | null;
  manager_name?: string | null;
  wage_basis?: string | null;
  daily_wage?: number | null;
  monthly_wage?: number | null;
  unit_price?: number | null;
  agreed_amount?: number | null;
  paid_amount?: number | null;
  owed_amount?: number | null;
  owed_amount_approx?: boolean;
  owed_amount_note?: string | null;
  pay_cycle?: string | null;
  last_paid_date?: string | null;
  has_contract?: "yes" | "no" | "unknown" | null;
  contract_party?: string | null;
  evidence?: string[];
  evidence_other?: string | null;
  evidence_status?: string | null;
  project_info_status?: string | null;
  prior_report?: "yes" | "no" | null;
  prior_report_detail?: string | null;
  contact_phone?: string | null;
  user_statement?: string | null;
  notes?: string | null;
  outside_scope?: boolean;
  outside_scope_note?: string | null;
};

export interface FactSource {
  quote: string;
  previous: unknown;
  status: string;
}

// Mixed internal dict: fact keys map to FactSource, plus plan_signature/demo markers.
export type FactsMeta = Record<string, unknown>;

export interface AgentMemoryEvent {
  note: string;
  source_quote: string;
  status: string;
}

export interface AgentMemory {
  goal?: string | null;
  constraints?: string[];
  events?: AgentMemoryEvent[];
  sources?: Record<string, string>;
  [key: string]: unknown;
}

export interface AgentMaterials {
  draft?: string;
  wage_message?: string;
  evidence?: unknown;
  facts_snapshot?: Facts;
  memory_snapshot?: AgentMemory;
  status?: string;
  [key: string]: unknown;
}

export interface Intake {
  confirmed?: boolean;
  unknowns?: Record<string, string>;
  skipped?: string[];
  agent_memory?: AgentMemory;
  agent_materials?: AgentMaterials;
  agent_stage?: string | null;
  agent_citations?: Record<string, SerializedProvision>;
  agent_session_id?: string | null;
  last_question_key?: string | null;
  [key: string]: unknown;
}

export interface StoredMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface DerivedResult {
  generated_from_revision: number;
  [key: string]: unknown;
}

export interface CaseRow {
  id: string;
  owner_id: string;
  scene: string;
  title: string;
  is_demo: boolean;
  status: "collecting" | "ready" | "planned";
  facts: Facts;
  facts_revision: number;
  facts_meta: FactsMeta;
  intake: Intake;
  derived_results: Record<string, DerivedResult>;
  messages: StoredMessage[];
  message_seq: number;
  row_version: number;
  plan_generated_at: string | null;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Progress {
  checks: Record<string, boolean>;
  done: number;
  total: number;
  percent: number;
  unknown_count: number;
}

export interface Question {
  key: string;
  text: string;
  helper?: string;
  quick_replies: Array<{ label: string; value?: string }>;
  multi_select?: boolean;
  optional?: boolean;
}

export interface ProviderInfo {
  provider_id: string;
  display_name: string;
  is_mock: boolean;
  note: string;
}

export interface EvidenceCatalogItem {
  key: string;
  label: string;
  proves: string[];
  how_to_get: string;
}

export interface LegalDocumentPayload {
  id: string;
  title: string;
  doc_number?: string;
  issuing_authority?: string;
  region?: string;
  region_name?: string;
  publish_date?: string | null;
  effective_date?: string | null;
  expiry_date?: string | null;
  validity?: string;
  official_url?: string | null;
  official_source_name?: string | null;
  last_verified_at?: string | null;
  verification_status?: string;
  source_note?: string | null;
  topics?: string[];
  provisions?: Array<{
    id: string;
    article?: string;
    heading?: string;
    text: string;
    topics?: string[];
    conditions?: string[];
    keywords?: string[];
    verification_status?: string;
  }>;
}

export interface ChannelPayload {
  id: string;
  name: string;
  category: string;
  scope?: string;
  priority?: number;
  description: string;
  official_url?: string | null;
  access_note?: string | null;
  jurisdiction_rule?: string | null;
  verification_status?: string;
  last_verified_at?: string | null;
  source_note?: string | null;
  legal_basis?: string[];
}

export interface SerializedProvision {
  id: string;
  article: string;
  heading: string;
  text: string;
  topics: string[];
  conditions: string[];
  keywords: string[];
  verification_status: string;
  document: Record<string, unknown>;
  score: number;
}