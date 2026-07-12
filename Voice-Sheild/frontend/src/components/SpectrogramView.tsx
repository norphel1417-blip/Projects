import { useStore } from "../store";

export default function SpectrogramView() {
  const last = useStore((s) => s.windows[s.windows.length - 1]);
  const stats = useStore((s) => s.stats);
  const streamInfo = useStore((s) => s.streamInfo);
  const prefs = useStore((s) => s.prefs);
  const sampleRate = stats?.sample_rate ?? streamInfo?.sample_rate;
  const windowSeconds = stats?.window_seconds ?? streamInfo?.window_seconds;
  const nMels = stats?.n_mels ?? streamInfo?.n_mels;
  const high = stats?.high_threshold ?? streamInfo?.high_threshold ?? prefs.highThreshold;
  const medium = stats?.medium_threshold ?? streamInfo?.medium_threshold ?? prefs.mediumThreshold;
  const rateLabel = sampleRate ? `${+(sampleRate / 1000).toFixed(1)} kHz` : "sample rate pending";
  const windowLabel = windowSeconds == null ? "window pending" : `${+windowSeconds.toFixed(2)}s`;
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="label">Live Spectrogram</div>
          <div className="text-sm text-ink-700">Last analyzed window · {windowLabel} @ {rateLabel}</div>
        </div>
        <div className="flex gap-2">
          <span className="tag">Mel · {nMels ?? "—"} bins</span>
          <span className="tag tag-brand">Grad-CAM</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Pane title="Spectrogram" b64={last?.spectrogram_b64} />
        <Pane title="Forensic Heatmap" b64={last?.gradcam_b64} />
      </div>

      {last && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Stat label="Forensic" v={last.forensic} high={high} medium={medium} />
          <Stat label="Neural-A" v={last.neural_a} high={high} medium={medium} />
          <Stat label="Neural-B" v={last.neural_b} high={high} medium={medium} />
          <Stat label="Fused" v={last.fused} high={high} medium={medium} />
        </div>
      )}
    </div>
  );
}

function Pane({ title, b64 }: { title: string; b64?: string }) {
  return (
    <div className="surface-soft p-3">
      <div className="label mb-2">{title}</div>
      <div className="spec-frame aspect-[16/8] flex items-center justify-center">
        {b64 ? (
          <img
            src={`data:image/png;base64,${b64}`}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-gold-300/80 text-xs tracking-wider uppercase font-semibold">awaiting audio…</span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, v, high, medium }: { label: string; v: number | null | undefined; high: number; medium: number }) {
  if (v == null) {
    return (
      <div className="surface-soft p-2.5 flex items-center justify-between">
        <span className="text-ink-500 font-semibold">{label}</span>
        <span className="text-ink-400 num-mono">n/a</span>
      </div>
    );
  }
  const c = v >= high ? "text-risk-high" : v >= medium ? "text-risk-med" : "text-risk-low";
  return (
    <div className="surface-soft p-2.5 flex items-center justify-between">
      <span className="text-ink-500 font-semibold">{label}</span>
      <span className={c + " num-mono font-bold"}>{(v * 100).toFixed(0)}%</span>
    </div>
  );
}
