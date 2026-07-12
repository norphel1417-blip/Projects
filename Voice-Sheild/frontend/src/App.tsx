import { useEffect } from "react";
import Topbar from "./components/Topbar";
import KpiStrip from "./components/KpiStrip";
import VerdictCard from "./components/VerdictCard";
import PipelineView from "./components/PipelineView";
import SpectrogramView from "./components/SpectrogramView";
import LiveAnalysisPanel from "./components/LiveAnalysisPanel";
import BiometricsPanel from "./components/BiometricsPanel";
import Timeline from "./components/Timeline";
import ThreatFingerprint from "./components/ThreatFingerprint";
import EvidencePanel from "./components/EvidencePanel";
import ActivityFeed from "./components/ActivityFeed";
import AgentAssist from "./components/AgentAssist";
import ControlBar from "./components/ControlBar";
import Toaster from "./components/Toaster";
import SessionsPage from "./components/SessionsPage";
import AnalyticsPage from "./components/AnalyticsPage";
import DatasetEvalPage from "./components/DatasetEvalPage";
import SettingsPage from "./components/SettingsPage";
import LandingPage from "./components/LandingPage";
import GraphBackground from "./components/GraphBackground";
import ForensicMetricsPanel from "./components/ForensicMetricsPanel";
import LatencyPanel from "./components/LatencyPanel";
import TelemetryConsole from "./components/TelemetryConsole";
import SessionReport from "./components/SessionReport";
import { useStore } from "./store";
import { startStatsPolling, stopStatsPolling } from "./lib/audio";

export default function App() {
  const error = useStore((s) => s.error);
  const tab = useStore((s) => s.tab);
  const pollMs = useStore((s) => s.prefs.statsPollMs);

  useEffect(() => {
    startStatsPolling(pollMs);
    return () => stopStatsPolling();
  }, [pollMs]);

  // Overview gets its own full-screen dedicated layout — no shared chrome
  if (tab === "overview") {
    return (
      <>
        <GraphBackground dark />
        <LandingPage />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <GraphBackground />
      <div className="relative min-h-full app-shell">
        <Topbar />
        <main className="max-w-[1500px] mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-6 pb-32">
          {error && (
            <div className="p-3 rounded-xl border border-rose-200 bg-risk-highBg text-sm text-risk-high font-medium">
              {error}
            </div>
          )}

          {tab === "live" && <LiveConsole />}
          {tab === "sessions" && <SessionsPage />}
          {tab === "analytics" && <AnalyticsPage />}
          {tab === "datasets" && <DatasetEvalPage />}
          {tab === "settings" && <SettingsPage />}

          <footer className="text-[11px] text-ink-400 text-center pt-4">
            Decisions are advisory. Always pair with multi-factor verification before acting on
            suspected synthetic-voice fraud. © VoiceShield prototype · UCO Bank PSB Hackathon 2026.
          </footer>
        </main>

        {tab === "live" && (
          <div className="fixed bottom-4 inset-x-4 md:inset-x-8 lg:inset-x-12 z-30 max-w-[1500px] mx-auto">
            <ControlBar />
          </div>
        )}
      </div>
      <Toaster />
      <SessionReport />
    </>
  );
}

function LiveConsole() {
  return (
    <>
      <KpiStrip />

      <section className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-5">
          <VerdictCard />
        </div>
        <div className="col-span-12 lg:col-span-7 space-y-5">
          <PipelineView />
          <SpectrogramView />
        </div>
      </section>

      <section>
        <LiveAnalysisPanel />
      </section>

      <section className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-4">
          <BiometricsPanel />
        </div>
        <div className="col-span-12 lg:col-span-8">
          <Timeline />
        </div>
      </section>

      <section className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-7">
          <ForensicMetricsPanel />
        </div>
        <div className="col-span-12 lg:col-span-5">
          <LatencyPanel />
        </div>
      </section>

      <section className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-4">
          <ThreatFingerprint />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <EvidencePanel />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <ActivityFeed />
        </div>
      </section>

      <section>
        <AgentAssist />
      </section>

      <section>
        <TelemetryConsole />
      </section>
    </>
  );
}
