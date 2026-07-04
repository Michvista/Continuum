import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Mic, Upload, AlertTriangle, ShieldAlert, Square, Loader2, Activity } from "lucide-react";
import { useApp } from "../context/AppContext";
import { api, transcribeAudio, ocrImage } from "../api";
import { Card, Badge, PrimaryButton, GhostButton, EmptyState } from "../components/ui";
import { friendlySyncMessage } from "../errorMessages";
import type { PatientDetail, SensitiveCategory, SourceType } from "../types";

const QUICK_TYPES: { type: SourceType; label: string; icon: typeof FileText }[] = [
  { type: "CLINICAL_NOTE", label: "Text Note", icon: FileText },
  { type: "VOICE_NOTE", label: "Voice Note", icon: Mic },
  { type: "SCANNED_DOCUMENT", label: "Upload Scan", icon: Upload },
];

function extractMedicationLines(content: string) {
  const rx = /([a-zA-Z][a-zA-Z-]{2,})\s+(\d+(?:\.\d+)?)\s?(mg|mcg|ml|g|iu)\b/gi;
  const matches = Array.from(content.matchAll(rx)).map((match) => `${match[1]} ${match[2]}${match[3]}`);
  return matches;
}

function summarizeSnapshot(patient: PatientDetail | null) {
  const fragments = patient?.fragments ?? [];
  const visits = patient?.visits ?? [];
  const meds = Array.from(
    new Set(
      fragments.flatMap((fragment) =>
        fragment.sourceType === "PRESCRIPTION" ? extractMedicationLines(fragment.content) : extractMedicationLines(fragment.content)
      )
    )
  );
  const allergies = fragments
    .filter((fragment) => /allerg|rash|reaction|anaphyl/i.test(fragment.content))
    .map((fragment) => fragment.content)
    .slice(0, 3);
  const latestVisit = visits.slice().sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())[0];
  return {
    meds,
    allergies,
    latestVisit,
  };
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Dashboard() {
  const { session, selectedPatientId, fragments, redactedCount, hasBreakGlass, refreshFragments, bumpGraph } = useApp();
  const [patientDetail, setPatientDetail] = useState<PatientDetail | null>(null);
  const [activeType, setActiveType] = useState<SourceType>("CLINICAL_NOTE");
  const [content, setContent] = useState("");
  const [sourceFileUrl, setSourceFileUrl] = useState<string | null>(null);
  const [sensitive, setSensitive] = useState<SensitiveCategory>("NONE");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [startingRecording, setStartingRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectedPatientId) {
      setPatientDetail(null);
      return;
    }
    api.getPatient(selectedPatientId).then(setPatientDetail).catch(() => setPatientDetail(null));
  }, [selectedPatientId, fragments.length]);

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  if (!selectedPatientId) {
    return <EmptyState title="No patient selected" body="Pick or enroll a patient from the Patients page first." />;
  }

  const localFragments = fragments
    .filter((f) => f.originInstitution === session?.institutionName)
    .slice()
    .reverse();

  const conflictCount = fragments.filter((f) => f.conflictsWithId && f.reviewStatus !== "RESOLVED").length;
  const snapshot = summarizeSnapshot(patientDetail);

  function resetUploadState() {
    setSourceFileUrl(null);
    setScanPreview(null);
  }

  async function startRecording() {
    setNote(null);
    setRecordingSeconds(0);
    setStartingRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick the best supported MIME type — Groq Whisper accepts webm, ogg, mp4, wav, etc.
      // Chrome uses audio/webm;codecs=opus, Firefox uses audio/ogg;codecs=opus.
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/mp4",
      ].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      // Collect data available when the recording stops.
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        // Use the recorder's actual mimeType (may include codec suffix)
        const actualMime = recorder.mimeType || "audio/webm";
        // Strip codec parameters for the file extension decision
        const ext = actualMime.startsWith("audio/ogg")
          ? "ogg"
          : actualMime.startsWith("audio/mp4")
          ? "mp4"
          : "webm";
        
        const blob = new Blob(chunksRef.current, { type: actualMime });
        
        // Safeguard: If the blob is extremely small (empty / header-only), reject early
        if (blob.size < 2000) {
          setNote("Recording was too short. Please try again.");
          return;
        }

        setTranscribing(true);
        try {
          const { transcript, sourceFileUrl: url } = await transcribeAudio(
            blob,
            `voice-note.${ext}`,
          );
          if (!transcript.trim()) {
            setNote("Recording was silent or not clearly audible. Please try again.");
            return;
          }
          setContent(transcript);
          setSourceFileUrl(url);
          setNote("Transcribed via Groq Whisper - review the text below before committing.");
        } catch (err: any) {
          setNote(`Transcription failed: ${String(err.message || err)}`);
        } finally {
          setTranscribing(false);
        }
      };

      // Set up Web Audio API visualizer
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const level = Math.min(100, Math.round((average / 120) * 100));
        setAudioLevel(level);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      // Start the recording without timeslices so browser returns a single uncorrupted file
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      updateLevel();

      // Start the timer interval
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

    } catch (err: any) {
      setNote(`Microphone access failed: ${String(err.message || err)}`);
    } finally {
      setStartingRecording(false);
    }
  }

  function stopRecording() {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);

    mediaRecorderRef.current?.stop();
    setRecording(false);
  }


  async function handleScanSelected(file: File) {
    setNote(null);
    setScanPreview(URL.createObjectURL(file));
    setOcrRunning(true);
    try {
      const { extractedText, sourceFileUrl: url } = await ocrImage(file);
      setContent(extractedText);
      setSourceFileUrl(url);
      setNote("Extracted via Gemini 2.5 Flash OCR - review the text below before committing.");
    } catch (err: any) {
      setNote(`OCR failed: ${String(err.message || err)}`);
    } finally {
      setOcrRunning(false);
    }
  }

  async function commit() {
    if (!content.trim() || !session) return;
    setSaving(true);
    try {
      const fragment = await api.createFragment({
        patientId: selectedPatientId!,
        originInstitution: session.institutionName,
        originAuthor: session.authorName,
        sourceType: activeType,
        content,
        sourceFileUrl: sourceFileUrl || undefined,
        sensitiveCategory: sensitive,
      });
      setContent("");
      setSensitive("NONE");
      resetUploadState();
      await refreshFragments();
      bumpGraph();
      setNote(
        fragment.syncStatus === "SYNCED"
          ? "Committed and synced into the patient's graph."
          : `Saved locally. Graph sync needs attention: ${friendlySyncMessage(fragment.syncError)}`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Consent redaction banner */}
      {redactedCount > 0 && (
        <div className={`lg:col-span-3 flex items-start gap-3 rounded-xl border p-4 ${
          hasBreakGlass
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}>
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">
              {redactedCount} fragment{redactedCount !== 1 ? "s" : ""} hidden by patient consent
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              {hasBreakGlass
                ? "You have active break-glass access — hidden items are now visible above."
                : "This patient has marked certain categories as emergency-only. Use the Consent Dashboard to log a break-glass override if clinically necessary."}
            </p>
          </div>
          {!hasBreakGlass && (
            <Link
              to="/consent"
              className="shrink-0 text-xs font-medium border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100 transition"
            >
              Go to Consent →
            </Link>
          )}
        </div>
      )}

      <div className="lg:col-span-2 space-y-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">Log New Fragment</h2>
            <Badge>secure entry</Badge>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {QUICK_TYPES.map((qt) => (
              <button
                key={qt.type}
                onClick={() => {
                  setActiveType(qt.type);
                  resetUploadState();
                  setContent("");
                  setNote(null);
                }}
                className={`flex flex-col items-center gap-2 border rounded-xl py-4 text-sm font-medium transition ${
                  activeType === qt.type
                    ? "border-teal-600 bg-teal-50 text-teal-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <qt.icon size={18} />
                {qt.label}
              </button>
            ))}
          </div>

          {activeType === "VOICE_NOTE" && (
            <div className="flex flex-col gap-3 mb-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-3">
                {!recording ? (
                  <GhostButton type="button" onClick={startRecording} disabled={transcribing}>
                    <span className="flex items-center gap-1.5">
                      <Mic size={14} /> {transcribing ? "Transcribing..." : "Record voice note"}
                    </span>
                  </GhostButton>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-1.5 text-sm font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg px-3.5 py-1.5 hover:bg-red-100 transition animate-pulse"
                  >
                    <Square size={13} /> Stop recording ({formatTime(recordingSeconds)})
                  </button>
                )}
                {transcribing && <Loader2 size={14} className="animate-spin text-slate-400" />}
                <span className="text-xs text-slate-400">Transcribed via Groq Whisper - stored via Cloudinary</span>
              </div>

              {recording && (
                <div className="flex items-center justify-between border-t border-slate-200/60 pt-2.5 mt-0.5 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Signal:</span>
                    {/* Live waveform indicator */}
                    <div className="flex items-end gap-0.5 h-6 px-1">
                      {[...Array(12)].map((_, i) => {
                        const scale = 0.3 + 0.7 * Math.sin((i / 11) * Math.PI);
                        const active = audioLevel > i * 4;
                        const height = active 
                          ? `${Math.max(4, Math.min(22, (audioLevel / 100) * 22 * scale))}px`
                          : "4px";
                        return (
                          <div
                            key={i}
                            className={`w-1 rounded-full transition-all duration-75 ${
                              active ? "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]" : "bg-slate-300"
                            }`}
                            style={{ height }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    {audioLevel > 5 ? "Speech detected" : "Listening..."}
                  </span>
                </div>
              )}
            </div>
          )}

          {activeType === "SCANNED_DOCUMENT" && (
            <div className="mb-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleScanSelected(file);
                }}
              />
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <GhostButton type="button" onClick={() => fileInputRef.current?.click()} disabled={ocrRunning}>
                  <span className="flex items-center gap-1.5">
                    <Upload size={14} /> {ocrRunning ? "Extracting..." : "Choose scan / photo"}
                  </span>
                </GhostButton>
                {ocrRunning && <Loader2 size={14} className="animate-spin text-slate-400" />}
                <span className="text-xs text-slate-400">OCR via Gemini 2.5 Flash - stored via Cloudinary</span>
              </div>
              {scanPreview && (
                <img src={scanPreview} alt="scan preview" className="mt-2 h-24 rounded-lg border border-slate-200 object-cover" />
              )}
            </div>
          )}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              activeType === "CLINICAL_NOTE"
                ? "Start typing clinical findings or observations..."
                : "Transcribed/extracted text will appear here - review and edit before committing."
            }
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm min-h-[110px]"
          />

          <div className="flex items-center justify-between mt-3 gap-3">
            <select
              value={sensitive}
              onChange={(e) => setSensitive(e.target.value as SensitiveCategory)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5"
            >
              <option value="NONE">No sensitive category</option>
              <option value="MENTAL_HEALTH">Mental health</option>
              <option value="REPRODUCTIVE_HEALTH">Reproductive health</option>
              <option value="SUBSTANCE_USE">Substance use</option>
              <option value="HIV_STATUS">HIV status</option>
              <option value="INTIMATE_PARTNER_VIOLENCE">IPV-related</option>
            </select>
            <PrimaryButton onClick={commit} disabled={saving || !content.trim()}>
              {saving ? "Committing..." : "Commit Fragment"}
            </PrimaryButton>
          </div>
          {note && <p className="text-xs text-slate-500 mt-2 font-mono">{note}</p>}
        </Card>

        {conflictCount > 0 && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle size={16} />
              <span>
                <strong>
                  {conflictCount} conflict{conflictCount > 1 ? "s" : ""} awaiting review
                </strong>{" "}
                across this patient's history - different institutions logged contradicting details.
              </span>
            </div>
            <Link to="/conflicts" className="text-xs font-mono font-medium bg-amber-600 text-white px-3 py-1.5 rounded-lg">
              Review
            </Link>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <Activity size={16} className="text-teal-600" />
              Patient Snapshot
            </h2>
          </div>
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Current meds</p>
              {snapshot.meds.length === 0 ? (
                <p className="text-slate-500 mt-1">No medication mentions found yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {snapshot.meds.slice(0, 4).map((med) => (
                    <Badge key={med}>{med}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Allergies</p>
              {snapshot.allergies.length === 0 ? (
                <p className="text-slate-500 mt-1">No allergy language documented in current fragments.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-slate-600">
                  {snapshot.allergies.map((item) => (
                    <li key={item} className="border-l-2 border-amber-300 pl-2">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Last visit</p>
              {snapshot.latestVisit ? (
                <div className="mt-1">
                  <p className="font-medium">{snapshot.latestVisit.institutionName}</p>
                  <p className="text-slate-500">{new Date(snapshot.latestVisit.visitDate).toLocaleDateString()}</p>
                </div>
              ) : (
                <p className="text-slate-500 mt-1">No visits logged yet.</p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Open conflicts</p>
              <p className="mt-1 font-medium">{conflictCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-base">Consent &amp; access</h2>
            <Link to="/portal" className="text-xs font-mono text-teal-700 hover:text-teal-900">
              Open portal
            </Link>
          </div>
          {patientDetail?.consent ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Care team sharing</p>
                  <p className="mt-1 font-medium">
                    {patientDetail.consent.profile.shareWithCareTeam ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Emergency override</p>
                  <p className="mt-1 font-medium">
                    {patientDetail.consent.profile.allowEmergencyOverride ? "Allowed" : "Blocked"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Sensitive categories</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {patientDetail.consent.rules
                    .filter((rule) => rule.category !== "NONE")
                    .slice(0, 4)
                    .map((rule) => (
                      <Badge key={rule.id}>
                        {rule.category.replace(/_/g, " ").toLowerCase()} · {rule.visibility.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    ))}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Hidden items stay out of the patient portal when requested, but clinicians can still request
                audited break-glass access if the case needs it.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Consent data will appear once a patient is selected.</p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">Local Activity</h2>
          </div>
          {localFragments.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing logged from {session?.institutionName} yet.</p>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto scrollbar-thin">
              {localFragments.map((f) => (
                <div key={f.id} className="border-l-2 border-teal-600 pl-3 py-1">
                  <p className="text-sm text-slate-700 line-clamp-2">{f.content}</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {new Date(f.createdAt).toLocaleString()} - {f.originAuthor ?? "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
