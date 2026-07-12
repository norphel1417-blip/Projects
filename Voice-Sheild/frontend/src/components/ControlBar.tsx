import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, FileDown, FlaskConical, Upload, Database, Loader2 } from "lucide-react";
import { startMic, stopAll, streamSample, streamUploadedFile, evaluateDataset } from "../lib/audio";
import { useStore } from "../store";
import AudioTranscriptPanel from "./AudioTranscriptPanel";

interface Sample {
  name: string;
  label?: string;
  synthetic?: boolean;
  description?: string;
}

export default function ControlBar() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [busy, setBusy] = useState<null | "upload" | "dataset">(null);
  const [datasetLabel, setDatasetLabel] = useState<"" | "real" | "synthetic">("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const datasetRef = useRef<HTMLInputElement>(null);
  const sessionId = useStore((s) => s.sessionId);
  const connected = useStore((s) => s.connected);
  const source = useStore((s) => s.source);
  const setError = useStore((s) => s.setError);

  useEffect(() => {
    fetch("/api/samples").then(async (r) => {
      if (!r.ok) return;
      setSamples(await r.json());
    }).catch(() => {});
  }, []);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy("upload");
    try {
      // Stream the file through the WebSocket pipeline at near real-time rate so
      // every panel (spectrogram, pipeline, gauge, chain-of-thought, deltas) updates
      // window-by-window — no more silent black-box upload.
      await streamUploadedFile(f);
      setError(`Streaming "${f.name}" → live windows incoming…`);
    } catch (err: any) {
      setError(`Upload failed: ${err?.message ?? err}`);
    } finally {
      setBusy(null);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  const onDataset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy("dataset");
    try {
      const j = await evaluateDataset(files, datasetLabel || undefined);
      const s = j.summary;
      const acc = s.accuracy != null ? ` · acc ${(s.accuracy * 100).toFixed(1)}%` : "";
      setError(`Dataset evaluated: ${s.files} files${acc}`);
      console.log("dataset results", j);
    } catch (err: any) {
      setError(`Dataset eval failed: ${err?.message ?? err}`);
    } finally {
      setBusy(null);
      if (datasetRef.current) datasetRef.current.value = "";
    }
  };

  return (
    <div className="surface-premium gilt-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={() => startMic().catch(console.error)}>
          <Mic className="w-4 h-4" /> Live Mic
        </button>
        <button className="btn" onClick={stopAll}>
          <Square className="w-4 h-4" /> Stop
        </button>

        <div className="h-6 w-px bg-line mx-1" />
        <input ref={uploadRef} type="file" accept="audio/*,.wav,.flac,.ogg,.mp3" className="hidden" onChange={onUpload} title="Analyze audio file" aria-label="Analyze audio file" />
        <button className="btn" onClick={() => uploadRef.current?.click()} disabled={busy !== null}>
          {busy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Analyze File
        </button>

        <input ref={datasetRef} type="file" accept="audio/*,.wav,.flac,.ogg,.mp3" multiple className="hidden" onChange={onDataset} title="Evaluate audio dataset" aria-label="Evaluate audio dataset" />
        <select
          className="text-xs border border-line rounded-lg px-2 py-1.5 bg-white"
          value={datasetLabel}
          onChange={(e) => setDatasetLabel(e.target.value as any)}
          title="Optional ground-truth label for batch accuracy"
        >
          <option value="">unlabeled</option>
          <option value="real">label: real</option>
          <option value="synthetic">label: synthetic</option>
        </select>
        <button className="btn" onClick={() => datasetRef.current?.click()} disabled={busy !== null}>
          {busy === "dataset" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Evaluate Dataset
        </button>

        <div className="h-6 w-px bg-line mx-1" />
        <span className="label flex items-center gap-1"><FlaskConical className="w-3 h-3" /> Reference Samples:</span>
        {samples.length === 0 && <span className="text-xs text-ink-400">no samples (run scripts.generate_samples)</span>}
        {samples.map((s) => (
          <button
            key={s.name}
            onClick={() => streamSample(s.name).catch(console.error)}
            className={"btn " + (s.synthetic ? "border-rose-200 text-risk-high hover:bg-risk-highBg" : "border-emerald-200 text-risk-low hover:bg-risk-lowBg")}
            title={s.description}
          >
            <Play className="w-4 h-4" /> {s.label ?? s.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <span className={"tag " + (connected ? "tag-success" : "")}>
            <span className={"led " + (connected ? "led-on" : "led-off")} />
            {connected ? `LIVE · ${source}` : "idle"}
          </span>
          <a
            className={"btn " + (sessionId ? "" : "opacity-50 pointer-events-none")}
            href={sessionId ? `/api/sessions/${sessionId}/report` : "#"}
            target="_blank"
            rel="noreferrer"
          >
            <FileDown className="w-4 h-4" /> PDF Report
          </a>
        </div>
      </div>
      <AudioTranscriptPanel />
    </div>
  );
}
