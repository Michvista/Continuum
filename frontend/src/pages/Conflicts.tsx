import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, UserCheck, FileWarning, CheckCircle2, Clock, HelpCircle } from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import { Card, Badge, EmptyState } from "../components/ui";
import type { ReviewStatus } from "../types";

const REVIEW_STATES: ReviewStatus[] = ["NEEDS_REVIEW", "UNDER_REVIEW", "RESOLVED"];

function getStatusDetails(status: ReviewStatus) {
  switch (status) {
    case "RESOLVED":
      return { tone: "teal" as const, label: "resolved" };
    case "UNDER_REVIEW":
      return { tone: "blue" as const, label: "under review" };
    case "NEEDS_REVIEW":
    default:
      return { tone: "red" as const, label: "needs review" };
  }
}

export default function Conflicts() {
  const { session, selectedPatientId, fragments, refreshFragments, bumpGraph } = useApp();
  
  const [activeTab, setActiveTab] = useState<"active" | "resolved">("active");

  const activeConflicts = useMemo(
    () => fragments.filter((f) => f.conflictsWithId && f.reviewStatus !== "RESOLVED"),
    [fragments]
  );

  const resolvedConflicts = useMemo(
    () => fragments.filter((f) => f.conflictsWithId && f.reviewStatus === "RESOLVED"),
    [fragments]
  );

  const displayedConflicts = activeTab === "active" ? activeConflicts : resolvedConflicts;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");

  // Set first conflict as active whenever displayed list changes
  useEffect(() => {
    if (displayedConflicts.length > 0) {
      if (!activeId || !displayedConflicts.some((c) => c.id === activeId)) {
        setActiveId(displayedConflicts[0].id);
      }
    } else {
      setActiveId(null);
    }
  }, [displayedConflicts, activeId]);

  if (!selectedPatientId) {
    return <EmptyState title="No patient selected" body="Pick a patient from the Patients page first." />;
  }

  const active = displayedConflicts.find((c) => c.id === activeId);
  const counterpart = active ? fragments.find((f) => f.id === active.conflictsWithId) : null;

  async function handleSetStatus(status: ReviewStatus, noteText?: string) {
    if (!active) return;
    setSaving(true);
    try {
      await api.updateFragmentReview(active.id, status, noteText);
      await refreshFragments();
      bumpGraph();
      setShowResolveForm(false);
      setResolutionNote("");
    } finally {
      setSaving(false);
    }
  }

  const handleTabChange = (tab: "active" | "resolved") => {
    setActiveTab(tab);
    setShowResolveForm(false);
    setResolutionNote("");
  };

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-amber-800">
          <AlertTriangle size={16} />
          <strong>Verification required -</strong>
          <span>
            conflicting fragments need a human triage step before anyone treats the merged history as settled truth.
          </span>
        </div>
        {session?.role === "REVIEWER" || session?.role === "ADMIN" ? (
          <Badge tone="amber">reviewer access</Badge>
        ) : (
          <Badge tone="neutral">clinical view</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <div>
          {/* Tab selector */}
          <div className="flex border-b border-slate-200 mb-4 bg-slate-100/50 p-1 rounded-lg">
            <button
              onClick={() => handleTabChange("active")}
              className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition ${
                activeTab === "active"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Active ({activeConflicts.length})
            </button>
            <button
              onClick={() => handleTabChange("resolved")}
              className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition ${
                activeTab === "resolved"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Resolved ({resolvedConflicts.length})
            </button>
          </div>

          {displayedConflicts.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg bg-white">
              No {activeTab} conflicts.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {displayedConflicts.map((c) => {
                const statusInfo = getStatusDetails(c.reviewStatus);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveId(c.id);
                      setShowResolveForm(false);
                      setResolutionNote("");
                    }}
                    className={`w-full text-left border rounded-lg p-3 transition ${
                      c.id === activeId ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium line-clamp-2">{c.content}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {active && counterpart ? (
          <Card className="p-5 h-fit">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <FileWarning size={16} className="text-amber-600" />
                  Conflict Resolution
                </h2>
                <p className="text-xs text-slate-400">Comparing source fragments flagged as contradictory.</p>
              </div>
              <Badge tone={getStatusDetails(active.reviewStatus).tone}>
                {getStatusDetails(active.reviewStatus).label}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="eyebrow mb-1">Source A - {active.originInstitution}</p>
                <p className="text-sm text-slate-700">{active.content}</p>
                {active.originAuthor && <p className="text-xs text-slate-400 mt-2">Logged by {active.originAuthor}</p>}
              </div>
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="eyebrow mb-1">Source B - {counterpart.originInstitution}</p>
                <p className="text-sm text-slate-700">{counterpart.content}</p>
                {counterpart.originAuthor && (
                  <p className="text-xs text-slate-400 mt-2">Logged by {counterpart.originAuthor}</p>
                )}
              </div>
            </div>

            {/* Resolution note display if resolved */}
            {active.reviewStatus === "RESOLVED" && (
              <div className="mt-6 border border-teal-200 bg-teal-50/50 rounded-xl p-4">
                <h3 className="font-semibold text-teal-800 text-sm flex items-center gap-1.5 mb-2">
                  <CheckCircle2 size={16} className="text-teal-600" /> Resolution Action &amp; Explanation
                </h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {active.resolutionNote || "Conflict marked resolved without note."}
                </p>
                <div className="mt-4 pt-3 border-t border-teal-200/55 flex justify-end">
                  <button
                    disabled={saving}
                    onClick={() => handleSetStatus("UNDER_REVIEW")}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline"
                  >
                    Reopen conflict (Mark under review)
                  </button>
                </div>
              </div>
            )}

            {/* Actions list if not resolved */}
            {active.reviewStatus !== "RESOLVED" && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => handleSetStatus("NEEDS_REVIEW")}
                    disabled={saving || active.reviewStatus === "NEEDS_REVIEW"}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`}
                  >
                    <HelpCircle size={14} />
                    Mark needs review
                  </button>
                  <button
                    onClick={() => handleSetStatus("UNDER_REVIEW")}
                    disabled={saving || active.reviewStatus === "UNDER_REVIEW"}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
                  >
                    <Clock size={14} />
                    Mark under review
                  </button>
                  <button
                    onClick={() => setShowResolveForm(true)}
                    disabled={saving || showResolveForm}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100`}
                  >
                    <CheckCircle2 size={14} />
                    Mark resolved
                  </button>
                </div>

                {showResolveForm && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (resolutionNote.trim()) {
                        handleSetStatus("RESOLVED", resolutionNote);
                      }
                    }}
                    className="border border-slate-200 bg-slate-50 rounded-xl p-4 space-y-3 animate-fade-in"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Resolution explanation / clinical correct path <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        placeholder="Explain how this conflict was resolved (e.g. validated dosage with the prescribing clinician or corrected patient's record)..."
                        rows={3}
                        className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:border-teal-500 text-slate-700"
                        required
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowResolveForm(false);
                          setResolutionNote("");
                        }}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving || !resolutionNote.trim()}
                        className="bg-teal-600 text-white text-xs font-medium rounded-lg px-4 py-1.5 hover:bg-teal-700 disabled:opacity-50 transition"
                      >
                        Confirm &amp; Resolve
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono mt-4 pt-4 border-t border-slate-100 flex-wrap">
              <span>Detected: {new Date(active.createdAt).toLocaleString()}</span>
              <span>Detection method: keyword/dosage heuristic - not clinically validated</span>
            </div>
          </Card>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
            Select a conflict from the list to resolve.
          </div>
        )}
      </div>
    </div>
  );
}

