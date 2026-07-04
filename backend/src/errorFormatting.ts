export function summarizeExternalError(input: unknown): string {
  let text = "";

  if (typeof input === "string") {
    text = input.trim();
  } else if (input && typeof input === "object") {
    const candidate = input as { message?: unknown; body?: unknown; detail?: unknown; status?: unknown };
    const parts = [
      typeof candidate.status === "number" ? `HTTP ${candidate.status}` : "",
      typeof candidate.detail === "string" ? candidate.detail.trim() : "",
      typeof candidate.body === "string" ? candidate.body.trim() : "",
      typeof candidate.message === "string" ? candidate.message.trim() : "",
    ].filter(Boolean);
    text = parts.join(" ").trim();
  } else {
    text = String(input ?? "").trim();
  }

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === "string") {
        text = parsed.detail.trim();
      } else if (typeof parsed?.error === "string") {
        text = parsed.error.trim();
      }
    } catch {
      // fall through to raw text
    }
  }

  if (!text) {
    return "An empty error response came back from the Cognee service.";
  }

  if (/HTTP 404\b|Not Found/i.test(text)) {
    return "Cognee returned 404 Not Found. Check that the service URL points at the correct Cognee Cloud endpoint.";
  }

  if (/HTTP 500\b/i.test(text) || /Internal Server Error/i.test(text)) {
    return "Cognee returned 500 Internal Server Error. The remote service accepted the request but could not complete sync.";
  }

  if (/module 'cognee' has no attribute 'serve'/i.test(text)) {
    return "Cognee cloud mode is unavailable in this install. The service needs a cloud-capable Cognee SDK, or it must run in local mode with a valid LLM key.";
  }

  if (/Incorrect API key provided/i.test(text)) {
    return "The configured LLM key was rejected by the provider. Check the Cognee/OpenAI credentials in the service environment.";
  }

  if (/AuthenticationError/i.test(text) || /failed_attempts/i.test(text)) {
    return "Cognee could not complete the reasoning step because its model provider rejected the request.";
  }

  if (/Cannot connect to host|fetch failed|ECONNREFUSED|ENOTFOUND|SSL: TLSV1_ALERT_INTERNAL_ERROR/i.test(text)) {
    return "The Cognee service could not be reached. Check that the Python service is running on the configured port.";
  }

  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}
