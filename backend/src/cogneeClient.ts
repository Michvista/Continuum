import fetch from "node-fetch";
import { summarizeExternalError } from "./errorFormatting";

const LOCAL_COGNEE_SERVICE_URL =
  process.env.COGNEE_WRAPPER_URL ||
  process.env.COGNEE_SERVICE_URL ||
  "http://localhost:8088";

export interface RememberPayload {
  patientId: string;
  fragmentId: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface RecallPayload {
  patientId: string;
  query: string;
}

export interface RecallResult {
  answer: string;
  raw?: unknown;
}

// Thin client for the Python cognee-service. Kept deliberately small: the
// Express API never talks to the `cognee` package directly (it's Python-only),
// it always goes through this HTTP boundary.
export async function cogneeRemember(payload: RememberPayload): Promise<void> {
  try {
    const res = await fetch(`${LOCAL_COGNEE_SERVICE_URL}/remember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("cognee-service /remember failed", {
        status: res.status,
        body: text,
      });
      throw new Error(summarizeExternalError(`HTTP ${res.status}: ${text}`));
    }
  } catch (err: any) {
    console.error("cognee-service /remember request error", err);
    throw new Error(summarizeExternalError(err?.message || err));
  }
}

export async function cogneeRecall(payload: RecallPayload): Promise<RecallResult> {
  try {
    const res = await fetch(`${LOCAL_COGNEE_SERVICE_URL}/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("cognee-service /recall failed", {
        status: res.status,
        body: text,
      });
      throw new Error(summarizeExternalError(`HTTP ${res.status}: ${text}`));
    }
    return (await res.json()) as RecallResult;
  } catch (err: any) {
    console.error("cognee-service /recall request error", err);
    throw new Error(summarizeExternalError(err?.message || err));
  }
}
