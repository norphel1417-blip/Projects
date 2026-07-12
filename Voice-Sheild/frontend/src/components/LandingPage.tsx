import {
  Activity,
  ArrowRight,
  AudioWaveform,
  BarChart3,
  Database,
  Fingerprint,
  Gauge,
  GitBranch,
  History,
  LockKeyhole,
  Radar,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store";

// ── Capability cards ─────────────────────────────────────────────────────────
const CAPABILITIES = [
  {
    icon: AudioWaveform,
    title: "Live Spectrogram",
    body: "Streaming mel-spectrogram with forensic windowing on every 4-second window of a live call.",
  },
  {
    icon: Fingerprint,
    title: "Artifact Fingerprint",
    body: "Pitch jitter, shimmer, spectral kurtosis, phase coherence, flatness, tilt and HF-energy ratio.",
  },
  {
    icon: GitBranch,
    title: "Fusion Pipeline",
    body: "Forensic features combined with wav2vec2-GAT and Whisper-MLP heads through logistic fusion.",
  },
  {
    icon: ShieldCheck,
    title: "Call-Center Actions",
    body: "Freeze, OTP, branch transfer, and safe-marking actions — all recorded in the session evidence trail.",
  },
] as const;

const PIPELINE_LAYERS = [
  { n: "01", label: "Audio",    sub: "16 kHz · 4s win" },
  { n: "02", label: "Forensic", sub: "jitter · shimmer · phase" },
  { n: "03", label: "Neural-A", sub: "wav2vec2 · GAT" },
  { n: "04", label: "Neural-B", sub: "Whisper · MLP" },
  { n: "05", label: "Fusion",   sub: "logistic · wˣ + b" },
  { n: "06", label: "EMA",      sub: "α=0.55 · smoothed" },
];

const NAV_LINKS = [
  { id: "live"     as const, label: "Live Console", icon: Activity  },
  { id: "sessions" as const, label: "Sessions",     icon: History   },
  { id: "analytics"as const, label: "Analytics",    icon: BarChart3 },
  { id: "datasets" as const, label: "Dataset Eval", icon: Database  },
  { id: "settings" as const, label: "Settings",     icon: SlidersHorizontal },
] as const;

function pct(v: number) { return `${Math.round(v * 100)}%`; }

// ── Component ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const setTab   = useStore((s) => s.setTab);
  const stats    = useStore((s) => s.stats);
  const connected = useStore((s) => s.connected);
  const source   = useStore((s) => s.source);
  const windows  = useStore((s) => s.windows);
  const ema      = useStore((s) => s.ema);
  const risk     = useStore((s) => s.risk);
  const lastWin  = windows.at(-1);
  const hasSig   = windows.length > 0;

  return (
    /* Full-viewport root — the dark canvas from App sits behind this */
    <div className="landing-root">

      {/* ── Dedicated sticky glass header ────────────────────────────── */}
      <header className="landing-chrome">
        {/* Brand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="landing-logo-icon">
            <Shield className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-[17px] text-white tracking-tight">
              VoiceShield
            </div>
            <div className="text-[10px] font-semibold tracking-widest text-steel-300 uppercase">
              UCO Bank · PSB 2026
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <button key={link.id} onClick={() => setTab(link.id)} className="landing-nav-link">
                <Icon className="w-3.5 h-3.5" />
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Status + CTA */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={clsx("landing-status", connected && "landing-status--live")}>
            <span className={clsx("led", connected ? "led-on" : "led-off")} />
            {connected ? `LIVE · ${source}` : "STANDBY"}
          </span>
          <button className="landing-enter" onClick={() => setTab("live")}>
            Enter Console <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <div className="landing-scroll">

        {/* ─ Hero ───────────────────────────────────────────── */}
        <section className="landing-hero">
          {/* Left: pitch */}
          <div className="landing-hero-pitch">
            <div className="flex flex-wrap gap-2 mb-8">
              <span className="tag landing-tag-dark">
                <ShieldCheck className="h-3 w-3" /> Voice Biometrics Defense
              </span>
              <span className="tag landing-tag-glass">PSB Hackathon 2026 · Problem&nbsp;2</span>
            </div>

            <h1 className="landing-h1">
              <span className="landing-h1-thin">Voice</span>Shield
            </h1>
            <p className="landing-tagline">
              Audio forensics that detects synthetic voice artifacts in the first 10 seconds of a call — before a cloned voice can pass as a trusted customer.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <button className="landing-cta-primary" onClick={() => setTab("live")}>
                <Activity className="h-4 w-4" />
                Open Live Console
                <ArrowRight className="h-4 w-4" />
              </button>
              <button className="landing-cta-secondary" onClick={() => setTab("datasets")}>
                <Database className="h-4 w-4" />
                Evaluate Dataset
              </button>
            </div>

            {/* Live stats row */}
            <div className="landing-stats-row">
              <StatTile label="Connection" value={connected ? "LIVE" : "STANDBY"} sub={connected ? source : stats?.env ?? "Production"} />
              <StatTile label="Live EMA" value={pct(hasSig ? ema : 0)} sub={hasSig ? risk : "awaiting signal"} />
              <StatTile label="Model" value={stats?.model_version ?? "0.1.0"} sub={stats?.use_neural ? "neural fusion" : "forensic only"} />
              <StatTile label="Sessions" value={String(stats?.calls_today ?? 0)} sub="today" />
            </div>
          </div>

          {/* Right: live preview panel */}
          <div className="landing-preview-panel">
            {/* Panel header */}
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <div className="label landing-sublabel">Live Signal Preview</div>
                <div className="font-display text-xl font-semibold text-white mt-1">
                  Spectrogram + Grad-CAM
                </div>
              </div>
              <span className={clsx("tag", hasSig
                ? risk === "high" ? "tag-danger" : "tag-success"
                : "landing-tag-glass"
              )}>
                <span className={clsx("led", hasSig
                  ? risk === "high" ? "led-danger" : "led-on"
                  : "led-off"
                )} />
                {hasSig ? risk.toUpperCase() : "AWAITING AUDIO"}
              </span>
            </div>

            {/* Spectrogram + EMA panel */}
            <div className="grid gap-3 md:grid-cols-[1.4fr_0.6fr] mb-4">
              <div className="spec-frame landing-spec-pane">
                {hasSig && lastWin?.spectrogram_b64 ? (
                  <img src={`data:image/png;base64,${lastWin.spectrogram_b64}`} alt="Current spectrogram" className="w-full h-full object-cover" />
                ) : (
                  <div className="landing-await-signal">
                    <Radar className="h-8 w-8" />
                    <span>Awaiting live audio</span>
                    <span className="landing-await-hint">
                      Start a mic session or upload a file on the Live Console
                    </span>
                  </div>
                )}
              </div>
              <div className="landing-ema-pane">
                <Gauge className="h-5 w-5 text-steel-200" />
                <div className="landing-ema-value">{pct(hasSig ? ema : 0)}</div>
                <div className="landing-ema-label">Synthetic Probability</div>
                <progress
                  className="landing-risk-meter"
                  value={hasSig ? ema : 0}
                  max={1}
                  aria-label="EMA synthetic probability"
                />
              </div>
            </div>

            {/* Pipeline layers */}
            <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
              {PIPELINE_LAYERS.map((l) => (
                <div key={l.label} className="landing-layer">
                  <span>{l.n}</span>
                  <strong>{l.label}</strong>
                  <em>{l.sub}</em>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─ Problem statement strip ────────────────────────── */}
        <section className="landing-problem">
          <div className="landing-problem-body">
            <div className="label landing-section-label mb-3">Problem Statement · PSB Hackathon 2026 · Problem 2</div>
            <blockquote className="landing-quote">
              Generative AI tools can clone a customer's voice from just a few seconds of audio. Fraudsters use this to bypass Voice Biometric passwords or trick call-center agents into transferring funds. Current defenses rely on metadata (phone numbers) — which is easily spoofed.
            </blockquote>
            <div className="landing-expected">
              <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              <span>
                <strong>Expected:</strong> A real-time Audio Forensics Module that analyzes the spectrogram of a live call, detects synthetic micro-artifacts in pitch and frequency, and flags the call as High Risk within the first 10 seconds.
              </span>
            </div>
          </div>
        </section>

        {/* ─ Capabilities + Statement ───────────────────────── */}
        <section className="landing-mid-grid">
          <div className="landing-statement-card">
            <Radar className="h-6 w-6 text-steel-200 mb-4" />
            <h2 className="landing-card-h2">Signal-first fraud response</h2>
            <p className="landing-card-p">
              VoiceShield keeps the operator inside one auditable loop — stream audio, inspect forensic artifacts, fuse model scores, and act before a cloned voice can pass as a trusted caller.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {CAPABILITIES.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="landing-cap-card">
                  <div className="landing-cap-icon"><Icon className="h-4 w-4" /></div>
                  <div>
                    <h3 className="landing-cap-h3">{item.title}</h3>
                    <p className="landing-cap-p">{item.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ─ Bottom strip ───────────────────────────────────── */}
        <section className="landing-strip">
          <BottomCard icon={Sparkles} title="Prototype Discipline"
            body="Live mic, uploaded files, and industry dataset evaluation all share the same backend inference path — no synthetic demo data." />
          <BottomCard icon={BarChart3} title="Evidence Trail"
            body="Every risk transition is logged with spectrograms, Grad-CAM heatmaps, forensic features, and analyst action records." />
          <BottomCard icon={LockKeyhole} title="Operator Control"
            body="Decisions are advisory. All call-center actions pair with multi-factor verification before any customer-impacting operation." />
        </section>

        {/* ─ Footer ─────────────────────────────────────────── */}
        <footer className="landing-footer">
          © VoiceShield — UCO Bank PSB Hackathon 2026 · Audio Forensics for Voice Security
        </footer>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="landing-stat-tile">
      <div className="landing-stat-label">{label}</div>
      <strong className="landing-stat-value">{value}</strong>
      <span className="landing-stat-sub">{sub}</span>
    </div>
  );
}

function BottomCard({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="landing-bottom-card">
      <Icon className="h-5 w-5 text-steel-200" />
      <h3 className="landing-card-h2 mt-4">{title}</h3>
      <p className="landing-card-p mt-3">{body}</p>
    </div>
  );
}
