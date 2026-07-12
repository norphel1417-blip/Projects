import clsx from "clsx";
import { useStore } from "../store";
import { Activity, History, BarChart3, Database, SlidersHorizontal, ShieldCheck } from "lucide-react";

const TABS = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "live", label: "Live Console", icon: Activity },
  { id: "sessions", label: "Sessions", icon: History },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "datasets", label: "Dataset Eval", icon: Database },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
] as const;

export default function TabNav() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  return (
    <div className="max-w-[1500px] mx-auto px-4 md:px-6 lg:px-8">
      <div className="flex items-end gap-1 -mb-px overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "group relative flex items-center gap-2 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.14em] rounded-t-xl border border-b-0 transition whitespace-nowrap",
                active
                  ? "nav-tab-active metal-gold-soft border-ink-700 text-white"
                  : "bg-silver-50/70 border-transparent text-ink-500 hover:text-ink-900 hover:bg-silver-100/90",
              )}
            >
              <Icon className={clsx("w-3.5 h-3.5", active ? "text-silver-100" : "text-ink-500 group-hover:text-ink-800")} />
              <span>{t.label}</span>
              {active && (
                <span className="nav-tab-underline absolute left-2 right-2 -bottom-px h-[2px] rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
