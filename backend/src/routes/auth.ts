import { Router } from "express";
import { AuthRole } from "@prisma/client";
import {
  createSession,
  isAuthRole,
  revokeCurrentSession,
  requireAuth,
  type AuthenticatedRequest,
} from "../auth";
import { prisma } from "../db";

export const authRouter = Router();

function publicUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: AuthRole;
  institutionName: string | null;
  patientId: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    institutionName: user.institutionName ?? "Patient portal",
    patientId: user.patientId,
  };
}

authRouter.get("/institutions", async (req, res) => {
  try {
    const defaultInstitutions = [
      "Hospital A - Lagos General",
      "Hospital B - Eko Community Clinic",
    ];

    const users = await prisma.authUser.findMany({
      where: {
        institutionName: { not: null },
        role: { not: AuthRole.PATIENT },
      },
      select: { institutionName: true },
      distinct: ["institutionName"],
    });

    const visits = await prisma.visit.findMany({
      select: { institutionName: true },
      distinct: ["institutionName"],
    });

    const grants = await prisma.accessGrant.findMany({
      select: { institutionName: true },
      distinct: ["institutionName"],
    });

    const dbInstitutions = [
      ...users.map((u) => u.institutionName as string),
      ...visits.map((v) => v.institutionName),
      ...grants.map((g) => g.institutionName),
    ];

    const allInstitutions = Array.from(
      new Set([...defaultInstitutions, ...dbInstitutions])
    ).filter(Boolean);

    return res.json(allInstitutions);
  } catch (err: any) {
    return res.status(500).json({ error: String(err.message || err) });
  }
});

authRouter.post("/patient/login", async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "email is required" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  let user = await prisma.authUser.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    const displayName = normalizedEmail.split("@")[0] || "Patient";
    const patient = await prisma.patient.create({ data: { displayName } });
    user = await prisma.authUser.create({
      data: {
        email: normalizedEmail,
        displayName,
        role: AuthRole.PATIENT,
        institutionName: "Patient portal",
        patientId: patient.id,
      },
    });
  }

  if (user.role !== AuthRole.PATIENT || !user.patientId) {
    return res
      .status(403)
      .json({ error: "This email is not configured as a patient account" });
  }

  const session = await createSession(user.id);
  return res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: publicUser(user),
  });
});

authRouter.post("/clinician/login", async (req, res) => {
  const { email, displayName, institutionName, role } = req.body ?? {};
  if (typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "email is required" });
  }
  if (typeof displayName !== "string" || !displayName.trim()) {
    return res.status(400).json({ error: "displayName is required" });
  }
  if (typeof institutionName !== "string" || !institutionName.trim()) {
    return res.status(400).json({ error: "institutionName is required" });
  }
  if (!isAuthRole(role) || role === AuthRole.PATIENT) {
    return res
      .status(400)
      .json({ error: "role must be CLINICIAN, REVIEWER, ADMIN, or NURSE" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.authUser.upsert({
    where: { email: normalizedEmail },
    update: {
      displayName: displayName.trim(),
      institutionName: institutionName.trim(),
      role,
      patientId: null,
    },
    create: {
      email: normalizedEmail,
      displayName: displayName.trim(),
      institutionName: institutionName.trim(),
      role,
    },
  });

  const session = await createSession(user.id);
  return res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: publicUser(user),
  });
});

authRouter.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.currentUser)
    return res.status(401).json({ error: "Authentication required" });
  res.json({ user: publicUser(req.currentUser) });
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  await revokeCurrentSession(req);
  res.json({ ok: true });
});
