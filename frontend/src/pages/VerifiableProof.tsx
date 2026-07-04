import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, FileText, Download } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Card, Badge, EmptyState, PrimaryButton, GhostButton } from "../components/ui";

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildPrintableHtml(fragment: {
  content: string;
  sourceType: string;
  originInstitution: string;
  originAuthor: string | null;
  createdAt: string;
  sourceFileUrl: string | null;
  sensitiveCategory: string;
  conflictsWithId: string | null;
  reviewStatus: string;
}, hash: string) {
  const sourceLink = fragment.sourceFileUrl
    ? `<a href="${fragment.sourceFileUrl}" target="_blank" rel="noreferrer">${fragment.sourceFileUrl}</a>`
    : "<span>None</span>";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Continuum Proof</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; }
    .card { border: 1px solid #d1d5db; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
    .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; margin-bottom: 6px; }
    .hash { font-family: monospace; word-break: break-all; background: #0f172a; color: white; padding: 12px; border-radius: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .muted { color: #6b7280; }
  </style>
</head>
<body>
  <h1>Continuum Verifiable Proof</h1>
  <div class="card">
    <div class="eyebrow">Original content</div>
    <div>${fragment.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  </div>
  <div class="card">
    <div class="eyebrow">SHA-256</div>
    <div class="hash">${hash}</div>
  </div>
  <div class="card">
    <div class="eyebrow">Provenance</div>
    <div class="grid">
      <div><div class="muted">Institution</div><div>${fragment.originInstitution}</div></div>
      <div><div class="muted">Logged by</div><div>${fragment.originAuthor ?? "—"}</div></div>
      <div><div class="muted">Fragment type</div><div>${fragment.sourceType}</div></div>
      <div><div class="muted">Logged at</div><div>${new Date(fragment.createdAt).toLocaleString()}</div></div>
      <div><div class="muted">Sensitive</div><div>${fragment.sensitiveCategory}</div></div>
      <div><div class="muted">Review status</div><div>${fragment.reviewStatus}</div></div>
    </div>
  </div>
  <div class="card">
    <div class="eyebrow">Source file</div>
    <div>${sourceLink}</div>
  </div>
  <div class="card">
    <div class="eyebrow">Conflict status</div>
    <div>${fragment.conflictsWithId ? "Flagged for review" : "No current conflict flag"}</div>
  </div>
  <script>window.print();</script>
</body>
</html>`;
}

export default function VerifiableProof() {
  const { selectedPatientId, fragments } = useApp();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hash, setHash] = useState<string>("");

  const active = fragments.find((f) => f.id === activeId) ?? fragments[0];

  useEffect(() => {
    if (active) sha256(active.content).then(setHash);
  }, [active]);

  const printable = useMemo(() => {
    if (!active || !hash) return null;
    return buildPrintableHtml(active, hash);
  }, [active, hash]);

  function exportProof() {
    if (!printable) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    win.document.open();
    win.document.write(printable);
    win.document.close();
  }

  if (!selectedPatientId) {
    return <EmptyState title="No patient selected" body="Pick a patient from the Patients page first." />;
  }
  if (fragments.length === 0) {
    return <EmptyState title="No fragments yet" body="Log one from the Dashboard first." />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      <div>
        <h2 className="font-semibold text-sm mb-3">Fragments</h2>
        <div className="space-y-2">
          {fragments.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveId(f.id)}
              className={`w-full text-left border rounded-lg p-3 text-sm transition ${
                active?.id === f.id ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <p className="line-clamp-2">{f.content}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-1">{f.originInstitution}</p>
            </button>
          ))}
        </div>
      </div>

      {active && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5 gap-3">
            <div>
              <h2 className="font-semibold text-lg">Verifiable Proof</h2>
              <p className="text-xs text-slate-400">Source attribution and integrity check for this fragment</p>
            </div>
            <div className="flex items-center gap-2">
              <GhostButton type="button" onClick={exportProof} className="flex items-center gap-2">
                <Download size={14} /> Export PDF
              </GhostButton>
              <ShieldCheck size={22} className="text-teal-600" />
            </div>
          </div>

          <p className="eyebrow mb-2">Original content</p>
          <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-slate-50 mb-5">
            {active.sourceFileUrl ? (
              <a href={active.sourceFileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-teal-700 text-sm">
                <FileText size={15} /> View attached source document
              </a>
            ) : (
              <p className="text-sm text-slate-700">{active.content}</p>
            )}
          </div>

          <p className="eyebrow mb-2">Integrity hash (SHA-256, computed in-browser)</p>
          <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[11px] break-all mb-5">
            {hash || "computing..."}
          </div>

          <p className="eyebrow mb-2">Provenance</p>
          <div className="grid grid-cols-2 gap-3 text-sm mb-2">
            <div>
              <p className="text-slate-400 text-xs">Institution</p>
              <p>{active.originInstitution}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Logged by</p>
              <p>{active.originAuthor ?? "—"}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Fragment type</p>
              <p>{active.sourceType.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Logged at</p>
              <p>{new Date(active.createdAt).toLocaleString()}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {active.sensitiveCategory !== "NONE" && (
              <Badge tone="amber">{active.sensitiveCategory.replace(/_/g, " ").toLowerCase()}</Badge>
            )}
            {active.conflictsWithId && <Badge tone="red">conflict flagged</Badge>}
            <Badge tone={active.reviewStatus === "RESOLVED" ? "neutral" : active.reviewStatus === "NEEDS_REVIEW" ? "amber" : "teal"}>
              {active.reviewStatus.replace(/_/g, " ").toLowerCase()}
            </Badge>
            <Badge tone={active.syncStatus === "SYNCED" ? "teal" : "neutral"}>{active.syncStatus.toLowerCase()}</Badge>
          </div>
        </Card>
      )}
    </div>
  );
}
