import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import { KnowledgeGraph } from "../components/KnowledgeGraph";
import { Card, Badge, EmptyState } from "../components/ui";
import { friendlySyncMessage } from "../errorMessages";
import type { GraphNode, GraphSyncLogEntry } from "../types";

export default function KnowledgeGraphPage() {
  const { selectedPatientId, fragments, graphVersion } = useApp();
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [log, setLog] = useState<GraphSyncLogEntry[]>([]);

  useEffect(() => {
    if (!selectedPatientId) return;
    api.graphLog(selectedPatientId).then(setLog).catch(() => setLog([]));
  }, [selectedPatientId, graphVersion]);

  if (!selectedPatientId) {
    return <EmptyState title="No patient selected" body="Pick a patient from the Patients page first." />;
  }

  const inspectedFragment = selectedNode?.type === "fragment" ? fragments.find((f) => f.id === selectedNode.id) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_280px] gap-6">
      {/* Growth log */}
      <Card className="p-4 h-fit">
        <h2 className="font-semibold text-sm mb-3">Graph Growth Log</h2>
        {log.length === 0 ? (
          <p className="text-xs text-slate-400">No sync activity yet.</p>
        ) : (
          <div className="space-y-3 max-h-[440px] overflow-y-auto scrollbar-thin">
            {log.map((entry) => (
              <div key={entry.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-[11px] font-mono text-slate-400">
                  {new Date(entry.createdAt).toLocaleTimeString()}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {entry.status === "SYNCED" ? "Synced fragment into graph" : "Sync failed"}
                </p>
                {entry.status === "FAILED" && entry.detail && (
                  <p className="text-[11px] text-red-500 mt-0.5">{friendlySyncMessage(entry.detail)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Graph canvas */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Wand2 size={16} className="text-teal-600" /> Cognee Reasoning Engine
          </h2>
          <Badge tone="teal">reasoning active</Badge>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Derived live from this patient's visits and fragments — click any node for detail.
        </p>
        <div className="flex gap-4 text-[11px] text-slate-400 font-mono mb-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#1b2430] inline-block" /> patient</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#2f6f62] inline-block" /> visit</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#8a8275] inline-block" /> fragment</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#b33a3a] inline-block" /> conflict</span>
        </div>
        <KnowledgeGraph patientId={selectedPatientId} refreshKey={graphVersion} onSelectNode={setSelectedNode} />
      </Card>

      {/* Node inspector */}
      <Card className="p-4 h-fit">
        <h2 className="font-semibold text-sm mb-3">Node Inspector</h2>
        {!selectedNode ? (
          <p className="text-xs text-slate-400">Click a node in the graph to inspect it.</p>
        ) : (
          <div className="space-y-2">
            <Badge tone="ink">{selectedNode.type}</Badge>
            <p className="text-sm font-medium mt-2">{selectedNode.label}</p>
            {selectedNode.reviewStatus && (
              <Badge tone={selectedNode.reviewStatus === "RESOLVED" ? "neutral" : selectedNode.reviewStatus === "NEEDS_REVIEW" ? "amber" : "teal"}>
                {selectedNode.reviewStatus.replace(/_/g, " ").toLowerCase()}
              </Badge>
            )}
            {inspectedFragment && (
              <>
                <p className="text-xs text-slate-500 mt-1">{inspectedFragment.content}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge>{inspectedFragment.originInstitution}</Badge>
                  {inspectedFragment.sensitiveCategory !== "NONE" && (
                    <Badge tone="amber">{inspectedFragment.sensitiveCategory.replace(/_/g, " ").toLowerCase()}</Badge>
                  )}
                  {inspectedFragment.conflictsWithId && <Badge tone="red">conflict</Badge>}
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
