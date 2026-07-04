import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, User2, AlertTriangle, Filter, Search as SearchIcon } from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import { Card, Badge, EmptyState, PrimaryButton } from "../components/ui";
import { friendlySyncMessage } from "../errorMessages";
import type { RecallResponse, ReviewStatus, SensitiveCategory, SourceType } from "../types";

const SOURCE_LABEL: Record<string, string> = {
  CLINICAL_NOTE: "Diagnosis / Note",
  LAB_RESULT: "Lab Results",
  PRESCRIPTION: "Medication",
  VOICE_NOTE: "Voice Note",
  SCANNED_DOCUMENT: "Scanned Document",
  TEXT_MESSAGE: "Text Message",
};

const SOURCE_OPTIONS: (SourceType | "ALL")[] = ["ALL", "CLINICAL_NOTE", "LAB_RESULT", "PRESCRIPTION", "VOICE_NOTE", "SCANNED_DOCUMENT", "TEXT_MESSAGE"];
const SENSITIVE_OPTIONS: (SensitiveCategory | "ALL")[] = ["ALL", "NONE", "MENTAL_HEALTH", "REPRODUCTIVE_HEALTH", "SUBSTANCE_USE", "HIV_STATUS", "INTIMATE_PARTNER_VIOLENCE"];
const REVIEW_OPTIONS: (ReviewStatus | "ALL")[] = ["ALL", "CLEAR", "NEEDS_REVIEW", "UNDER_REVIEW", "RESOLVED"];

function displayReviewStatus(status: ReviewStatus) {
  return status.replace(/_/g, " ").toLowerCase();
}

export default function Timeline() {
  const { selectedPatientId, fragments } = useApp();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("ask") ?? "");
  const [recallResult, setRecallResult] = useState<RecallResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<(typeof SOURCE_OPTIONS)[number]>("ALL");
  const [sensitiveFilter, setSensitiveFilter] = useState<(typeof SENSITIVE_OPTIONS)[number]>("ALL");
  const [reviewFilter, setReviewFilter] = useState<(typeof REVIEW_OPTIONS)[number]>("ALL");
  const [institutionFilter, setInstitutionFilter] = useState("ALL");

  useEffect(() => {
    const ask = params.get("ask");
    if (ask && selectedPatientId) {
      runRecall(ask);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId]);

  async function runRecall(q: string) {
    if (!selectedPatientId || !q.trim()) return;
    setAsking(true);
    try {
      const res = await api.recall(selectedPatientId, q);
      setRecallResult(res);
    } finally {
      setAsking(false);
    }
  }

  if (!selectedPatientId) {
    return <EmptyState title="No patient selected" body="Pick a patient from the Patients page first." />;
  }

  const allRows = useMemo(() => {
    const rows =
      recallResult?.provenance?.map((entry) => ({
        fragmentId: entry.fragmentId,
        originInstitution: entry.originInstitution,
        originAuthor: entry.originAuthor,
        sourceType: entry.sourceType,
        sensitiveCategory: entry.sensitiveCategory,
        reviewStatus: entry.reviewStatus,
        content: entry.content,
        sourceFileUrl: entry.sourceFileUrl,
        visitDate: entry.visitDate,
        createdAt: entry.createdAt,
      })) ??
      fragments.map((entry) => ({
        fragmentId: entry.id,
        originInstitution: entry.originInstitution,
        originAuthor: entry.originAuthor,
        sourceType: entry.sourceType,
        sensitiveCategory: entry.sensitiveCategory,
        reviewStatus: entry.reviewStatus,
        content: entry.content,
        sourceFileUrl: entry.sourceFileUrl,
        visitDate: null,
        createdAt: entry.createdAt,
      }));

    return rows;
  }, [recallResult, fragments]);

  const visibleRows = allRows.filter((row) => {
    const haystack = `${row.content} ${row.originInstitution} ${row.originAuthor ?? ""}`.toLowerCase();
    const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
    const matchesInstitution = institutionFilter === "ALL" || row.originInstitution === institutionFilter;
    const matchesSource = sourceFilter === "ALL" || row.sourceType === sourceFilter;
    const matchesSensitive = sensitiveFilter === "ALL" || row.sensitiveCategory === sensitiveFilter;
    const matchesReview = reviewFilter === "ALL" || row.reviewStatus === reviewFilter;
    return matchesSearch && matchesInstitution && matchesSource && matchesSensitive && matchesReview;
  });

  const institutions = useMemo(
    () => Array.from(new Set(allRows.map((row) => row.originInstitution))).sort(),
    [allRows]
  );

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runRecall(query);
          }}
          className="flex gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask Cognee about this patient - e.g. any allergy concerns before prescribing amoxicillin?"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <PrimaryButton type="submit" disabled={asking || !query.trim()}>
            {asking ? "Recalling..." : "Recall"}
          </PrimaryButton>
        </form>

        {recallResult && (
          <div className="mt-4 space-y-3">
            <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-3 text-sm">
              {recallResult.answer}
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border-l-2 border-amber-500 px-3 py-2">
              {recallResult.verification}
            </p>
            {recallResult.recallError && (
              <p className="text-xs text-slate-500 bg-slate-50 border-l-2 border-slate-300 px-3 py-2">
                Recall fallback used: {friendlySyncMessage(recallResult.recallError)}
              </p>
            )}
            {recallResult.conflicts.length > 0 && (
              <p className="text-xs text-red-700 bg-red-50 border-l-2 border-red-500 px-3 py-2 flex items-center gap-1.5">
                <AlertTriangle size={13} /> {recallResult.conflicts.length} conflicting fragment(s) - see Conflicts page.
              </p>
            )}

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Provenance used</p>
              <div className="flex flex-wrap gap-2">
                {recallResult.provenance.map((entry) => (
                  <span
                    key={entry.fragmentId}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600"
                  >
                    <span className="font-medium">{entry.originInstitution}</span>
                    <span className="text-slate-300">/</span>
                    <span>{SOURCE_LABEL[entry.sourceType] ?? entry.sourceType}</span>
                    <span className="text-slate-300">/</span>
                    <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                    {entry.reviewStatus !== "CLEAR" && (
                      <>
                        <span className="text-slate-300">/</span>
                        <span className="text-amber-700">{displayReviewStatus(entry.reviewStatus)}</span>
                      </>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-base">History Filters</h2>
            <p className="text-xs text-slate-400 font-mono">
              {visibleRows.length} of {allRows.length} fragments visible
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Filter size={14} />
            provenance and review
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <label className="text-xs">
            <span className="block text-slate-400 mb-1">Search</span>
            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
              <SearchIcon size={14} className="text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm outline-none bg-transparent"
                placeholder="Filter content"
              />
            </div>
          </label>
          <label className="text-xs">
            <span className="block text-slate-400 mb-1">Institution</span>
            <select
              value={institutionFilter}
              onChange={(e) => setInstitutionFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="ALL">All institutions</option>
              {institutions.map((institution) => (
                <option key={institution} value={institution}>
                  {institution}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-slate-400 mb-1">Type</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All source types" : SOURCE_LABEL[option] ?? option}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-slate-400 mb-1">Sensitive</span>
            <select
              value={sensitiveFilter}
              onChange={(e) => setSensitiveFilter(e.target.value as typeof sensitiveFilter)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {SENSITIVE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All sensitivities" : option.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-slate-400 mb-1">Review</span>
            <select
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value as typeof reviewFilter)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {REVIEW_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All review states" : displayReviewStatus(option)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <div>
        <h2 className="font-semibold text-base mb-1">Reconciled Clinical History</h2>
        <p className="text-xs text-slate-400 font-mono mb-4">
          {allRows.length} fragment{allRows.length === 1 ? "" : "s"} across all participating institutions
        </p>

        {visibleRows.length === 0 ? (
          <EmptyState title="No matching history" body="Try clearing the filters or logging a new fragment." />
        ) : (
          <div className="relative pl-5 border-l border-slate-200 space-y-4">
            {visibleRows.map((row) => (
              <div key={row.fragmentId} className="relative">
                <span
                  className={`absolute -left-[25px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                    row.reviewStatus === "RESOLVED"
                      ? "bg-slate-400"
                      : row.reviewStatus === "NEEDS_REVIEW"
                        ? "bg-amber-500"
                        : row.reviewStatus === "UNDER_REVIEW"
                          ? "bg-blue-500"
                          : "bg-teal-600"
                  }`}
                />
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={row.reviewStatus === "RESOLVED" ? "neutral" : row.reviewStatus === "NEEDS_REVIEW" ? "amber" : "teal"}>
                        {displayReviewStatus(row.reviewStatus)}
                      </Badge>
                      <Badge tone={row.sensitiveCategory !== "NONE" ? "amber" : "neutral"}>
                        {SOURCE_LABEL[row.sourceType] ?? row.sourceType}
                      </Badge>
                    </div>
                    <Badge tone="neutral">{row.originInstitution}</Badge>
                  </div>
                  <p className="text-sm text-slate-700 mt-2">{row.content}</p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono mt-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} /> {new Date(row.createdAt).toLocaleDateString()}
                    </span>
                    {row.originAuthor && (
                      <span className="flex items-center gap-1">
                        <User2 size={11} /> {row.originAuthor}
                      </span>
                    )}
                    {row.visitDate && (
                      <span className="flex items-center gap-1">
                        <Calendar size={11} /> visit {new Date(row.visitDate).toLocaleDateString()}
                      </span>
                    )}
                    {row.sensitiveCategory !== "NONE" && (
                      <Badge tone="amber">{row.sensitiveCategory.replace(/_/g, " ").toLowerCase()}</Badge>
                    )}
                    <Badge tone={row.reviewStatus === "RESOLVED" ? "neutral" : row.reviewStatus === "NEEDS_REVIEW" ? "amber" : "teal"}>
                      {displayReviewStatus(row.reviewStatus)}
                    </Badge>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
