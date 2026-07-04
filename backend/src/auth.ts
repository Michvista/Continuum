import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { AuthRole, type AuthUser } from "@prisma/client";
import { prisma } from "./db";

const SESSION_TTL_DAYS = 30;

export interface AuthenticatedRequest extends Request {
  currentUser?: AuthUser;
}

export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === "string" && Object.values(AuthRole).includes(value as AuthRole);
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId: string) {
  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function findUserFromRequest(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  return session.user;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = await findUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    req.currentUser = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Authentication required" });
  }
}

export function requireRole(...allowed: AuthRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.currentUser;
    if (!user) return res.status(401).json({ error: "Authentication required" });
    if (!allowed.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden for this role" });
    }
    return next();
  };
}

export function requirePatientOwnRecord(paramName = "id") {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.currentUser;
    if (!user) return res.status(401).json({ error: "Authentication required" });
    if (user.role !== AuthRole.PATIENT) {
      return res.status(403).json({ error: "Patient access required" });
    }
    if (!user.patientId || user.patientId !== req.params[paramName]) {
      return res.status(403).json({ error: "You can only access your own patient record" });
    }
    return next();
  };
}

export async function revokeCurrentSession(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return;

  await prisma.authSession.updateMany({
    where: { tokenHash: hashToken(token) },
    data: { revokedAt: new Date() },
  });
}
