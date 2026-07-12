import { Shield, Activity } from "lucide-react";
import { useStore } from "../store";
import clsx from "clsx";
import TabNav from "./TabNav";

export default function Topbar() {
  const connected = useStore((s) => s.connected);
  const source = useStore((s) => s.source);
  const stats = useStore((s) => s.stats);
  return (
    <header
      className="topbar-shell sticky top-0 z-40 backdrop-blur-md border-b border-line relative"
    >
      <div className="absolute inset-x-0 bottom-0 h-[2px] gilt-divider" />
      <div className="max-w-[1500px] mx-auto px-4 md:px-6 lg:px-8 h-16 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-xl metal-gold flex items-center justify-center shadow-glowGold ring-1 ring-steel-600/40">
            <Shield className="w-5 h-5 text-steel-50 drop-shadow-sm" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-lg tracking-tight">
              <span className="text-ink-900">Voice</span>
              <span className="metal-gold-text">Shield</span>
            </div>
            <div className="text-[11px] text-ink-500 font-medium tracking-wide">
              UCO Bank · Audio Forensics for Voice Security
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 ml-2 flex-wrap">
          <span className="tag tag-gold">PSB Hackathon 2026 · Problem 2</span>
          {stats?.loaded_models && stats.loaded_models.length > 0 ? (
            stats.loaded_models.map((m) => (
              <span
                key={m.track}
                className={clsx(
                  "tag",
                  m.role === "SOTA primary" ? "tag-gold" : "tag-silver",
                )}
                title={`${m.role}${m.arch ? " · " + m.arch : ""}`}
              >
                {m.id}
              </span>
            ))
          ) : (
            <span className="tag tag-silver">Loading models…</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {stats?.model_version && (
            <span className="hidden lg:inline text-[11px] text-ink-500 font-mono">
              model {stats.model_version} {stats.use_neural ? "· neural" : "· forensic-only"}
            </span>
          )}
          <span className="tag">
            <Activity className="w-3 h-3" /> ENV · {stats?.env ?? "—"}
          </span>
          <span
            className={clsx(
              "inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border",
              connected
                ? "border-emerald-200 bg-risk-lowBg text-emerald-700"
                : "border-line bg-white text-ink-500",
            )}
          >
            <span className={clsx("led", connected ? "led-on" : "led-off")} />
            {connected ? `LIVE · ${source}` : "STANDBY"}
          </span>
        </div>
      </div>
      <div className="max-w-[1500px] mx-auto px-4 md:px-6 lg:px-8 pb-2">
        <TabNav />
      </div>
    </header>
  );
}
