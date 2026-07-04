import { Router } from "express";
import { AuthRole } from "@prisma/client";
import { prisma } from "../db";
import { cogneeRemember } from "../cogneeClient";
import { requireAuth, requireRole } from "../auth";

export const graphRouter = Router();
graphRouter.use(
  requireAuth,
  requireRole(
    AuthRole.CLINICIAN,
    AuthRole.REVIEWER,
    AuthRole.ADMIN,
    AuthRole.NURSE,
  ),
);

export interface GraphNode {
  id: string;
  label: string;
  type: "patient" | "visit" | "fragment";
  sourceType?: string;
  institution?: string;
  sensitive?: boolean;
  synced?: boolean;
  reviewStatus?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "had_visit" | "produced_fragment" | "conflicts_with";
}

// Derives a nodes/edges graph straight from Postgres (Patient -> Visit ->
// Fragment, plus conflict edges). This is what powers the live force-graph
// in the frontend. It's deliberately NOT a scrape of Cognee's internal graph
// — that keeps the demo's core "wow" visual reliable regardless of what the
// underlying cognee version exposes. Cognee's own graph reasoning still runs
// the actual recall() — see /api/recall and cognee-service/main.py.
graphRouter.get("/:patientId", async (req, res) => {
  const patient = await prisma.patient.findUnique({
    where: { id: req.params.patientId },
    include: {
      visits: true,
      fragments: { include: { visit: true } },
    },
  });
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const nodes: GraphNode[] = [
    { id: patient.id, label: patient.displayName, type: "patient" },
  ];
  const edges: GraphEdge[] = [];

  for (const visit of patient.visits) {
    nodes.push({
      id: visit.id,
      label: `${visit.institutionName} — ${visit.visitDate.toISOString().slice(0, 10)}`,
      type: "visit",
      institution: visit.institutionName,
    });
    edges.push({ source: patient.id, target: visit.id, kind: "had_visit" });
  }

  for (const fragment of patient.fragments) {
    nodes.push({
      id: fragment.id,
      label: `${fragment.sourceType.replace("_", " ")} (${fragment.originInstitution})`,
      type: "fragment",
      sourceType: fragment.sourceType,
      institution: fragment.originInstitution,
      sensitive: fragment.sensitiveCategory !== "NONE",
      synced: fragment.syncStatus === "SYNCED",
      reviewStatus: fragment.reviewStatus,
    });
    const parent = fragment.visitId ?? patient.id;
    edges.push({
      source: parent,
      target: fragment.id,
      kind: "produced_fragment",
    });
    if (fragment.conflictsWithId) {
      edges.push({
        source: fragment.id,
        target: fragment.conflictsWithId,
        kind: "conflicts_with",
      });
    }
  }

  res.json({ nodes, edges });
});

// Powers the "Graph Growth Log" panel — a plain, honest activity feed of
// when each fragment was pushed into Cognee (and whether it succeeded),
// sourced straight from our own GraphSyncLog table.
graphRouter.get("/:patientId/log", async (req, res) => {
  const entries = await prisma.graphSyncLog.findMany({
    where: { patientId: req.params.patientId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(entries);
});

// Replay all PENDING/FAILED fragments for a single patient into Cognee.
// Safe to call multiple times — already-SYNCED fragments are skipped.
// This is the primary fix for data that was seeded directly into Postgres
// without going through the live POST /fragments pipeline.
graphRouter.post("/resync-all", async (_req, res) => {
  const fragments = await prisma.fragment.findMany({
    where: { syncStatus: { in: ["PENDING", "FAILED"] } },
  });

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const f of fragments) {
    try {
      await cogneeRemember({
        patientId: f.patientId,
        fragmentId: f.id,
        content: f.content,
        metadata: {
          originInstitution: f.originInstitution,
          originAuthor: f.originAuthor ?? null,
          sourceType: f.sourceType,
          sensitiveCategory: f.sensitiveCategory,
          visitId: f.visitId ?? null,
          fragmentId: f.id,
        },
      });
      await prisma.fragment.update({
        where: { id: f.id },
        data: { syncStatus: "SYNCED", syncError: null },
      });
      await prisma.graphSyncLog.create({
        data: { fragmentId: f.id, patientId: f.patientId, status: "SYNCED" },
      });
      synced++;
    } catch (err: any) {
      const msg = String(err?.message || err);
      await prisma.fragment.update({
        where: { id: f.id },
        data: { syncStatus: "FAILED", syncError: msg.slice(0, 500) },
      });
      await prisma.graphSyncLog.create({
        data: {
          fragmentId: f.id,
          patientId: f.patientId,
          status: "FAILED",
          detail: msg.slice(0, 500),
        },
      });
      errors.push(`${f.id}: ${msg}`);
      failed++;
    }
  }

  res.json({ total: fragments.length, synced, failed, errors });
});

graphRouter.post("/:patientId/resync", async (req, res) => {
  const { patientId } = req.params;

  const fragments = await prisma.fragment.findMany({
    where: { patientId, syncStatus: { in: ["PENDING", "FAILED"] } },
  });

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const f of fragments) {
    try {
      await cogneeRemember({
        patientId: f.patientId,
        fragmentId: f.id,
        content: f.content,
        metadata: {
          originInstitution: f.originInstitution,
          originAuthor: f.originAuthor ?? null,
          sourceType: f.sourceType,
          sensitiveCategory: f.sensitiveCategory,
          visitId: f.visitId ?? null,
          fragmentId: f.id,
        },
      });
      await prisma.fragment.update({
        where: { id: f.id },
        data: { syncStatus: "SYNCED", syncError: null },
      });
      await prisma.graphSyncLog.create({
        data: { fragmentId: f.id, patientId: f.patientId, status: "SYNCED" },
      });
      synced++;
    } catch (err: any) {
      const msg = String(err?.message || err);
      await prisma.fragment.update({
        where: { id: f.id },
        data: { syncStatus: "FAILED", syncError: msg.slice(0, 500) },
      });
      await prisma.graphSyncLog.create({
        data: {
          fragmentId: f.id,
          patientId: f.patientId,
          status: "FAILED",
          detail: msg.slice(0, 500),
        },
      });
      errors.push(`${f.id}: ${msg}`);
      failed++;
    }
  }

  res.json({ total: fragments.length, synced, failed, errors });
});
