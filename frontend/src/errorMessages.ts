export function friendlySyncMessage(raw: string | null | undefined): string {
  const initial = String(raw ?? "").trim();
  let text = initial;

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === "string") {
        text = parsed.detail.trim();
      }
    } catch {
      // leave as-is
    }
  }

  if (!text) {
    return "Sync did not complete. The fragment was still saved locally, but the reasoning service returned no details.";
  }

  if (/HTTP 404\b|Not Found/i.test(text)) {
    return "Cognee returned 404 Not Found. The fragment was still saved locally, but the cloud endpoint looks wrong.";
  }

  if (/HTTP 500\b/i.test(text) || /Internal Server Error/i.test(text)) {
    return "Cognee returned 500 Internal Server Error. The fragment was still saved locally, but cloud sync could not finish.";
  }

  if (/cloud mode is unavailable in this install/i.test(text)) {
    return "Cognee cloud mode is not supported by the installed Python package. The fragment was saved locally, but graph sync could not run.";
  }

  if (/request to .*\/remember failed/i.test(text) || /request to .*\/recall failed/i.test(text)) {
    return "The reasoning service returned an error. The fragment was saved locally, but graph sync could not complete.";
  }

  if (/Remote remember failed/i.test(text) || /Remote recall failed/i.test(text)) {
    return "Cognee Cloud rejected the request. The fragment was saved locally, but graph sync could not complete.";
  }

  if (/serve\(\)\.?$/i.test(text) || /does not expose serve/i.test(text)) {
    return "This Cognee install cannot connect to cloud mode. Update the service environment or use a matching cloud-capable SDK.";
  }

  if (/Incorrect API key provided/i.test(text)) {
    return "The configured model key was rejected. Check the Cognee service environment for the correct provider credentials.";
  }

  if (/AuthenticationError/i.test(text) || /failed_attempts/i.test(text)) {
    return "Cognee could not finish the reasoning step because the model provider rejected the request.";
  }

  if (/could not be reached|ECONNREFUSED|ENOTFOUND/i.test(text)) {
    return "The Cognee service is unreachable right now. Check that the Python service is running.";
  }

  if (/empty error response/i.test(text)) {
    return "Cognee returned an empty error response. The fragment was saved locally, but cloud sync could not finish.";
  }

  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}
