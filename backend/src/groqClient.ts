import FormData from "form-data";
import fetch from "node-fetch";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

// Transcribes a voice-note recording with Groq's hosted Whisper endpoint.
// Docs: https://console.groq.com/docs/speech-to-text
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set in backend/.env");
  }

  console.log(`[groq] Sending audio to Groq Whisper: filename=${filename}, mimeType=${mimeType}, size=${buffer.length} bytes`);

  const form = new FormData();
  form.append("file", buffer, { filename, contentType: mimeType });
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "json");
  form.append(
    "prompt",
    "This is a clinical voice note. Dictate the exact spoken words. If there is only silence or static, return an empty string."
  );

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
    body: form as any,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[groq] Error response from Groq (${res.status}):`, text);
    throw new Error(`Groq transcription failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { text?: string };
  console.log("[groq] Received response from Groq:", data);
  if (!data.text) throw new Error("Groq returned no transcript text");
  
  const text = data.text.trim();
  // Filter out common Whisper hallucinations for silence/breath
  const lowerText = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();
  const hallucinations = [
    "thank you",
    "thank you for watching",
    "thanks for watching",
    "thank you very much",
    "please subscribe",
    "subtitles by",
    "you",
    "bye",
    "mb",
    "transcription by",
  ];
  if (hallucinations.includes(lowerText)) {
    console.log(`[groq] Detected Whisper hallucination on silence: "${text}". Returning empty string.`);
    return "";
  }

  return text;
}
