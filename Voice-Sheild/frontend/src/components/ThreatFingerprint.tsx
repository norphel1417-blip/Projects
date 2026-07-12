import { useStore } from "../store";
import { Fingerprint, AlertOctagon } from "lucide-react";

const FAMILY_DESCRIPTIONS: Record<string, string> = {
  "Autoregressive Vocoder (Tacotron-2 / WaveNet family)":
    "Slow, sample-by-sample synthesis. Often shows over-smooth pitch trajectory and reduced jitter.",
  "GAN Vocoder (HiFi-GAN / MelGAN family)":
    "Adversarial vocoder: low high-frequency noise floor, characteristic spectral kurtosis spike.",
  "Diffusion / Flow-based TTS (StyleTTS / VALL-E family)":
    "Probabilistic vocoder: unusual phase coherence patterns and clean residuals.",
  "Concatenative / Splice-edit Spoof":
    "Audio fragments stitched together: discontinuities at boundaries, irregular shimmer.",
  "Generic Neural TTS":
    "Unknown synthesis pipeline — multiple anomaly families fired simultaneously.",
};

export default function ThreatFingerprint() {
  const last = useStore((s) => s.windows[s.windows.length - 1]);
  const fp = last?.threat_fingerprint;
  const conf = last?.threat_confidence ?? 0;

  return (
    <div className="surface p-5 h-full">
      <div className="flex items-center gap-2 mb-3">
        <Fingerprint className="w-4 h-4 text-accent-rose" />
        <div className="label">Threat Fingerprint</div>
      </div>

      {!fp ? (
        <div className="text-sm text-ink-500 leading-relaxed">
          No synthesis-family fingerprint detected on the most recent window.
          The classifier triggers only when forensic + neural evidence converges
          on a known generator family.
        </div>
      ) : (
        <div>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-risk-highBg border border-rose-200 flex items-center justify-center text-risk-high shrink-0">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-ink-900 leading-tight">
                {fp}
              </div>
              <div className="text-[11px] text-ink-500 mt-1">
                {FAMILY_DESCRIPTIONS[fp] ?? "Synthesis pipeline pattern matched."}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-ink-500">
              <span>Family confidence</span>
              <span className="num-mono font-bold text-ink-900">
                {(conf * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-line overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-300 via-amber-600 to-rose-800 transition-all"
                style={{ width: `${Math.min(100, conf * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
