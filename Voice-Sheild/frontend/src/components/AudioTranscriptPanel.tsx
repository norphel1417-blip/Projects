import { Captions, Gauge, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { setPlaybackRate, setPlaybackVolume, seekPlayback, stopAll, togglePlayback } from "../lib/audio";
import { useStore } from "../store";
import clsx from "clsx";

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudioTranscriptPanel() {
  const playback = useStore((s) => s.playback);
  const segments = useStore((s) => s.transcriptSegments);
  const status = useStore((s) => s.transcriptStatus);
  const audioMeter = useStore((s) => s.audioMeter);
  const streamInfo = useStore((s) => s.streamInfo);
  const connected = useStore((s) => s.connected);
  const source = useStore((s) => s.source);
  const windows = useStore((s) => s.windows);
  const visible = playback.url || connected || source !== "idle" || segments.length > 0;
  if (!visible) return null;

  const latest = segments.slice(-4);
  const duration = playback.duration || 0;
  const statusTone = status === "unavailable"
    ? "text-rose-600 bg-risk-highBg border-rose-200"
    : status === "warming" || status === "transcribing"
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-emerald-700 bg-emerald-50 border-emerald-200";

  return (
    <div className="w-full border-t border-line/80 pt-3 mt-3 grid grid-cols-1 xl:grid-cols-[minmax(420px,1fr)_minmax(360px,0.8fr)] gap-3">
      <div className="space-y-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <button className="btn h-9 w-9 p-0 justify-center" onClick={togglePlayback} disabled={!playback.url} title={playback.playing ? "Pause" : "Play"}>
            {playback.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button className="btn h-9 w-9 p-0 justify-center" onClick={() => seekPlayback(Math.max(0, playback.currentTime - 5))} disabled={!playback.url} title="Back 5 seconds">
            <SkipBack className="w-4 h-4" />
          </button>
          <button className="btn h-9 w-9 p-0 justify-center" onClick={() => seekPlayback(Math.min(duration || playback.currentTime + 5, playback.currentTime + 5))} disabled={!playback.url} title="Forward 5 seconds">
            <SkipForward className="w-4 h-4" />
          </button>
          <button className="btn h-9 w-9 p-0 justify-center" onClick={stopAll} title="Stop stream">
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 text-[11px] font-mono text-ink-500">
              <span className="truncate">{playback.filename ?? "Live audio stream"}</span>
              <span className="shrink-0">{fmtTime(playback.currentTime)} / {fmtTime(duration)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(duration, playback.currentTime, 0.01)}
              step={0.05}
              value={Math.min(playback.currentTime, Math.max(duration, playback.currentTime, 0.01))}
              onChange={(e) => seekPlayback(Number(e.target.value))}
              disabled={!playback.url}
              className="w-full accent-ink-900"
              title="Playback position"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1 text-ink-500 font-mono">
            <Gauge className="w-3.5 h-3.5" /> {windows.length} windows
          </span>
          <label className="inline-flex items-center gap-2 text-ink-500 font-mono">
            <Volume2 className="w-3.5 h-3.5" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={playback.volume}
              onChange={(e) => setPlaybackVolume(Number(e.target.value))}
              className="w-24 accent-ink-900"
              title="Volume"
            />
            {Math.round(playback.volume * 100)}%
          </label>
          <select
            className="text-[11px] border border-line rounded-lg px-2 py-1.5 bg-white font-mono"
            value={playback.rate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            title="Playback speed"
          >
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>
          <span className={clsx("inline-flex items-center gap-1 px-2 py-1 rounded-lg border font-mono uppercase tracking-wide", statusTone)}>
            <Captions className="w-3.5 h-3.5" /> {status}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono">
          <div className="rounded-lg border border-line bg-white/70 px-2 py-1.5">
            <div className="text-ink-400 uppercase tracking-wide">meter</div>
            <div className="text-ink-900 font-bold">{streamInfo?.meter_interval_seconds ? `${Math.round(streamInfo.meter_interval_seconds * 1000)} ms` : "live"}</div>
          </div>
          <div className="rounded-lg border border-line bg-white/70 px-2 py-1.5">
            <div className="text-ink-400 uppercase tracking-wide">level</div>
            <div className="text-ink-900 font-bold">{audioMeter ? `${audioMeter.level_db.toFixed(1)} dB` : "--"}</div>
          </div>
          <div className="rounded-lg border border-line bg-white/70 px-2 py-1.5">
            <div className="text-ink-400 uppercase tracking-wide">peak</div>
            <div className="text-ink-900 font-bold">{audioMeter ? `${Math.round(audioMeter.peak * 100)}%` : "--"}</div>
          </div>
          <div className="rounded-lg border border-line bg-white/70 px-2 py-1.5">
            <div className="text-ink-400 uppercase tracking-wide">next window</div>
            <progress className="w-full h-2 accent-emerald-600" max={1} value={audioMeter?.window_progress ?? 0} />
          </div>
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-line bg-white/70 p-3 shadow-inner">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="label flex items-center gap-1"><Captions className="w-3.5 h-3.5" /> Live transcript</div>
          <div className="text-[10px] font-mono text-ink-400">{segments.length} segments</div>
        </div>
        <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
          {latest.length === 0 ? (
            <div className="text-xs text-ink-400 font-mono">{status === "unavailable" ? "transcription unavailable" : "awaiting speech..."}</div>
          ) : latest.map((segment) => (
            <div key={segment.id} className="text-[11px] leading-snug font-mono text-ink-800">
              <span className="text-ink-400">[{fmtTime(segment.t_start)}]</span>{" "}
              <span>{segment.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
