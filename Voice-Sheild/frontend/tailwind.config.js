/** @type {import('tailwindcss').Config} */
// Forensic monochrome palette. Token name `gold` is preserved for backward
// compatibility with existing components, but its values are now graphite/steel
// shades so the UI reads as an industrial light/dark hybrid (no warm hues).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#eef0f3",
        surface: "#ffffff",
        surface2: "#f5f6f8",
        line: "#dfe2e7",
        ink: {
          900: "#0e1116",
          700: "#23262c",
          500: "#52575f",
          400: "#727781",
          300: "#9aa0a8",
        },
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          400: "#6366f1",
          500: "#4f46e5",
          600: "#4338ca",
          700: "#3730a3",
          900: "#1e1b4b",
        },
        navy: {
          50: "#eef1f5",
          500: "#2a3038",
          700: "#1f242c",
          900: "#13151a",
        },
        // Risk colours: muted, forensic. Single accent only when truly high.
        risk: {
          low: "#3f6a55",
          lowBg: "#eef2ef",
          med: "#6b6356",
          medBg: "#f1efeb",
          high: "#7a3340",
          highBg: "#f1ecee",
        },
        accent: {
          cyan: "#3f7886",
          violet: "#5e6373",
          amber: "#7a6f56",
          rose: "#7a3340",
        },
        // Backwards-compat: `gold-*` now maps to a graphite/steel scale.
        gold: {
          50:  "#f5f6f8",
          100: "#e9ecef",
          200: "#dde0e4",
          300: "#c4c8cf",
          400: "#9aa0a8",
          500: "#727781",
          600: "#52575f",
          700: "#3a3e45",
          900: "#13151a",
        },
        silver: {
          50:  "#f7f9fc",
          100: "#eef2f7",
          200: "#dde3ec",
          300: "#c2cad6",
          400: "#a4adbc",
          500: "#8a96a8",
          600: "#6c7585",
          700: "#4f5664",
          900: "#262b34",
        },
        steel: {
          50:  "#f5f6f8",
          100: "#e9ecef",
          200: "#dde0e4",
          300: "#c4c8cf",
          400: "#9aa0a8",
          500: "#727781",
          600: "#52575f",
          700: "#3a3e45",
          800: "#23262c",
          900: "#13151a",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,17,22,0.04), 0 6px 18px -10px rgba(15,17,22,0.10)",
        cardLg: "0 2px 6px -2px rgba(15,17,22,0.06), 0 18px 36px -18px rgba(15,17,22,0.18)",
        glowBrand: "0 0 0 3px rgba(82,87,95,0.10), 0 10px 24px -10px rgba(35,38,44,0.30)",
        glowDanger: "0 0 0 3px rgba(122,51,64,0.10), 0 12px 28px -10px rgba(122,51,64,0.25)",
        glowSafe: "0 0 0 3px rgba(63,106,85,0.10), 0 10px 24px -10px rgba(63,106,85,0.22)",
        glowGold: "0 0 0 3px rgba(82,87,95,0.10), 0 12px 26px -10px rgba(35,38,44,0.32)",
        glowSilver: "0 0 0 3px rgba(154,160,168,0.14), 0 12px 26px -10px rgba(82,87,95,0.30)",
      },
      backgroundImage: {
        "mesh-light":
          "radial-gradient(900px 460px at 12% -10%, rgba(35,38,44,0.05), transparent 60%), radial-gradient(800px 380px at 110% 0%, rgba(114,119,129,0.05), transparent 55%)",
        "grid-faint":
          "linear-gradient(to right, rgba(15,17,22,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,17,22,0.04) 1px, transparent 1px)",
        "grid-strict":
          "linear-gradient(to right, rgba(15,17,22,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,17,22,0.06) 1px, transparent 1px)",
      },
      keyframes: {
        "pulse-ring": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(122,51,64,0.30)" },
          "50%": { boxShadow: "0 0 0 10px rgba(122,51,64,0)" },
        },
        "pulse-ring-safe": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(63,106,85,0.22)" },
          "50%": { boxShadow: "0 0 0 8px rgba(63,106,85,0)" },
        },
        "flow-dot": {
          "0%": { transform: "translateX(0)", opacity: "0" },
          "15%": { opacity: "0.7" },
          "85%": { opacity: "0.7" },
          "100%": { transform: "translateX(100%)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 3.2s ease-out infinite",
        "pulse-ring-safe": "pulse-ring-safe 4s ease-out infinite",
        "flow-dot": "flow-dot 4s linear infinite",
        shimmer: "shimmer 6s linear infinite",
        "fade-up": "fade-up 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};
