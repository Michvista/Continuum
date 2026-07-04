import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, PlayCircle, BadgeCheck } from "lucide-react";
import { useApp } from "../context/AppContext";
import { PrimaryButton } from "../components/ui";
import { prepareDemoDataset } from "../demo";
import { api } from "../api";

const KNOWN_INSTITUTIONS = [
  "Hospital A - Lagos General",
  "Hospital B - Eko Community Clinic",
];

const ROLES = [
  { value: "CLINICIAN", label: "Clinician" },
  { value: "REVIEWER", label: "Reviewer" },
  { value: "ADMIN", label: "Admin" },
  { value: "NURSE", label: "Nurse" },
] as const;

type AccountType = "PATIENT" | "CLINICIAN";

export default function Login() {
  const { login, setSelectedPatientId } = useApp();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<AccountType>("CLINICIAN");
  const [email, setEmail] = useState("");
  const [institutions, setInstitutions] = useState<string[]>([]);
  const [institutionName, setInstitutionName] = useState("");
  const [customInstitution, setCustomInstitution] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [role, setRole] =
    useState<(typeof ROLES)[number]["value"]>("CLINICIAN");
  const [demoLoading, setDemoLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listInstitutions()
      .then((data) => {
        setInstitutions(data);
        if (data.length > 0) {
          setInstitutionName(data[0]);
        }
      })
      .catch(() => {
        setInstitutions(KNOWN_INSTITUTIONS);
        setInstitutionName(KNOWN_INSTITUTIONS[0]);
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      setLoading(true);
      if (accountType === "PATIENT") {
        if (!email.trim()) {
          setError("Email is required for patient login.");
          return;
        }

        const result = await api.patientLogin(email.trim());
        login({
          id: result.user.id,
          email: result.user.email,
          authorName: result.user.displayName,
          institutionName: result.user.institutionName ?? "Patient portal",
          role: result.user.role,
          token: result.token,
          patientId: result.user.patientId,
        });
        setSelectedPatientId(result.user.patientId ?? null);
        navigate("/portal");
      } else {
        if (!email.trim() || !authorName.trim()) {
          setError("Email and your name are required for clinician login.");
          return;
        }

        const institution = customInstitution.trim() || institutionName;
        if (!institution) {
          setError("Institution name is required for clinician login.");
          return;
        }

        const result = await api.clinicianLogin({
          email: email.trim(),
          displayName: authorName.trim(),
          institutionName: institution,
          role,
        });

        login({
          id: result.user.id,
          email: result.user.email,
          authorName: result.user.displayName,
          institutionName: result.user.institutionName ?? institution,
          role: result.user.role,
          token: result.token,
          patientId: result.user.patientId,
        });

        navigate("/dashboard");
      }
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function runDemo() {
    setDemoLoading(true);
    setError(null);
    try {
      const loginResult = await api.clinicianLogin({
        email: "demo@continuum.local",
        displayName: "Demo Reviewer",
        institutionName: KNOWN_INSTITUTIONS[0],
        role: "REVIEWER",
      });
      login({
        id: loginResult.user.id,
        email: loginResult.user.email,
        authorName: loginResult.user.displayName,
        institutionName:
          loginResult.user.institutionName ?? KNOWN_INSTITUTIONS[0],
        role: loginResult.user.role,
        token: loginResult.token,
        patientId: loginResult.user.patientId,
      });
      const patientId = await prepareDemoDataset();
      setSelectedPatientId(patientId);
      navigate("/dashboard");
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f8fa] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <ShieldCheck size={20} className="text-teal-600" />
          <span className="font-semibold text-lg">Continuum</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-card p-6 space-y-4">
          <p className="text-sm text-slate-500">
            Sign in as the institution viewing or logging records. This
            identifies your session for provenance - it is not a security
            boundary in this build.
          </p>

          <button
            type="button"
            onClick={runDemo}
            disabled={demoLoading}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100 transition disabled:opacity-60">
            <PlayCircle size={16} />
            {demoLoading ? "Preparing demo..." : "Run live continuity demo"}
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <BadgeCheck size={13} />
            Seeds a patient, two visits, and a cross-institution history in one
            click.
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            {(["PATIENT", "CLINICIAN"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setAccountType(type)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  accountType === type
                    ? "border-teal-200 bg-teal-50 text-teal-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}>
                {type === "PATIENT" ? "Patient" : "Clinician"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="eyebrow block mb-1.5">Email</label>
              <input
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {accountType === "CLINICIAN" && (
              <>
                <div>
                  <label className="eyebrow block mb-1.5">Institution</label>
                  <select
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition">
                    {institutions.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="...or register a new hospital / custom name"
                    value={customInstitution}
                    onChange={(e) => setCustomInstitution(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-2 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 pl-1 font-sans">
                    ✨ Entering a new name dynamically registers the hospital on the network.
                  </p>
                </div>

                <div>
                  <label className="eyebrow block mb-1.5">Your name</label>
                  <input
                    placeholder="e.g. Dr. Adeyemi"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="eyebrow block mb-1.5">Role</label>
                  <select
                    value={role}
                    onChange={(e) =>
                      setRole(e.target.value as (typeof ROLES)[number]["value"])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    {ROLES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <PrimaryButton
              type="submit"
              className="w-full"
              disabled={loading || demoLoading}>
              {loading
                ? "Signing in..."
                : accountType === "PATIENT"
                  ? "Continue to patient portal"
                  : "Sign in as clinician"}
            </PrimaryButton>
          </form>
        </div>
        <p className="text-center text-xs text-slate-400 mt-4 font-mono">
          demo build - no real credentials required
        </p>
      </div>
    </div>
  );
}
