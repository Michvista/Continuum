import fetch from "node-fetch";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const OCR_PROMPT =
  "Transcribe every piece of readable text from this medical document/scan exactly as written. " +
  "Preserve drug names, dosages, units, dates, and numbers precisely — do not round, normalize, or " +
  "guess at illegible characters; mark anything genuinely unreadable as [illegible]. Output plain " +
  "text only, no commentary, no markdown formatting.";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

// Runs OCR/extraction over a scanned document or photo using Gemini 2.5
// Flash's multimodal understanding — used instead of a dedicated OCR engine,
// per project decision. Docs: https://ai.google.dev/gemini-api/docs/image-understanding
export async function extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in backend/.env");
  }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: buffer.toString("base64") } },
            { text: OCR_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini OCR failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no extracted text");
  return text.trim();
}

const TRANSCRIBE_PROMPT =
  "Please transcribe the speech in this audio recording exactly as spoken. " +
  "Preserve medical terms, names, and numbers accurately. Do not summarize or paraphrase. " +
  "Output the transcription as plain text only, with no commentary, no markdown, and no intro/outro. " +
  "If the audio is silent, contains only static, or has no discernible speech, return an empty response.";

export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in backend/.env");
  }

  // Clean mimetype (e.g. strip codecs parameter)
  const cleanMime = mimeType.split(";")[0].trim();

  console.log(`[gemini] Sending audio to Gemini: mimeType=${cleanMime}, size=${buffer.length} bytes`);

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: cleanMime, data: buffer.toString("base64") } },
            { text: TRANSCRIBE_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[gemini] Transcription failed (${res.status}):`, text);
    throw new Error(`Gemini transcription failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text === undefined) return "";
  return text.trim();
}
