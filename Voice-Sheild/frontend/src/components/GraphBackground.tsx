import { useEffect, useRef } from "react";

interface Props {
  /** dark=true fills the canvas with the landing page gradient; false = transparent */
  dark?: boolean;
}

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number; // sine-wave phase for pulsing
  ps: number;    // phase speed
}

export default function GraphBackground({ dark = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let W = 0;
    let H = 0;
    const nodes: Node[] = [];

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const spawn = () => {
      nodes.length = 0;
      const count = Math.min(90, Math.max(55, Math.floor((W * H) / 16000)));
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          // Very slow drift — crosses full screen in ~60-120 seconds at 60fps
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          r: 1.4 + Math.random() * 2.8,
          phase: Math.random() * Math.PI * 2,
          // Pulse period = 6-14 seconds
          ps: 0.0075 / (1 + Math.random() * 1.2),
        });
      }
    };

    const MAX_DIST = 270;

    const frame = () => {
      const isDark = darkRef.current;
      ctx.clearRect(0, 0, W, H);

      // ── Background fill (landing only) ───────────────────────────
      if (isDark) {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0,    "#0c0f14");
        bg.addColorStop(0.45, "#161d28");
        bg.addColorStop(1,    "#242e3e");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Move nodes ───────────────────────────────────────────────
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        n.phase += n.ps;
        if (n.x < 0 || n.x > W) { n.vx *= -1; n.x = Math.max(0, Math.min(W, n.x)); }
        if (n.y < 0 || n.y > H) { n.vy *= -1; n.y = Math.max(0, Math.min(H, n.y)); }
      }

      // ── Color config ─────────────────────────────────────────────
      const rgb   = isDark ? "210,216,228" : "40,48,62";
      const eAlpha = isDark ? 0.22 : 0.20;  // max edge alpha
      const nBase  = isDark ? 0.62 : 0.52;  // node base alpha

      // ── Edges ────────────────────────────────────────────────────
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d  = Math.hypot(dx, dy);
          if (d < MAX_DIST) {
            // Edge alpha scales with proximity AND the average node pulse
            const prox   = 1 - d / MAX_DIST;
            const pAvg   = ((Math.sin(nodes[i].phase) + Math.sin(nodes[j].phase)) / 2 + 1) * 0.5;
            const alpha  = (eAlpha * prox * (0.65 + pAvg * 0.55)).toFixed(3);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(${rgb},${alpha})`;
            ctx.lineWidth   = 0.6 + prox * 0.5;
            ctx.stroke();
          }
        }
      }

      // ── Nodes ────────────────────────────────────────────────────
      for (const n of nodes) {
        const pulse = (Math.sin(n.phase) + 1) * 0.5; // 0..1
        const alpha = nBase * (0.58 + pulse * 0.62);
        const r     = n.r * (1 + pulse * 0.28);

        // Soft glow halo
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 9);
        glow.addColorStop(0, `rgba(${rgb},${(alpha * 0.22).toFixed(3)})`);
        glow.addColorStop(1, `rgba(${rgb},0)`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 9, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Solid core
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };

    resize();
    spawn();
    frame();

    const onResize = () => { resize(); spawn(); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);   // intentionally [] — darkRef tracks live dark prop without restart

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none graph-bg-canvas"
      aria-hidden="true"
    />
  );
}
