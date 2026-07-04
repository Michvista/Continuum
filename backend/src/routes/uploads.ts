import { Router } from "express";
import multer from "multer";
import { AuthRole } from "@prisma/client";
import { uploadBuffer } from "../cloudinaryClient";
import { extractTextFromImage, transcribeAudio } from "../geminiClient";
import { requireAuth, requireRole } from "../auth";

export const uploadsRouter = Router();
uploadsRouter.use(
  requireAuth,
  requireRole(
    AuthRole.CLINICIAN,
    AuthRole.REVIEWER,
    AuthRole.ADMIN,
    AuthRole.NURSE,
  ),
);

// In-memory storage — files are streamed straight to Cloudinary/Groq/Gemini,
// never written to disk on this server.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// These are PREVIEW endpoints, not fragment-creation endpoints: they upload
// the file and run transcription/OCR, then hand back text + a source URL
// for the frontend to show in an editable textarea before the person commits
// it as a fragment via the normal POST /api/fragments. That keeps review
// (and the chance to correct a transcription mistake) in a human's hands
// before anything is treated as part of the patient's record.

uploadsRouter.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    console.warn("[uploads] POST /transcribe: No audio file in request");
    return res
      .status(400)
      .json({ error: "No audio file uploaded (field name: audio)" });
  }

  console.log("[uploads] POST /transcribe received file:", {
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.buffer.length,
  });

  try {
    const [sourceFileUrl, transcript] = await Promise.all([
      uploadBuffer(req.file.buffer, {
        resourceType: "video",
        folder: "continuum/voice-notes",
      }),
      transcribeAudio(
        req.file.buffer,
        req.file.mimetype,
      ),
    ]);
    res.json({ transcript, sourceFileUrl });
  } catch (err: any) {
    console.error("[uploads] POST /transcribe error:", err);
    res.status(502).json({ error: String(err?.message || err) });
  }
});

uploadsRouter.post("/ocr", upload.single("image"), async (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ error: "No image file uploaded (field name: image)" });
  try {
    const [sourceFileUrl, extractedText] = await Promise.all([
      uploadBuffer(req.file.buffer, {
        resourceType: "image",
        folder: "continuum/scans",
      }),
      extractTextFromImage(req.file.buffer, req.file.mimetype),
    ]);
    res.json({ extractedText, sourceFileUrl });
  } catch (err: any) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});
