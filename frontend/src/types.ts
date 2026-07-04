export type SourceType =
  | "CLINICAL_NOTE"
  | "LAB_RESULT"
  | "PRESCRIPTION"
  | "VOICE_NOTE"
  | "SCANNED_DOCUMENT"
  | "TEXT_MESSAGE";

export type SensitiveCategory =
  | "NONE"
  | "MENTAL_HEALTH"
  | "REPRODUCTIVE_HEALTH"
  | "SUBSTANCE_USE"
  | "HIV_STATUS"
  | "INTIMATE_PARTNER_VIOLENCE";

export type ReviewStatus = "CLEAR" | "NEEDS_REVIEW" | "UNDER_REVIEW" | "RESOLVED";

export type ConsentVisibility = "VISIBLE" | "CLINICIAN_ONLY" | "EMERGENCY_ONLY";

export type AccessGrantStatus = "ACTIVE" | "PENDING" | "REVOKED";

export type AccessGrantLevel = "STANDARD" | "FULL" | "EMERGENCY";

export type UserRole = "PATIENT" | "CLINICIAN" | "REVIEWER" | "ADMIN" | "NURSE";

export interface Patient {
  id: string;
  displayName: string;
  consentedAt: string;
  createdAt: string;
}

export interface FragmentListResponse {
  fragments: Fragment[];
  redactedCount: number;
  hasBreakGlass: boolean;
}

export interface ConsentProfile {
  id: string;
  patientId: string;
  shareWithCareTeam: boolean;
  allowEmergencyOverride: boolean;
  patientNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentRule {
  id: string;
  patientId: string;
  category: SensitiveCategory;
  visibility: ConsentVisibility;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccessGrant {
  id: string;
  patientId: string;
  institutionName: string;
  status: AccessGrantStatus;
  level: AccessGrantLevel;
  grantedBy: string | null;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccessAudit {
  id: string;
  patientId: string;
  institutionName: string;
  actorName: string;
  role: string;
  action: string;
  reason: string | null;
  category: SensitiveCategory | null;
  emergency: boolean;
  createdAt: string;
}

export interface ConsentBundle {
  profile: ConsentProfile;
  rules: ConsentRule[];
  grants: AccessGrant[];
  audits: AccessAudit[];
}

export interface Visit {
  id: string;
  patientId: string;
  institutionName: string;
  visitDate: string;
  notes: string | null;
  createdAt: string;
}

export interface Fragment {
  id: string;
  patientId: string;
  visitId: string | null;
  originInstitution: string;
  originAuthor: string | null;
  sourceType: SourceType;
  content: string;
  sourceFileUrl: string | null;
  sensitiveCategory: SensitiveCategory;
  conflictsWithId: string | null;
  reviewStatus: ReviewStatus;
  resolutionNote: string | null;
  syncStatus: "PENDING" | "SYNCED" | "FAILED";
  syncError?: string | null;
  createdAt: string;
}

export interface PatientDetail extends Patient {
  visits: Visit[];
  fragments: Fragment[];
  consent?: ConsentBundle;
}

export interface RecallResponse {
  answer: string;
  recallError: string | null;
  verification: string;
  sensitiveCategoriesTouched: SensitiveCategory[];
  conflicts: {
    fragmentId: string;
    conflictsWithId: string | null;
    content: string;
    originInstitution: string;
    reviewStatus: ReviewStatus;
  }[];
  provenance: {
    fragmentId: string;
    originInstitution: string;
    originAuthor: string | null;
    sourceType: SourceType;
    sensitiveCategory: SensitiveCategory;
    reviewStatus: ReviewStatus;
    content: string;
    sourceFileUrl: string | null;
    visitDate: string | null;
    createdAt: string;
  }[];
}

export interface GraphSyncLogEntry {
  id: string;
  fragmentId: string;
  patientId: string;
  status: "PENDING" | "SYNCED" | "FAILED";
  detail: string | null;
  createdAt: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "patient" | "visit" | "fragment";
  sourceType?: string;
  institution?: string;
  sensitive?: boolean;
  synced?: boolean;
  reviewStatus?: ReviewStatus;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "had_visit" | "produced_fragment" | "conflicts_with";
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
