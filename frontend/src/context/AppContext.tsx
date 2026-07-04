import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, setAuthToken } from "../api";
import type { Patient, Fragment } from "../types";

export interface Session {
  id: string;
  email: string;
  institutionName: string;
  authorName: string;
  role: "PATIENT" | "CLINICIAN" | "REVIEWER" | "ADMIN" | "NURSE";
  token: string;
  patientId?: string | null;
}

interface AppContextValue {
  session: Session | null;
  login: (s: Session) => void;
  logout: () => void;

  patients: Patient[];
  refreshPatients: () => Promise<void>;
  selectedPatientId: string | null;
  setSelectedPatientId: (id: string | null) => void;
  selectedPatient: Patient | null;

  fragments: Fragment[];
  redactedCount: number;
  hasBreakGlass: boolean;
  refreshFragments: () => Promise<void>;

  graphVersion: number;
  bumpGraph: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const SESSION_KEY = "continuum.session";

function normalizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== "object") return null;
  const session = raw as Partial<Session>;
  if (
    !session.id ||
    !session.email ||
    !session.institutionName ||
    !session.authorName ||
    !session.token ||
    !session.role
  ) {
    return null;
  }
  return {
    id: session.id,
    email: session.email,
    institutionName: session.institutionName,
    authorName: session.authorName,
    role: session.role,
    token: session.token,
    patientId: session.patientId ?? null,
  };
}

// This "session" is a stand-in for institutional auth, not real security —
// it's how the demo represents "I am logged in as Hospital A" vs "Hospital
// B," so opening two browsers (or one normal + one incognito) and logging in
// as two different institutions reproduces the cross-session memory demo.
export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    try {
      return raw ? normalizeSession(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [redactedCount, setRedactedCount] = useState(0);
  const [hasBreakGlass, setHasBreakGlass] = useState(false);
  const [graphVersion, setGraphVersion] = useState(0);

  const login = (s: Session) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setAuthToken(s.token);
    setSession(s);
  };
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setAuthToken(null);
    setSession(null);
  };

  const refreshPatients = useCallback(async () => {
    if (!session || session.role === "PATIENT") {
      return;
    }
    const list = await api.listPatients();
    setPatients(list);
    setSelectedPatientId((current) => current ?? list[0]?.id ?? null);
  }, [session]);

  const refreshFragments = useCallback(async () => {
    if (!selectedPatientId || session?.role === "PATIENT") {
      setFragments([]);
      setRedactedCount(0);
      setHasBreakGlass(false);
      return;
    }
    const result = await api.listFragments(selectedPatientId);
    setFragments(result.fragments);
    setRedactedCount(result.redactedCount);
    setHasBreakGlass(result.hasBreakGlass);
  }, [selectedPatientId, session]);

  useEffect(() => {
    if (session) {
      setAuthToken(session.token);
      if (session.role === "PATIENT") {
        setSelectedPatientId(session.patientId ?? null);
      }
      refreshPatients().catch(() => {});
    }
  }, [session, refreshPatients]);

  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedPatient(null);
      return;
    }
    const found = patients.find((p) => p.id === selectedPatientId);
    if (found) {
      setSelectedPatient(found);
    } else {
      api.getPatient(selectedPatientId)
        .then((detail) => {
          setSelectedPatient({
            id: detail.id,
            displayName: detail.displayName,
            consentedAt: detail.consentedAt,
            createdAt: detail.createdAt,
          });
        })
        .catch(() => {
          setSelectedPatient(null);
        });
    }
  }, [selectedPatientId, patients]);

  useEffect(() => {
    refreshFragments().catch(() => {});
  }, [selectedPatientId, refreshFragments]);

  const bumpGraph = () => setGraphVersion((v) => v + 1);

  return (
    <AppContext.Provider
      value={{
        session,
        login,
        logout,
        patients,
        refreshPatients,
        selectedPatientId,
        setSelectedPatientId,
        selectedPatient,
        fragments,
        redactedCount,
        hasBreakGlass,
        refreshFragments,
        graphVersion,
        bumpGraph,
      }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
