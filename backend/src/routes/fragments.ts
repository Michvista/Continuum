import { Router } from "express";
import { AuthRole, ReviewStatus } from "@prisma/client";
import { prisma } from "../db";
import { cogneeRemember } from "../cogneeClient";
import { detectPotentialConflict } from "../conflictDetection";
import { summarizeExternalError } from "../errorFormatting";
import { requireAuth, requireRole } from "../auth";

export const fragmentsRouter = Router();
fragmentsRouter.use(
  requireAuth,
  requireRole(
    AuthRole.CLINICIAN,
    AuthRole.REVIEWER,
    AuthRole.ADMIN,
    AuthRole.NURSE,
  ),
);

import type { AuthenticatedRequest } from "../auth";

// All fragments for a patient — consent-filtered by the requesting institution.
// EMERGENCY_ONLY fragments are withheld unless the institution has a recorded
// BREAK_GLASS_ACCESS audit entry for this patient.
fragmentsRouter.get("/patient/:patientId", async (req: AuthenticatedRequest, res) => {
  const { patientId } = req.params;
  const institutionName = req.currentUser?.institutionName ?? null;

  // 1. Fetch all raw fragments
  const allFragments = await prisma.fragment.findMany({
    where: { patientId },
    include: { visit: true },
    orderBy: { createdAt: "asc" },
  });

  // 2. Load the patient's consent rules
  const rules = await prisma.consentRule.findMany({ where: { patientId } });
  const ruleMap = new Map(rules.map((r) => [r.category, r.visibility]));

  // 3. Determine if the requesting institution has break-glass access
  //    (i.e. at least one BREAK_GLASS_ACCESS audit entry exists for them)
  let hasBreakGlass = false;
  if (institutionName) {
    const bgAudit = await prisma.accessAudit.findFirst({
      where: {
        patientId,
        institutionName,
        action: "BREAK_GLASS_ACCESS",
      },
    });
    hasBreakGlass = bgAudit !== null;
  }

  // 4. Filter fragments by consent visibility
  //    - VISIBLE / CLINICIAN_ONLY → always returned to a clinician
  //    - EMERGENCY_ONLY           → only returned if the institution has break-glass
  const visible: typeof allFragments = [];
  let redactedCount = 0;

  for (const fragment of allFragments) {
    const category = fragment.sensitiveCategory as string;
    // Default to CLINICIAN_ONLY if no rule exists for this category
    const visibility = ruleMap.get(category as any) ?? "CLINICIAN_ONLY";

    if (visibility === "EMERGENCY_ONLY" && !hasBreakGlass) {
      redactedCount++;
    } else {
      visible.push(fragment);
    }
  }

  res.json({ fragments: visible, redactedCount, hasBreakGlass });
});

fragmentsRouter.post("/", async (req, res) => {
  const {
    patientId,
    visitId,
    originInstitution,
    originAuthor,
    sourceType,
    content,
    sourceFileUrl,
    sensitiveCategory,
  } = req.body;

  if (!patientId || !originInstitution || !sourceType || !content) {
    return res.status(400).json({
      error:
        "patientId, originInstitution, sourceType, and content are required",
    });
  }

  // Lightweight conflict heuristic (e.g. same medication, different dosage
  // logged by two institutions). This is intentionally simple — the point of
  // the demo is to SURFACE disagreement rather than silently merge it, not to
  // be a clinically validated conflict-detection engine.
  const existing = await prisma.fragment.findMany({ where: { patientId } });
  const conflictsWithId = detectPotentialConflict(content, existing);

  const fragment = await prisma.fragment.create({
    data: {
      patientId,
      visitId: visitId || null,
      originInstitution,
      originAuthor,
      sourceType,
      content,
      sourceFileUrl,
      sensitiveCategory: sensitiveCategory || "NONE",
      conflictsWithId,
      reviewStatus: conflictsWithId
        ? ReviewStatus.NEEDS_REVIEW
        : ReviewStatus.CLEAR,
      syncStatus: "PENDING",
    },
  });

  // Push into Cognee's graph synchronously so the UI can show "synced" the
  // moment this request resolves — that's the live two-session demo moment.
  try {
    await cogneeRemember({
      patientId,
      fragmentId: fragment.id,
      content,
      metadata: {
        originInstitution,
        originAuthor: originAuthor || null,
        sourceType,
        sensitiveCategory: sensitiveCategory || "NONE",
        visitId: visitId || null,
        fragmentId: fragment.id,
      },
    });

    const synced = await prisma.fragment.update({
      where: { id: fragment.id },
      data: { syncStatus: "SYNCED" },
    });
    await prisma.graphSyncLog.create({
      data: { fragmentId: fragment.id, patientId, status: "SYNCED" },
    });
    return res.status(201).json(synced);
  } catch (err: any) {
    const friendly = summarizeExternalError(err?.message || err);
    const failed = await prisma.fragment.update({
      where: { id: fragment.id },
      data: { syncStatus: "FAILED", syncError: friendly },
    });
    await prisma.graphSyncLog.create({
      data: {
        fragmentId: fragment.id,
        patientId,
        status: "FAILED",
        detail: friendly,
      },
    });
    // Still return 201 — the fragment is safely recorded in Postgres even if
    // the cognee-service is down. The demo can retry sync later.
    return res.status(201).json(failed);
  }
});

fragmentsRouter.patch("/:id/review", async (req, res) => {
  const { reviewStatus, resolutionNote } = req.body;
  if (!Object.values(ReviewStatus).includes(reviewStatus)) {
    return res.status(400).json({
      error:
        "reviewStatus must be CLEAR, NEEDS_REVIEW, UNDER_REVIEW, or RESOLVED",
    });
  }

  // Resolution note is required when marking as RESOLVED
  if (reviewStatus === ReviewStatus.RESOLVED) {
    if (typeof resolutionNote !== "string" || !resolutionNote.trim()) {
      return res.status(400).json({
        error: "resolutionNote is required when marking a conflict as RESOLVED",
      });
    }
  }

  const fragment = await prisma.fragment.update({
    where: { id: req.params.id },
    data: {
      reviewStatus,
      resolutionNote:
        reviewStatus === ReviewStatus.RESOLVED && typeof resolutionNote === "string"
          ? resolutionNote.trim()
          : reviewStatus !== ReviewStatus.RESOLVED
          ? null  // clear note if moving back out of RESOLVED
          : undefined,
    },
  });

  res.json(fragment);
});
