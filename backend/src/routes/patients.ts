import { Router } from "express";
import {
  AccessGrantLevel,
  AccessGrantStatus,
  AuthRole,
  ConsentVisibility,
  SensitiveCategory,
} from "@prisma/client";
import type { AuthenticatedRequest } from "../auth";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../auth";

export const patientsRouter = Router();

const DEFAULT_CONSENT_NOTE =
  "Continuum is configured for shared-care access. Hidden entries stay out of the patient portal, but clinicians can use audited break-glass access when clinically necessary.";

function isSensitiveCategory(value: unknown): value is SensitiveCategory {
  return (
    typeof value === "string" &&
    Object.values(SensitiveCategory).includes(value as SensitiveCategory)
  );
}

function isConsentVisibility(value: unknown): value is ConsentVisibility {
  return (
    typeof value === "string" &&
    Object.values(ConsentVisibility).includes(value as ConsentVisibility)
  );
}

function isAccessGrantStatus(value: unknown): value is AccessGrantStatus {
  return (
    typeof value === "string" &&
    Object.values(AccessGrantStatus).includes(value as AccessGrantStatus)
  );
}

function isAccessGrantLevel(value: unknown): value is AccessGrantLevel {
  return (
    typeof value === "string" &&
    Object.values(AccessGrantLevel).includes(value as AccessGrantLevel)
  );
}

async function ensureConsentDefaults(patientId: string) {
  let profile = await prisma.consentProfile.findFirst({
    where: { patientId },
  });

  if (!profile) {
    try {
      profile = await prisma.consentProfile.create({
        data: {
          patientId,
          shareWithCareTeam: true,
          allowEmergencyOverride: true,
          patientNote: DEFAULT_CONSENT_NOTE,
        },
      });
    } catch (err: any) {
      const isDuplicatePatientId =
        err?.code === "P2002" &&
        (Array.isArray(err.meta?.target)
          ? err.meta.target.includes("patientId")
          : String(err.meta?.target).includes("patientId"));
      if (!isDuplicatePatientId) throw err;
      profile = await prisma.consentProfile.findFirst({
        where: { patientId },
      });
      if (!profile) throw err;
    }
  }

  const existingRules = await prisma.consentRule.findMany({
    where: { patientId },
  });
  if (existingRules.length === 0) {
    await prisma.consentRule.createMany({
      data: Object.values(SensitiveCategory).map((category) => ({
        patientId,
        category,
        visibility:
          category === SensitiveCategory.NONE
            ? ConsentVisibility.VISIBLE
            : ConsentVisibility.CLINICIAN_ONLY,
      })),
      skipDuplicates: true,
    });
  }

  const existingGrants = await prisma.accessGrant.findMany({
    where: { patientId },
  });
  if (existingGrants.length === 0) {
    await prisma.accessGrant.createMany({
      data: [
        {
          patientId,
          institutionName: "Hospital A - Lagos General",
          status: AccessGrantStatus.ACTIVE,
          level: AccessGrantLevel.STANDARD,
          grantedBy: "Patient portal",
          reason: "Initial shared-care enrollment",
        },
        {
          patientId,
          institutionName: "Hospital B - Eko Community Clinic",
          status: AccessGrantStatus.PENDING,
          level: AccessGrantLevel.STANDARD,
          grantedBy: "Patient portal",
          reason: "Awaiting patient confirmation",
        },
      ],
      skipDuplicates: true,
    });
  }

  return profile;
}

async function consentSnapshot(patientId: string) {
  const [profile, rules, grants, audits] = await Promise.all([
    ensureConsentDefaults(patientId),
    prisma.consentRule.findMany({
      where: { patientId },
      orderBy: { category: "asc" },
    }),
    prisma.accessGrant.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.accessAudit.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return { profile, rules, grants, audits };
}

patientsRouter.get(
  "/",
  requireAuth,
  requireRole(
    AuthRole.CLINICIAN,
    AuthRole.REVIEWER,
    AuthRole.ADMIN,
    AuthRole.NURSE,
  ),
  async (req, res) => {
    const q = req.query.q;
    let whereClause = {};
    if (typeof q === "string" && q.trim()) {
      const searchTerm = q.trim();
      whereClause = {
        OR: [
          { displayName: { contains: searchTerm, mode: "insensitive" } },
          { id: { contains: searchTerm, mode: "insensitive" } },
        ],
      };
    }
    const patients = await prisma.patient.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json(patients);
  },
);

patientsRouter.post(
  "/",
  requireAuth,
  requireRole(
    AuthRole.CLINICIAN,
    AuthRole.REVIEWER,
    AuthRole.ADMIN,
    AuthRole.NURSE,
  ),
  async (req, res) => {
    const { displayName } = req.body;
    if (!displayName) {
      return res.status(400).json({ error: "displayName is required" });
    }

    const patient = await prisma.patient.create({ data: { displayName } });
    await ensureConsentDefaults(patient.id);
    res.status(201).json(patient);
  },
);

patientsRouter.get(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const user = req.currentUser!;
    if (user.role === AuthRole.PATIENT && user.patientId !== req.params.id) {
      return res
        .status(403)
        .json({ error: "Patient access required for this record" });
    }
    if (
      user.role === AuthRole.PATIENT ||
      [
        AuthRole.CLINICIAN,
        AuthRole.REVIEWER,
        AuthRole.ADMIN,
        AuthRole.NURSE,
      ].includes(user.role)
    ) {
      const patient = await prisma.patient.findUnique({
        where: { id: req.params.id },
        include: {
          visits: { orderBy: { visitDate: "asc" } },
          fragments: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      const consent = await consentSnapshot(patient.id);
      return res.json({ ...patient, consent });
    }
    return res.status(403).json({ error: "Forbidden" });
  },
);

patientsRouter.post(
  "/:id/visits",
  requireAuth,
  requireRole(
    AuthRole.CLINICIAN,
    AuthRole.REVIEWER,
    AuthRole.ADMIN,
    AuthRole.NURSE,
  ),
  async (req, res) => {
    const { institutionName, visitDate, notes } = req.body;
    if (!institutionName || !visitDate) {
      return res
        .status(400)
        .json({ error: "institutionName and visitDate are required" });
    }
    const visit = await prisma.visit.create({
      data: {
        patientId: req.params.id,
        institutionName,
        visitDate: new Date(visitDate),
        notes,
      },
    });
    res.status(201).json(visit);
  },
);

patientsRouter.get(
  "/:id/consent",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const user = req.currentUser!;
    if (user.role === AuthRole.PATIENT && user.patientId !== req.params.id) {
      return res
        .status(403)
        .json({ error: "Patient access required for this record" });
    }
    if (
      user.role !== AuthRole.PATIENT &&
      ![
        AuthRole.CLINICIAN,
        AuthRole.REVIEWER,
        AuthRole.ADMIN,
        AuthRole.NURSE,
      ].includes(user.role)
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
    });
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    const consent = await consentSnapshot(patient.id);
    res.json({ patient, ...consent });
  },
);

patientsRouter.post(
  "/:id/consent",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const user = req.currentUser!;
    if (user.role === AuthRole.PATIENT && user.patientId !== req.params.id) {
      return res
        .status(403)
        .json({ error: "Patient access required for this record" });
    }
    if (
      user.role !== AuthRole.PATIENT &&
      ![
        AuthRole.CLINICIAN,
        AuthRole.REVIEWER,
        AuthRole.ADMIN,
        AuthRole.NURSE,
      ].includes(user.role)
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { profile, rules, grants, audit } = req.body ?? {};
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
    });
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    if (profile) {
      await prisma.consentProfile.upsert({
        where: { patientId: patient.id },
        update: {
          shareWithCareTeam: Boolean(profile.shareWithCareTeam),
          allowEmergencyOverride: Boolean(profile.allowEmergencyOverride),
          patientNote:
            typeof profile.patientNote === "string" &&
            profile.patientNote.trim()
              ? profile.patientNote.trim()
              : DEFAULT_CONSENT_NOTE,
        },
        create: {
          patientId: patient.id,
          shareWithCareTeam: Boolean(profile.shareWithCareTeam ?? true),
          allowEmergencyOverride: Boolean(
            profile.allowEmergencyOverride ?? true,
          ),
          patientNote:
            typeof profile.patientNote === "string" &&
            profile.patientNote.trim()
              ? profile.patientNote.trim()
              : DEFAULT_CONSENT_NOTE,
        },
      });
    }

    if (Array.isArray(rules)) {
      for (const rule of rules) {
        if (!isSensitiveCategory(rule.category)) continue;
        const visibility = isConsentVisibility(rule.visibility)
          ? rule.visibility
          : ConsentVisibility.VISIBLE;
        await prisma.consentRule.upsert({
          where: {
            patientId_category: {
              patientId: patient.id,
              category: rule.category,
            },
          },
          update: {
            visibility,
            note:
              typeof rule.note === "string" && rule.note.trim()
                ? rule.note.trim()
                : null,
          },
          create: {
            patientId: patient.id,
            category: rule.category,
            visibility,
            note:
              typeof rule.note === "string" && rule.note.trim()
                ? rule.note.trim()
                : null,
          },
        });
      }
    }

    const isPatient = user.role === AuthRole.PATIENT;

    if (Array.isArray(grants) && !isPatient) {
      for (const grant of grants) {
        if (
          typeof grant?.institutionName !== "string" ||
          !grant.institutionName.trim()
        )
          continue;
        const data = {
          institutionName: grant.institutionName.trim(),
          status: isAccessGrantStatus(grant.status)
            ? grant.status
            : AccessGrantStatus.ACTIVE,
          level: isAccessGrantLevel(grant.level)
            ? grant.level
            : AccessGrantLevel.STANDARD,
          grantedBy:
            typeof grant.grantedBy === "string" && grant.grantedBy.trim()
              ? grant.grantedBy.trim()
              : null,
          reason:
            typeof grant.reason === "string" && grant.reason.trim()
              ? grant.reason.trim()
              : null,
        };
        const existing = await prisma.accessGrant.findFirst({
          where: {
            patientId: patient.id,
            institutionName: data.institutionName,
          },
        });
        if (existing) {
          await prisma.accessGrant.update({ where: { id: existing.id }, data });
        } else {
          await prisma.accessGrant.create({
            data: { patientId: patient.id, ...data },
          });
        }
      }
    }

    if (audit) {
      await prisma.accessAudit.create({
        data: {
          patientId: patient.id,
          institutionName: audit.institutionName || "Patient portal",
          actorName: audit.actorName || "Patient",
          role: audit.role || "PATIENT",
          action: audit.action || "UPDATED_CONSENT",
          reason:
            typeof audit.reason === "string" && audit.reason.trim()
              ? audit.reason.trim()
              : null,
          category: isSensitiveCategory(audit.category) ? audit.category : null,
          emergency: Boolean(audit.emergency),
        },
      });
    }

    const consent = await consentSnapshot(patient.id);
    res.json({ patient, ...consent });
  },
);

patientsRouter.post(
  "/:id/consent/emergency-access",
  requireAuth,
  requireRole(
    AuthRole.CLINICIAN,
    AuthRole.REVIEWER,
    AuthRole.ADMIN,
    AuthRole.NURSE,
  ),
  async (req, res) => {
    const { institutionName, actorName, role, reason, category } =
      req.body ?? {};
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
    });
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    const profile = await prisma.consentProfile.upsert({
      where: { patientId: patient.id },
      update: {},
      create: {
        patientId: patient.id,
        shareWithCareTeam: true,
        allowEmergencyOverride: true,
        patientNote: DEFAULT_CONSENT_NOTE,
      },
    });

    if (!profile.allowEmergencyOverride) {
      return res
        .status(403)
        .json({ error: "Emergency override is disabled for this patient" });
    }

    const audit = await prisma.accessAudit.create({
      data: {
        patientId: patient.id,
        institutionName: institutionName || "Unknown institution",
        actorName: actorName || "Unknown clinician",
        role: role || "CLINICIAN",
        action: "BREAK_GLASS_ACCESS",
        reason: reason || null,
        category: isSensitiveCategory(category) ? category : null,
        emergency: true,
      },
    });

    res.status(201).json({
      ok: true,
      audit,
      message:
        "Emergency access recorded. The care team can still retrieve important hidden details, but the event is now audit logged.",
    });
  },
);

// Clinician requests access to a patient's record (creates a PENDING grant)
patientsRouter.post(
  "/:id/consent/request",
  requireAuth,
  requireRole(
    AuthRole.CLINICIAN,
    AuthRole.REVIEWER,
    AuthRole.ADMIN,
    AuthRole.NURSE,
  ),
  async (req: AuthenticatedRequest, res) => {
    const user = req.currentUser!;
    const { institutionName, level, reason } = req.body ?? {};
    const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    if (typeof institutionName !== "string" || !institutionName.trim()) {
      return res.status(400).json({ error: "institutionName is required" });
    }

    const grant = await prisma.accessGrant.create({
      data: {
        patientId: patient.id,
        institutionName: institutionName.trim(),
        status: AccessGrantStatus.PENDING,
        level: isAccessGrantLevel(level) ? level : AccessGrantLevel.STANDARD,
        grantedBy: user.institutionName || user.displayName || null,
        reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
      },
    });

    await prisma.accessAudit.create({
      data: {
        patientId: patient.id,
        institutionName: institutionName.trim(),
        actorName: user.displayName || "Clinician",
        role: user.role || AuthRole.CLINICIAN,
        action: "REQUEST_CONSENT",
        reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
        emergency: false,
      },
    });

    const consent = await consentSnapshot(patient.id);
    res.status(201).json({ grant, ...consent });
  },
);

// Patient responds to a pending grant (approve -> ACTIVE, deny -> REVOKED)
patientsRouter.patch(
  "/:id/consent/grants/:grantId/respond",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const user = req.currentUser!;
    if (user.role !== AuthRole.PATIENT || user.patientId !== req.params.id) {
      return res.status(403).json({ error: "Patient access required to respond to requests" });
    }

    const { status } = req.body ?? {};
    if (!isAccessGrantStatus(status) || (status !== AccessGrantStatus.ACTIVE && status !== AccessGrantStatus.REVOKED)) {
      return res.status(400).json({ error: "Invalid status. Use 'ACTIVE' or 'REVOKED'" });
    }

    const grant = await prisma.accessGrant.findUnique({ where: { id: req.params.grantId } });
    if (!grant || grant.patientId !== req.params.id) return res.status(404).json({ error: "Grant not found" });

    const updated = await prisma.accessGrant.update({ where: { id: grant.id }, data: { status } });

    await prisma.accessAudit.create({
      data: {
        patientId: req.params.id,
        institutionName: grant.institutionName,
        actorName: user.displayName || "Patient",
        role: "PATIENT",
        action: status === AccessGrantStatus.ACTIVE ? "APPROVE_CONSENT" : "REVOKE_CONSENT",
        reason: typeof req.body.reason === "string" ? req.body.reason : null,
        emergency: false,
      },
    });

    const consent = await consentSnapshot(req.params.id);
    res.json({ updated, ...consent });
  },
);
