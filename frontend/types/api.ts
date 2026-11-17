export type CaseStatus = "collecting" | "ready" | "planned";

export interface QuickReply {
  label: string;
  value?: string;
}

export interface Question {
  key: string;
  text: string;
  helper?: string;
  quick_replies: QuickReply[];
  multi_select?: boolean;
  optional?: boolean;
}

export interface MessageMeta {
  kind?: "question" | "summary" | "facts_updated" | string;
  question?: Question | null;
  quick_replies?: QuickReply[];
  updated_facts?: Record<string, unknown>;
  progress?: Progress;
  provider?: string;
  provider_is_mock?: boolean;
  demo?: boolean;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  meta: MessageMeta;
  created_at: string;
}

export interface CaseFacts {
  [key: string]: unknown;
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
  wage_basis?: string | null;
  daily_wage?: number | null;
  monthly_wage?: number | null;
  unit_price?: number | null;
  agreed_amount?: number | null;
  paid_amount?: number | null;
  owed_amount?: number | null;
  owed_amount_approx?: boolean;
  owed_amount_note?: string | null;
  has_contract?: "yes" | "no" | "unknown" | null;
  evidence?: string[];
  evidence_other?: string | null;
  evidence_status?: string | null;
  project_info_status?: string | null;
  prior_report?: "yes" | "no" | null;
  prior_report_detail?: string | null;
  user_statement?: string | null;
  notes?: string | null;
}

export interface Progress {
  checks: Record<string, boolean>;
  done: number;
  total: number;
  percent: number;
  unknown_count: number;
}

export interface CaseRecord {
  id: string;
  title: string;
  scene: string;
  status: CaseStatus;
  is_demo: boolean;
  facts: CaseFacts;
  intake: {
    confirmed: boolean;
    unknowns: Record<string, string>;
    skipped: string[];
  };
  progress: Progress;
  step_progress: {
    done: number;
    total: number;
    percent: number;
  };
  plan_generated_at: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface CaseBrief {
  id: string;
  title: string;
  scene: string;
  status: CaseStatus;
  is_demo: boolean;
  city?: string | null;
  district?: string | null;
  work_type?: string | null;
  owed_amount?: number | null;
  owed_amount_approx?: boolean;
  progress: Progress;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  title: string;
  description: string;
  status: "available" | "coming_soon";
  tag: string;
}

export interface EvidenceCatalogItem {
  key: string;
  label: string;
  proves: string[];
  how_to_get: string;
}

export interface Meta {
  product_name: string;
  service_region: string;
  scene: string;
  scenes: Scene[];
  cities: string[];
  provider: ProviderInfo;
  evidence_catalog: EvidenceCatalogItem[];
  privacy: Record<string, unknown>;
  limitations: string[];
  disclaimer: string;
}

export interface ProviderInfo {
  provider_id: string;
  display_name: string;
  is_mock: boolean;
  note: string;
}

export interface SendMessageResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  case: CaseRecord;
  next_question: Question | null;
  progress: Progress;
  status: CaseStatus;
  provider: ProviderInfo;
}

export interface BasicInfoItem {
  key: string;
  label: string;
  value: string;
  status: "known" | "approx" | "unknown";
  note?: string | null;
}

export interface RelationshipNode {
  id: string;
  label: string;
  name: string;
  status: "known" | "partial" | "unknown";
  note: string;
}

export interface RelationshipEdge {
  from: string;
  to: string;
  label: string;
  status: "known" | "partial" | "unknown";
}

export interface EvidenceItem {
  key: string;
  label: string;
  proves?: string[];
  reason?: string;
  how_to_get?: string;
}

export interface EvidenceAnalysis {
  summary: string;
  have: EvidenceItem[];
  needed: EvidenceItem[];
  alternatives: EvidenceItem[];
  verify: EvidenceItem[];
  disclaimer: string;
  catalog: EvidenceCatalogItem[];
}

export interface RightItem {
  id: string;
  title: string;
  description: string;
  status: string;
  basis: string[];
}

export interface LegalAnalysisItem {
  id: string;
  article: string;
  heading: string;
  text: string;
  document_title: string;
  document_number: string;
  issuing_authority: string;
  official_url: string | null;
  official_source_name: string | null;
  verification_status: string;
  verification_label: string;
  source_note: string | null;
  conditions: string[];
  supporting_facts: string[];
  pending_verification: string[];
  applicability: string;
  why_relevant: string;
}

export interface LegalDocumentInfo {
  id: string;
  title: string;
  doc_number: string;
  issuing_authority: string;
  region_name: string;
  validity: string;
  verification_status: string;
  official_url: string | null;
  official_source_name: string | null;
  last_verified_at: string | null;
  source_note: string | null;
  provision_count: number;
}

export interface LegalBasisResponse {
  query: string;
  provisions: Array<
    LegalAnalysisItem & {
      document: LegalDocumentInfo;
      score: number;
      why_relevant: string;
      source_type: string;
    }
  >;
  documents: LegalDocumentInfo[];
  verification_summary: {
    total: number;
    verified: number;
    transcribed: number;
    pending: number;
    pending_ids: string[];
    note: string;
  };
  disclaimer: string;
}

export interface AnalysisResponse {
  case_id: string;
  title: string;
  status: CaseStatus;
  is_demo: boolean;
  completeness: Progress;
  basic_info: BasicInfoItem[];
  relationship: {
    nodes: RelationshipNode[];
    edges: RelationshipEdge[];
    confirmed_notes: string[];
    disclaimer: string;
  };
  evidence: EvidenceAnalysis;
  rights: RightItem[];
  legal_analysis: LegalAnalysisItem[];
  legal_sources: {
    documents: LegalDocumentInfo[];
    verification_summary: LegalBasisResponse["verification_summary"];
    disclaimer: string;
  };
  risk_flags: Array<{
    level: "attention" | "info";
    title: string;
    detail: string;
    legal_basis?: string[];
  }>;
  jurisdiction: {
    province: string;
    city: string | null;
    district: string | null;
    primary_agency: string;
    confidence: "high" | "medium" | "low";
    guidance: string;
    note: string;
  };
  summary: string;
  disclaimer: string;
  generated_at: string;
  preliminary?: boolean;
  preliminary_note?: string;
}

export interface ActionStep {
  id: string;
  step_key: string;
  position: number;
  title: string;
  why: string;
  prepare: string[];
  channel_id: string | null;
  channel_name: string | null;
  legal_basis: string[];
  deadline_note: string | null;
  risk_note: string | null;
  draft_text: string | null;
  done: boolean;
  done_at: string | null;
}

export interface ChannelInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  official_url: string | null;
  access_note: string | null;
  jurisdiction_rule: string | null;
  verification_status: string;
  last_verified_at: string | null;
  source_note: string | null;
  recommended: boolean;
  reason: string;
  legal_basis: string[];
}

export interface ActionPlanResponse {
  case_id: string;
  title: string;
  steps: ActionStep[];
  progress: { done: number; total: number; percent: number };
  channels: ChannelInfo[];
  primary_channel_id: string;
  formal_statement: string;
  deadlines: Array<{
    title: string;
    detail: string;
    legal_basis: string[];
    urgency: string;
  }>;
  risks: string[];
  generated_at: string;
  disclaimer: string;
  preliminary?: boolean;
  preliminary_note?: string;
  case_status?: CaseStatus;
}

export interface FormField {
  key: string;
  label: string;
  explanation: string;
  required: boolean;
  sensitivity: string;
  input_type: string;
  status: "ready" | "missing" | "verify" | "official_only";
  value: string | null;
  copy_text: string;
  note: string;
  source_facts: string[];
  placeholder?: string | null;
}

export interface FormStep {
  id: string;
  title: string;
  goal: string;
  tips: string[];
  fields: FormField[];
}

export interface FormAssistantResponse {
  case_id: string;
  platform: {
    name: string;
    official_url: string;
    access_note: string;
    verification_status: string;
    last_verified_at: string | null;
    source_note: string;
  };
  steps: FormStep[];
  progress: { ready: number; total: number; percent: number };
  formal_statement: string;
  short_description: string;
  evidence_directory: Array<{
    label: string;
    proves: string;
    status: string;
    how_to_get: string;
  }>;
  copy_summary: string;
  privacy_notice: string;
  submit_notice: string;
  generated_at: string;
  preliminary?: boolean;
  preliminary_note?: string;
}
