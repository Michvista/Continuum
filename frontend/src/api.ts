import type {
  Patient,
  PatientDetail,
  Fragment,
  FragmentListResponse,
  RecallResponse,
  GraphResponse,
  GraphSyncLogEntry,
  ReviewStatus,
  ConsentBundle,
  ConsentRule,
  ConsentProfile,
  AccessGrant,
  AccessAudit,
  SensitiveCategory,
  ConsentVisibility,
  AccessGrantStatus,
  AccessGrantLevel,
  UserRole,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listInstitutions: () => request<string[]>("/auth/institutions"),
  patientLogin: (email: string) =>
    request<{ token: string; expiresAt: string; user: { id: string; email: string; displayName: string; role: UserRole; institutionName: string | null; patientId: string | null } }>("/auth/patient/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  clinicianLogin: (body: {
    email: string;
    displayName: string;
    institutionName: string;
    role: UserRole;
  }) =>
    request<{ token: string; expiresAt: string; user: { id: string; email: string; displayName: string; role: UserRole; institutionName: string | null; patientId: string | null } }>("/auth/clinician/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listPatients: (q?: string) => request<Patient[]>(q ? `/patients?q=${encodeURIComponent(q)}` : "/patients"),
  getPatient: (patientId: string) => request<PatientDetail>(`/patients/${patientId}`),
  createPatient: (displayName: string) =>
    request<Patient>("/patients", {
      method: "POST",
      body: JSON.stringify({ displayName }),
    }),
  createVisit: (
    patientId: string,
    body: { institutionName: string; visitDate: string; notes?: string }
  ) =>
    request(`/patients/${patientId}/visits`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listFragments: (patientId: string) =>
    request<FragmentListResponse>(`/fragments/patient/${patientId}`),
  createFragment: (body: Partial<Fragment> & { patientId: string }) =>
    request<Fragment>("/fragments", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateFragmentReview: (fragmentId: string, reviewStatus: ReviewStatus, resolutionNote?: string) =>
    request<Fragment>(`/fragments/${fragmentId}/review`, {
      method: "PATCH",
      body: JSON.stringify({ reviewStatus, resolutionNote }),
    }),
  recall: (patientId: string, query: string) =>
    request<RecallResponse>("/recall", {
      method: "POST",
      body: JSON.stringify({ patientId, query }),
    }),
  graph: (patientId: string) => request<GraphResponse>(`/graph/${patientId}`),
  graphLog: (patientId: string) => request<GraphSyncLogEntry[]>(`/graph/${patientId}/log`),
  getConsent: (patientId: string) => request<{ patient: Patient; profile: ConsentProfile; rules: ConsentRule[]; grants: AccessGrant[]; audits: AccessAudit[] }>(`/patients/${patientId}/consent`),
  updateConsent: (
    patientId: string,
    body: {
      profile?: Partial<ConsentProfile>;
      rules?: Array<Partial<ConsentRule> & { category: SensitiveCategory; visibility: ConsentVisibility }>;
      grants?: Array<Partial<AccessGrant> & { institutionName: string; status?: AccessGrantStatus; level?: AccessGrantLevel }>;
      audit?: Partial<AccessAudit>;
    }
  ) =>
    request<{ patient: Patient; profile: ConsentProfile; rules: ConsentRule[]; grants: AccessGrant[]; audits: AccessAudit[] }>(
      `/patients/${patientId}/consent`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    ),
    requestAccess: (patientId: string, body: { institutionName: string; level?: AccessGrantLevel; reason?: string }) =>
      request<{ grant: AccessGrant; patient: Patient; profile: ConsentProfile; rules: ConsentRule[]; grants: AccessGrant[]; audits: AccessAudit[] }>(`/patients/${patientId}/consent/request`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    respondGrant: (patientId: string, grantId: string, body: { status: AccessGrantStatus; reason?: string }) =>
      request<{ updated: AccessGrant; patient: Patient; profile: ConsentProfile; rules: ConsentRule[]; grants: AccessGrant[]; audits: AccessAudit[] }>(`/patients/${patientId}/consent/grants/${grantId}/respond`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  requestEmergencyAccess: (
    patientId: string,
    body: { institutionName: string; actorName: string; role: string; reason?: string; category?: SensitiveCategory }
  ) =>
    request<{ ok: true; message: string; audit: AccessAudit }>(`/patients/${patientId}/consent/emergency-access`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export async function transcribeAudio(blob: Blob, filename: string): Promise<{ transcript: string; sourceFileUrl: string }> {
  const form = new FormData();
  form.append("audio", blob, filename);
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${BASE_URL}/uploads/transcribe`, { method: "POST", body: form, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ocrImage(file: File): Promise<{ extractedText: string; sourceFileUrl: string }> {
  const form = new FormData();
  form.append("image", file, file.name);
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${BASE_URL}/uploads/ocr`, { method: "POST", body: form, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
