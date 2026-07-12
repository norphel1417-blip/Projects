import { useRef, useState } from "react";
import clsx from "clsx";
import { evaluateDataset } from "../lib/audio";
import { Database, Loader2, FileAudio, CheckCircle2, XCircle, AlertTriangle, Sparkles } from "lucide-react";
import LiveAnalysisPanel from "./LiveAnalysisPanel";

type Label = "real" | "synthetic" | "";
type Mode = "batch" | "live";

export default function DatasetEvalPage() {
  const [mode, setMode] = useState<Mode>("batch");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [label, setLabel] = useState<Label>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
    setResult(null);
    setErr(null);
  };

  const submit = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await evaluateDataset(files, label || undefined);
      setResult(r);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setResult(null);
    setErr(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl border border-gold-300 bg-white/70 p-1 text-[12px] font-bold">
        <button
          onClick={() => setMode("batch")}
          className={clsx(
            "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition",
            mode === "batch" ? "bg-gold-200 text-gold-900 shadow-sm" : "text-ink-600 hover:text-ink-900",
          )}
        >
          <Database className="w-3.5 h-3.5" /> Batch Evaluation
        </button>
        <button
          onClick={() => setMode("live")}
          className={clsx(
            "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition",
            mode === "live" ? "bg-gold-200 text-gold-900 shadow-sm" : "text-ink-600 hover:text-ink-900",
          )}
        >
          <Sparkles className="w-3.5 h-3.5" /> Live Analyze
        </button>
      </div>

      {mode === "live" ? <LiveAnalysisPanel /> : <BatchEvalView
        fileRef={fileRef}
        files={files}
        label={label}
        busy={busy}
        err={err}
        result={result}
        onPick={onPick}
        setLabel={setLabel}
        submit={submit}
        reset={reset}
      />}
    </div>
  );
}

function BatchEvalView({ fileRef, files, label, busy, err, result, onPick, setLabel, submit, reset }: {
  fileRef: React.MutableRefObject<HTMLInputElement | null>;
  files: File[];
  label: Label;
  busy: boolean;
  err: string | null;
  result: any | null;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setLabel: (l: Label) => void;
  submit: () => void;
  reset: () => void;
}) {
  const summary = result?.summary ?? {};
  const rows: any[] = result?.results ?? [];
  const accuracy = typeof summary.accuracy === "number" ? summary.accuracy : null;

  return (
    <div className="space-y-5">
      <div className="surface-premium gilt-border p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="label">Batch Evaluation</div>
            <div className="font-display text-2xl font-bold metal-gold-text flex items-center gap-2">
              <Database className="w-5 h-5 text-gold-700" /> Dataset Benchmark
            </div>
            <p className="text-[12px] text-ink-500 mt-1 max-w-xl">
              Run a folder of <code className="font-mono text-[11px]">.wav</code> files through the same forensic pipeline as the live stream. Optionally label the batch as <span className="tag tag-success">real</span> or <span className="tag tag-danger">synthetic</span> to compute per-file correctness and accuracy.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".wav,audio/wav,audio/x-wav,audio/wave"
              onChange={onPick}
              title="Select WAV files for batch evaluation"
              aria-label="Select WAV files for batch evaluation"
              className="text-[12px] file:mr-3 file:px-3 file:py-2 file:rounded-xl file:border-0 file:text-[12px] file:font-bold file:bg-gold-100 file:text-gold-900 hover:file:bg-gold-200 cursor-pointer"
            />
            <select
              value={label}
              onChange={(e) => setLabel(e.target.value as Label)}
              title="Optional ground-truth label for the batch"
              aria-label="Optional ground-truth label for the batch"
              className="px-3 py-2 rounded-xl border border-gold-300 bg-white/90 text-[12px] font-semibold text-ink-800 focus:outline-none focus:ring-2 focus:ring-gold-400"
            >
              <option value="">No ground-truth label</option>
              <option value="real">Label = real</option>
              <option value="synthetic">Label = synthetic</option>
            </select>
            <button onClick={submit} disabled={busy || files.length === 0} className="btn-primary">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              {busy ? "Evaluating…" : `Evaluate ${files.length || ""} files`}
            </button>
            {(files.length > 0 || result) && (
              <button onClick={reset} className="btn">Clear</button>
            )}
          </div>
        </div>
      </div>

      {err && (
        <div className="p-3 rounded-xl border border-rose-200 bg-risk-highBg text-sm text-risk-high font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Big label="Files" value={(summary.files ?? rows.length).toString()} />
            <Big label="Predicted Synthetic" value={rows.filter((r) => r.prediction === "synthetic").length.toString()} tone="danger" />
            <Big label="Predicted Real" value={rows.filter((r) => r.prediction === "real").length.toString()} tone="success" />
            {summary.label && <Big label="Ground Truth" value={String(summary.label).toUpperCase()} />}
            {accuracy !== null && (
              <Big
                label="Accuracy"
                value={`${(accuracy * 100).toFixed(1)}%`}
                tone={accuracy >= 0.9 ? "success" : accuracy >= 0.7 ? "warn" : "danger"}
              />
            )}
          </div>

          <div className="surface-premium gilt-border p-4 overflow-x-auto">
            <div className="label mb-3">Per-File Results</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  {["File", "Duration (s)", "Windows", "Max Fused", "EMA Fused", "Prediction", summary.label ? "Correct?" : ""].filter(Boolean).map((h) => (
                    <th key={h} className="label py-2 pr-3 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-gold-200/60">
                    <td className="py-2 pr-3 font-mono text-[11px] text-ink-700 flex items-center gap-1.5">
                      <FileAudio className="w-3.5 h-3.5 text-gold-700" /> {r.name}
                    </td>
                    <td className="py-2 pr-3 num-mono">{r.duration_s ?? "—"}</td>
                    <td className="py-2 pr-3 num-mono">{r.windows ?? "—"}</td>
                    <td className="py-2 pr-3 num-mono">
                      {typeof r.max_fused === "number" ? <ScoreBar v={r.max_fused} /> : (r.error ?? "—")}
                    </td>
                    <td className="py-2 pr-3 num-mono">
                      {typeof r.ema_fused === "number" ? <ScoreBar v={r.ema_fused} /> : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {r.prediction === "synthetic" ? <span className="tag tag-danger">SYNTHETIC</span> : r.prediction === "real" ? <span className="tag tag-success">REAL</span> : <span className="tag">—</span>}
                    </td>
                    {summary.label && (
                      <td className="py-2 pr-3">
                        {r.correct === true ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]"><CheckCircle2 className="w-3.5 h-3.5" /> YES</span>
                        ) : r.correct === false ? (
                          <span className="inline-flex items-center gap-1 text-risk-high font-bold text-[11px]"><XCircle className="w-3.5 h-3.5" /> NO</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!result && !err && files.length === 0 && (
        <div className="surface-soft p-10 text-center text-xs text-ink-400 border border-dashed border-gold-300 rounded-2xl">
          Select <strong>.wav</strong> files above to begin a batch evaluation. Results are computed on the live backend pipeline — no demo data.
        </div>
      )}
    </div>
  );
}

function Big({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warn" | "success" }) {
  const c = tone === "danger" ? "text-risk-high" : tone === "warn" ? "text-risk-med" : tone === "success" ? "text-risk-low" : "kpi-value";
  return (
    <div className="kpi-card p-3">
      <div className="label">{label}</div>
      <div className={clsx("font-display text-2xl font-bold num-mono", tone ? c : "kpi-value")}>{value}</div>
    </div>
  );
}

function ScoreBar({ v }: { v: number }) {
  const pct = Math.max(0, Math.min(1, v)) * 100;
  const color = v >= 0.85 ? "#8e2f3d" : v >= 0.65 ? "#a06a2a" : "#3f7a5e";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 rounded-full bg-ink-100 overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] tabular-nums text-ink-700">{pct.toFixed(1)}%</span>
    </div>
  );
}
