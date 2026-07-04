import { Router } from "express";
import { AuthRole } from "@prisma/client";
import { prisma } from "../db";
import { cogneeRecall } from "../cogneeClient";
import { requireAuth, requireRole } from "../auth";

export const recallRouter = Router();
recallRouter.use(
  requireAuth,
  requireRole(
    AuthRole.CLINICIAN,
    AuthRole.REVIEWER,
    AuthRole.ADMIN,
    AuthRole.NURSE,
  ),
);

import type { AuthenticatedRequest } from "../auth";

// This is the "Hospital B opens a fresh session and asks about a patient it
// was never directly given anything about" endpoint — the core RAG demo moment.
recallRouter.post("/", async (req: AuthenticatedRequest, res) => {
  const { patientId, query } = req.body;
  if (!patientId || !query) {
    return res.status(400).json({ error: "patientId and query are required" });
  }

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
  const visibleFragments: typeof allFragments = [];
  const redactedCategories: string[] = [];

  for (const fragment of allFragments) {
    const category = fragment.sensitiveCategory as string;
    const visibility = ruleMap.get(category as any) ?? "CLINICIAN_ONLY";

    if (visibility === "EMERGENCY_ONLY" && !hasBreakGlass) {
      if (!redactedCategories.includes(category)) {
        redactedCategories.push(category);
      }
    } else {
      visibleFragments.push(fragment);
    }
  }

  let answer: string;
  let recallError: string | null = null;
  let rawResult: any = null;

  try {
    const result = await cogneeRecall({ patientId, query });
    answer = result.answer;
    rawResult = result.raw;
  } catch (err: any) {
    recallError = String(err?.message || err);
    // Fail soft: the demo should never go blank just because the cognee
    // service is unreachable. Fall back to a plain provenance listing.
    answer =
      "Cognee recall is unavailable right now, so here is the raw matching " +
      "history instead (no synthesized reasoning applied).";
  }

  // 5. Intercept and redact any potential LLM data leaks regarding redacted sensitive categories
  let finalAnswer = answer;
  if (redactedCategories.length > 0) {
    const categoryKeywords: Record<string, string[]> = {
      HIV_STATUS: ["hiv", "aids", "viral load", "retroviral", "antiretroviral", "elisa", "cd4"],
      MENTAL_HEALTH: ["mental", "depression", "anxiety", "schizophrenia", "bipolar", "psychiatry", "psychiatric", "therapist", "therapy"],
      SUBSTANCE_USE: ["substance", "drug", "alcohol", "addiction", "rehab", "cocaine", "heroin", "opioid", "overdose"],
      REPRODUCTIVE_HEALTH: ["pregnancy", "abortion", "reproductive", "contraceptive", "miscarriage", "gynecology", "obstetrics"],
      INTIMATE_PARTNER_VIOLENCE: ["violence", "abuse", "domestic", "assault", "partner", "beaten", "threatened"],
    };

    let leakDetected = false;
    for (const cat of redactedCategories) {
      const keywords = categoryKeywords[cat] ?? [];
      const lowerAnswer = finalAnswer.toLowerCase();
      if (keywords.some((kw) => lowerAnswer.includes(kw))) {
        leakDetected = true;
        break;
      }
    }

    if (leakDetected) {
      finalAnswer =
        "Some details from the patient's history are currently redacted based on active consent rules. " +
        "If this is an emergency, please use the Consent Dashboard to log a break-glass override to retrieve the full clinical synthesis.";
    }
  }

  // 6. Filter provenance to only relevant visible fragments
  const rawString = JSON.stringify(rawResult || {}).toLowerCase();
  const answerString = finalAnswer.toLowerCase();
  const queryLower = query.toLowerCase();

  const finalProvenance = visibleFragments.filter((f) => {
    // A. Explicit ID match in raw cognee results
    if (rawString.includes(f.id.toLowerCase())) {
      return true;
    }
    // B. Exact keyword matches of medicine/diagnosis/clinical names from the fragment content in the answer
    const words = f.content.toLowerCase().split(/[^a-zA-Z0-9]+/).filter((w: string) => w.length > 4);
    const hasWordMatch = words.some((w: string) => {
      // Ignore common stop words
      if (["patient", "reports", "daily", "prescribed", "history", "details", "recalled"].includes(w)) return false;
      return answerString.includes(w);
    });
    if (hasWordMatch) {
      return true;
    }
    // C. Fallback: Check direct query match for clinical terms
    const queryWords = queryLower.split(/[^a-zA-Z0-9]+/).filter((w: string) => w.length > 4);
    const hasQueryMatch = words.some((w: string) => {
      if (["patient", "reports", "daily", "prescribed"].includes(w)) return false;
      return queryWords.includes(w);
    });
    if (hasQueryMatch) {
      return true;
    }
    return false;
  });

  // If no fragments matched the filter, fallback to all visible fragments
  const displayProvenance = finalProvenance.length > 0 ? finalProvenance : visibleFragments;

  const sensitiveCategoriesTouched = Array.from(
    new Set(
      displayProvenance
        .filter((f) => f.sensitiveCategory !== "NONE")
        .map((f) => f.sensitiveCategory),
    ),
  );

  const conflicts = displayProvenance.filter((f) => f.conflictsWithId);

  res.json({
    answer: finalAnswer,
    recallError,
    verification:
      "This is decision support synthesized from documented history across " +
      "institutions, not a confirmed diagnosis. Confirm clinically relevant " +
      "findings against the original source before treating them as established.",
    sensitiveCategoriesTouched,
    conflicts: conflicts.map((c) => ({
      fragmentId: c.id,
      conflictsWithId: c.conflictsWithId,
      content: c.content,
      originInstitution: c.originInstitution,
      reviewStatus: c.reviewStatus,
    })),
    provenance: displayProvenance.map((f) => ({
      fragmentId: f.id,
      originInstitution: f.originInstitution,
      originAuthor: f.originAuthor,
      sourceType: f.sourceType,
      sensitiveCategory: f.sensitiveCategory,
      reviewStatus: f.reviewStatus,
      content: f.content,
      sourceFileUrl: f.sourceFileUrl,
      visitDate: f.visit?.visitDate ?? null,
      createdAt: f.createdAt,
    })),
  });
});
