import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Eye, EyeOff, ShieldAlert, ShieldCheck, Users, BadgeCheck } from "lucide-react";
import { api } from "../api";
import type {
  ConsentBundle,
  ConsentVisibility,
  AccessGrant,
  AccessAudit,
  SensitiveCategory,
} from "../types";
import { Badge, Card, EmptyState, GhostButton, PrimaryButton } from "../components/ui";

const CATEGORY_COPY: Record<
  SensitiveCategory,
  { title: string; description: string }
> = {
  NONE: {
    title: "General care",
    description: "Visible across the care team and patient portal.",
  },
  MENTAL_HEALTH: {
    title: "Mental health",
    description: "Psychiatric notes and therapy history.",
  },
  REPRODUCTIVE_HEALTH: {
    title: "Reproductive health",
    description: "Pregnancy, contraception, and related care.",
  },
  SUBSTANCE_USE: {
    title: "Substance use",
    description: "Recovery, detox, and treatment history.",
  },
  HIV_STATUS: {
    title: "HIV status",
    description: "Status and related clinical notes.",
  },
  INTIMATE_PARTNER_VIOLENCE: {
    title: "IPV-related",
    description: "Safety-related history and disclosures.",
  },
};

const VISIBILITY_OPTIONS: {
  value: ConsentVisibility;
  label: string;
  tone: "neutral" | "teal" | "amber";
}[] = [
  { value: "VISIBLE", label: "Visible", tone: "teal" },
  { value: "CLINICIAN_ONLY", label: "Clinician only", tone: "neutral" },
  { value: "EMERGENCY_ONLY", label: "Emergency only", tone: "amber" },
];

function nextVisibility(current: ConsentVisibility): ConsentVisibility {
  const index = VISIBILITY_OPTIONS.findIndex((item) => item.value === current);
  return VISIBILITY_OPTIONS[(index + 1) % VISIBILITY_OPTIONS.length].value;
}

function statusTone(status: AccessGrant["status"]) {
  if (status === "ACTIVE") return "teal" as const;
  if (status === "PENDING") return "amber" as const;
  return "red" as const;
}

export default function PatientPortal() {
  const navigate = useNavigate();
  const { session } = useApp();
  const [bundle, setBundle] = useState<ConsentBundle | null>(null);
  const [patientName, setPatientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consentLoadSeq = useRef(0);

  useEffect(() => {
    const patientId = session?.patientId;
    if (!patientId) {
      setBundle(null);
      setPatientName("");
      return;
    }

    let mounted = true;
    const requestSeq = ++consentLoadSeq.current;
    setLoading(true);
    setError(null);

    api
      .getConsent(patientId)
      .then((result) => {
        if (!mounted || requestSeq !== consentLoadSeq.current) return;
        setBundle({
          profile: result.profile,
          rules: result.rules,
          grants: result.grants,
          audits: result.audits,
        });
        setPatientName(result.patient.displayName);
      })
      .catch((err: any) => {
        if (!mounted || requestSeq !== consentLoadSeq.current) return;
        setError(String(err?.message || err));
      })
      .finally(() => {
        if (mounted && requestSeq === consentLoadSeq.current) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session]);

  const grantStats = useMemo(() => {
    const grants = bundle?.grants ?? [];
    return {
      active: grants.filter((grant) => grant.status === "ACTIVE").length,
      pending: grants.filter((grant) => grant.status === "PENDING").length,
      revoked: grants.filter((grant) => grant.status === "REVOKED").length,
    };
  }, [bundle]);

  async function persist(nextBundle: ConsentBundle) {
    const patientId = session?.patientId;
    if (!patientId) return;
    setSaving(true);
    setError(null);

    try {
      const result = await api.updateConsent(patientId, {
        profile: nextBundle.profile,
        rules: nextBundle.rules,
        audit: {
          institutionName: "Patient portal",
          actorName: "Patient",
          role: "PATIENT",
          action: "UPDATED_CONSENT",
        },
      });
      setBundle(result);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  }

  function updateProfile<K extends keyof ConsentBundle["profile"]>(
    key: K,
    value: ConsentBundle["profile"][K],
  ) {
    if (!bundle) return;
    setBundle({ ...bundle, profile: { ...bundle.profile, [key]: value } });
  }

  function setRuleVisibility(
    category: SensitiveCategory,
    visibility: ConsentVisibility,
  ) {
    if (!bundle) return;
    const nextRules = bundle.rules.map((rule) =>
      rule.category === category ? { ...rule, visibility } : rule,
    );
    setBundle({ ...bundle, rules: nextRules });
  }

  async function handleRespondGrant(grantId: string, status: "ACTIVE" | "REVOKED") {
    const patientId = session?.patientId;
    if (!patientId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.respondGrant(patientId, grantId, { status });
      setBundle({
        profile: res.profile,
        rules: res.rules,
        grants: res.grants,
        audits: res.audits,
      });
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-teal-600" />
            <span className="font-semibold tracking-tight">Continuum Patient Portal</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/">
              <GhostButton>Back to landing</GhostButton>
            </Link>
            <Link to="/login">
              <PrimaryButton>Clinician app</PrimaryButton>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
          <div>
            <Badge tone="teal">patient portal</Badge>
            <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight">
              Your data sharing preferences
            </h1>
            <p className="mt-3 max-w-3xl text-slate-600">
              Control what appears in your own portal and what is visible to the care team. Clinicians use a separate dashboard when they need audited access.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
          <div className="space-y-6">
            <Card className="p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="eyebrow">Patient portal</p>
                  <h2 className="text-lg font-semibold mt-1">{patientName || "Your consent settings"}</h2>
                  {session?.patientId && (
                    <p className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-1.5">
                      <span className="inline-block bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 tracking-wider select-all cursor-text" title="Your patient ID — share this with your clinician">
                        ID: {session.patientId}
                      </span>
                    </p>
                  )}
                  <p className="text-sm text-slate-500 mt-1">
                    Update your preferences for what is visible in the patient portal.
                  </p>
                </div>
                <PrimaryButton
                  onClick={() => bundle && persist(bundle)}
                  disabled={!bundle || saving}
                  className="inline-flex items-center gap-2">
                  <BadgeCheck size={16} />
                  {saving ? "Saving..." : "Save changes"}
                </PrimaryButton>
              </div>
              {bundle && (
                <div className="grid sm:grid-cols-3 gap-3 mt-5">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="eyebrow">Granted</p>
                    <p className="mt-2 text-2xl font-semibold">{grantStats.active}</p>
                    <p className="text-xs text-slate-500">active institutions</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="eyebrow">Pending</p>
                    <p className="mt-2 text-2xl font-semibold">{grantStats.pending}</p>
                    <p className="text-xs text-slate-500">waiting for approval</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="eyebrow">Emergency</p>
                    <p className="mt-2 text-2xl font-semibold">{grantStats.revoked}</p>
                    <p className="text-xs text-slate-500">revoked grants</p>
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow">Sensitive data governance</p>
                  <h2 className="text-lg font-semibold mt-1">What the patient portal shows</h2>
                </div>
                {bundle && <Badge tone="teal">shared care mode</Badge>}
              </div>

              {!bundle ? (
                <EmptyState
                  title={loading ? "Loading consent..." : "Loading your patient consent..."}
                />
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        bundle.profile.shareWithCareTeam
                          ? "border-teal-200 bg-teal-50 text-teal-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                      onClick={() =>
                        setBundle({
                          ...bundle,
                          profile: {
                            ...bundle.profile,
                            shareWithCareTeam: !bundle.profile.shareWithCareTeam,
                          },
                        })
                      }>
                      <Users size={15} />
                      Share with care team
                    </button>
                    <button
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        bundle.profile.allowEmergencyOverride
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                      onClick={() =>
                        setBundle({
                          ...bundle,
                          profile: {
                            ...bundle.profile,
                            allowEmergencyOverride: !bundle.profile.allowEmergencyOverride,
                          },
                        })
                      }>
                      <ShieldAlert size={15} />
                      Allow emergency override
                    </button>
                  </div>

                  <textarea
                    value={bundle.profile.patientNote ?? ""}
                    onChange={(e) => updateProfile("patientNote", e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[90px]"
                    placeholder="Optional note shown to the care team..."
                  />

                  <div className="grid gap-3">
                    {bundle.rules.map((rule) => (
                      <div key={rule.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-sm">{CATEGORY_COPY[rule.category].title}</p>
                            <p className="text-xs text-slate-500 mt-1">{CATEGORY_COPY[rule.category].description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {VISIBILITY_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                onClick={() => setRuleVisibility(rule.category, option.value)}
                                className={`rounded-full border px-3 py-1 text-[11px] font-mono uppercase transition ${
                                  rule.visibility === option.value
                                    ? option.tone === "teal"
                                      ? "border-teal-200 bg-teal-50 text-teal-700"
                                      : option.tone === "amber"
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : "border-slate-300 bg-slate-100 text-slate-700"
                                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                          {rule.visibility === "VISIBLE" ? <Eye size={14} /> : <EyeOff size={14} />}
                          <span>
                            {rule.visibility === "VISIBLE"
                              ? "Shown in the portal and to clinicians."
                              : rule.visibility === "CLINICIAN_ONLY"
                              ? "Hidden from the patient portal, still available to clinicians."
                              : "Hidden from the portal and only retrieved through break-glass access."}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow">Network access</p>
                  <h2 className="text-lg font-semibold mt-1">Who can see this record</h2>
                </div>
                <Badge tone="teal">patient control</Badge>
              </div>

              {bundle ? (
                <div className="mt-4 space-y-3">
                  {bundle.grants.map((grant) => (
                    <div key={grant.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">{grant.institutionName}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {grant.grantedBy ?? "Patient portal"} · {grant.level.toLowerCase()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge tone={statusTone(grant.status)}>{grant.status.toLowerCase()}</Badge>
                          {grant.status === "PENDING" && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleRespondGrant(grant.id, "ACTIVE")}
                                disabled={saving}
                                className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50">
                                Approve
                              </button>
                              <button
                                onClick={() => handleRespondGrant(grant.id, "REVOKED")}
                                disabled={saving}
                                className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition disabled:opacity-50">
                                Deny
                              </button>
                            </div>
                          )}
                          {grant.status === "ACTIVE" && (
                            <button
                              onClick={() => handleRespondGrant(grant.id, "REVOKED")}
                              disabled={saving}
                              className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition disabled:opacity-50">
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Loading access details..." body="Your care team access summary will appear here." />
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow">Recent activity</p>
                  <h2 className="text-lg font-semibold mt-1">Audit trail</h2>
                </div>
                <Badge tone="neutral">latest 20</Badge>
              </div>
              <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
                {bundle?.audits.length ? (
                  bundle.audits.map((audit: AccessAudit) => (
                    <div key={audit.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 font-mono">
                        <span>{new Date(audit.createdAt).toLocaleTimeString()}</span>
                        <span>{audit.emergency ? "break-glass" : "audit"}</span>
                      </div>
                      <p className="text-sm font-medium mt-1">
                        {audit.action.replace(/_/g, " ").toLowerCase()}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {audit.actorName} · {audit.institutionName} · {audit.role.toLowerCase()}
                      </p>
                      {audit.reason && <p className="text-xs text-slate-600 mt-2">{audit.reason}</p>}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No activity yet.</p>
                )}
              </div>
            </Card>

            <Card className="p-5 bg-ink-900 text-white border-ink-900">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-teal-300" />
                <h2 className="font-semibold text-lg">Clinician access still exists</h2>
              </div>
              <p className="mt-3 text-sm text-slate-300 leading-6">
                This portal is for patients to manage their own portal visibility.
                Clinicians use a separate dashboard to request audited access and manage shared-care grants.
              </p>
            </Card>

            {error && (
              <Card className="p-4 border-red-200 bg-red-50">
                <p className="text-sm text-red-700">{error}</p>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
