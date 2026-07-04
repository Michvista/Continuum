/**
 * Admin / dev utility routes — NOT behind auth intentionally.
 * These are internal operations for resetting Cognee state during
 * demos. Mount only on localhost (never expose in production).
 */
import { Router } from "express";
import { prisma } from "../db";
import { cogneeRemember } from "../cogneeClient";

export const resyncRouter = Router();

async function resyncFragments(fragments: Awaited<ReturnType<typeof prisma.fragment.findMany>>) {
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

  return { total: fragments.length, synced, failed, errors };
}

// POST /api/admin/resync-all
// Re-pushes every PENDING/FAILED fragment (whole database) into Cognee.
// Safe to call repeatedly — already-SYNCED fragments are skipped.
resyncRouter.post("/resync-all", async (_req, res) => {
  const fragments = await prisma.fragment.findMany({
    where: { syncStatus: { in: ["PENDING", "FAILED"] } },
  });
  const result = await resyncFragments(fragments);
  res.json(result);
});

// POST /api/admin/resync/:patientId
// Re-pushes only PENDING/FAILED fragments for one patient.
resyncRouter.post("/resync/:patientId", async (req, res) => {
  const fragments = await prisma.fragment.findMany({
    where: {
      patientId: req.params.patientId,
      syncStatus: { in: ["PENDING", "FAILED"] },
    },
  });
  const result = await resyncFragments(fragments);
  res.json(result);
});

// GET /api/admin/sync-status
// Quick overview: how many fragments are in each sync state, per patient.
resyncRouter.get("/sync-status", async (_req, res) => {
  const fragments = await prisma.fragment.findMany({
    select: { patientId: true, syncStatus: true },
  });

  const byPatient: Record<string, Record<string, number>> = {};
  for (const f of fragments) {
    if (!byPatient[f.patientId]) byPatient[f.patientId] = { PENDING: 0, SYNCED: 0, FAILED: 0 };
    byPatient[f.patientId][f.syncStatus] = (byPatient[f.patientId][f.syncStatus] ?? 0) + 1;
  }

  res.json(byPatient);
});
