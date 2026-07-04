import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Activity,
  Users,
  LockKeyhole,
  FileScan,
  Stethoscope,
  BadgeCheck,
  Sparkles,
} from "lucide-react";
import { GhostButton, PrimaryButton, Card, Badge } from "../components/ui";
import { prepareDemoDataset } from "../demo";

const HIGHLIGHTS = [
  {
    icon: Activity,
    title: "Live continuity",
    body: "Fragments from different institutions reconcile into one patient timeline in real time.",
  },
  {
    icon: LockKeyhole,
    title: "Consent with clinical escape hatches",
    body: "Patients can hide items from their own portal while clinicians still have audited break-glass access.",
  },
  {
    icon: FileScan,
    title: "Proof attached",
    body: "Voice notes, scans, and notes stay tied to source evidence instead of drifting into anonymous summaries.",
  },
];

const STEPS = [
  "Patient enrolls once and chooses visibility for sensitive categories.",
  "Clinicians can still request break-glass access for care-critical information.",
  "Cognee syncs the fragments into a live cross-institution memory graph.",
];

export default function Landing() {
  const navigate = useNavigate();

  async function openDemo() {
    const patientId = await prepareDemoDataset();
    navigate(`/portal?patientId=${patientId}`);
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={19} className="text-teal-600" />
            <span className="font-semibold tracking-tight">Continuum</span>
            <Badge tone="teal">shared memory</Badge>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600">
            <a href="#governance">Governance</a>
            <a href="#consent">Consent</a>
            <a href="#demo">Demo</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/portal">
              <GhostButton>Access Portal</GhostButton>
            </Link>
            <Link to="/login">
              <PrimaryButton>Enter app</PrimaryButton>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 pb-10 lg:pt-16">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
            <div>
              <Badge tone="teal">WHO ACCESS CONTROL 2.0</Badge>
              <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05] max-w-2xl">
                The decentralized patient memory layer, with consent the whole care team can trust.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl">
                Continuum links fragmented records across hospitals, clinics, scans, and voice notes so the next
                clinician sees the story instead of starting from zero. Patients can hide entries from their own
                portal, while care-critical information stays available through audited break-glass access.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  onClick={openDemo}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 transition"
                >
                  <Sparkles size={16} />
                  Run live continuity demo
                </button>
                <Link to="/portal">
                  <GhostButton className="px-4 py-2.5">Open patient portal</GhostButton>
                </Link>
                <Link to="/login">
                  <GhostButton className="px-4 py-2.5">Clinician sign in</GhostButton>
                </Link>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                <BadgeCheck size={14} />
                <span>One session for the patient portal, another for the care team, both wired into the same graph.</span>
              </div>
            </div>

            <Card className="p-4 sm:p-5 shadow-card bg-white">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="eyebrow">Live access snapshot</p>
                  <h2 className="font-semibold text-lg">Sensitive data governance</h2>
                </div>
                <Badge tone="amber">break-glass ready</Badge>
              </div>
              <div className="space-y-3">
                {[
                  ["Mental health", "Hidden from patient portal", "Clinicians can still access with audit"],
                  ["Reproductive health", "Visible only to clinicians", "Emergency access available"],
                  ["HIV status", "Emergency-only", "Break-glass reason required"],
                ].map(([title, state, note]) => (
                  <div key={title} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-sm">{title}</p>
                      <Badge tone={title === "HIV status" ? "red" : "neutral"}>{state}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{note}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        <section id="governance" className="border-t border-slate-200 bg-[#111827] text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
            <div className="grid lg:grid-cols-3 gap-6">
              {HIGHLIGHTS.map((item) => (
                <Card key={item.title} className="p-5 bg-white/5 border-white/10 text-white">
                  <item.icon size={18} className="text-teal-300" />
                  <h3 className="mt-3 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-300 leading-6">{item.body}</p>
                </Card>
              ))}
            </div>
            <div id="consent" className="grid lg:grid-cols-[0.95fr_1.05fr] gap-8 mt-12 items-center">
              <div>
                <p className="eyebrow text-slate-300">Consent with safety baked in</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                  Patients control visibility. Doctors keep a path to what matters.
                </h2>
                <p className="mt-4 text-slate-300 leading-7">
                  Hiding something from the patient portal does not erase it from clinical workflows. Items marked
                  emergency-only stay locked behind a break-glass action that is logged with the reason, the
                  institution, and the clinician identity.
                </p>
                <ul className="mt-5 space-y-3 text-sm text-slate-200">
                  {STEPS.map((step) => (
                    <li key={step} className="flex gap-3">
                      <span className="mt-1 h-2 w-2 rounded-full bg-teal-300 shrink-0" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Card className="p-5 bg-white text-slate-900">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Patient-facing portal preview</h3>
                  <Badge tone="teal">audited</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="eyebrow">Network access</p>
                    <p className="mt-2 font-medium">2 hospitals</p>
                    <p className="text-xs text-slate-500 mt-1">One active, one pending approval</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="eyebrow">Emergency override</p>
                    <p className="mt-2 font-medium">Enabled</p>
                    <p className="text-xs text-slate-500 mt-1">Requires reason, institution, and audit trail</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 col-span-2">
                    <p className="eyebrow">Recent activity</p>
                    <div className="mt-2 space-y-2 text-xs text-slate-600">
                      <p>Metro General Hospital requested medication history.</p>
                      <p>Patient marked reproductive health as clinician-only.</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-6 items-center">
            <Card className="p-6">
              <p className="eyebrow">For patients</p>
              <h3 className="mt-2 text-xl font-semibold">Own the visibility settings, not the clinical responsibility.</h3>
              <p className="mt-3 text-sm text-slate-600 leading-6">
                Patients choose what appears in the portal and what requires extra caution. That keeps the experience
                transparent without pretending privacy and clinical safety are the same thing.
              </p>
            </Card>
            <ArrowRight className="hidden lg:block text-slate-300" size={28} />
            <Card className="p-6">
              <p className="eyebrow">For clinicians</p>
              <h3 className="mt-2 text-xl font-semibold">See the whole story when the case demands it.</h3>
              <p className="mt-3 text-sm text-slate-600 leading-6">
                The app surfaces provenance, conflicts, and an audited emergency path so hidden data can still be
                recovered when it changes the outcome.
              </p>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
