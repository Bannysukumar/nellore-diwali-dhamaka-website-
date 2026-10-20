import { useMemo } from "react";
import { motion } from "framer-motion";
import type { WheelSegment } from "@/types";
import { cn } from "@/utils/cn";

/**
 * Purely presentational spin wheel.
 *
 * The winning segment is chosen by the backend and passed in as `resultSegmentId`.
 * This component never decides an outcome — it only animates the reveal, so the
 * browser cannot influence or spoof a prize.
 */
export function SpinWheel({
  segments,
  resultSegmentId,
  spinning,
  size = 320,
  className,
}: {
  segments: WheelSegment[];
  resultSegmentId?: string | null;
  spinning?: boolean;
  size?: number;
  className?: string;
}) {
  const view = useMemo(() => buildWheel(segments), [segments]);
  const winnerIndex = resultSegmentId
    ? segments.findIndex((segment) => segment.id === resultSegmentId)
    : -1;

  const slice = view.count ? 360 / view.count : 0;
  /* Rotate so the winning slice lands under the pointer at the top (12 o'clock).
     Extra full turns make the reveal feel earned without implying control. */
  const targetRotation =
    winnerIndex >= 0 ? -(winnerIndex * slice + slice / 2) + 360 * 5 : 360 * 2;

  return (
    <div className={cn("relative mx-auto", className)} style={{ width: size, maxWidth: "100%" }}>
      {/* Pointer */}
      <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1">
        <div className="size-0 border-x-[9px] border-t-[16px] border-x-transparent border-t-maroon-deep drop-shadow" />
      </div>

      <motion.div
        className="relative aspect-square w-full"
        initial={false}
        animate={{ rotate: spinning && winnerIndex >= 0 ? targetRotation : 0 }}
        transition={
          spinning
            ? { duration: 3.4, ease: [0.16, 0.72, 0.24, 1] }
            : { duration: 0 }
        }
      >
        <svg
          viewBox="0 0 200 200"
          role="img"
          aria-label="Festival spin wheel"
          className="size-full drop-shadow-[0_18px_40px_-24px_rgba(101,27,36,0.7)]"
        >
          <circle cx="100" cy="100" r="98" fill="#651B24" />
          <circle cx="100" cy="100" r="92" fill="#FFF9ED" />
          {view.count ? (
            view.slices.map((s, index) => {
              const start = (index * 360) / view.count;
              const end = ((index + 1) * 360) / view.count;
              const d = describeSlice(100, 100, 90, start, end);
              const labelAngle = start + (end - start) / 2;
              const rad = (labelAngle - 90) * (Math.PI / 180);
              const lx = 100 + Math.cos(rad) * 58;
              const ly = 100 + Math.sin(rad) * 58;
              return (
                <g key={s.id}>
                  <path d={d} fill={s.color} stroke="#FFF9ED" strokeWidth="0.75" />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${labelAngle} ${lx} ${ly})`}
                    className="font-semibold"
                    style={{ fontSize: 7.5, fill: "#FFF9ED", letterSpacing: "0.02em" }}
                  >
                    {truncate(s.label, 12)}
                  </text>
                </g>
              );
            })
          ) : (
            <circle cx="100" cy="100" r="90" fill="#E8E0D0" />
          )}
          <circle cx="100" cy="100" r="17" fill="#651B24" stroke="#D4AF37" strokeWidth="2.5" />
          {view.count ? (
            <text
              x="100"
              y="100"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 9, fill: "#F3E3AD", fontWeight: 700 }}
            >
              🪔
            </text>
          ) : null}
        </svg>
      </motion.div>
    </div>
  );
}

interface SliceView {
  id: string;
  label: string;
  color: string;
}

function buildWheel(segments: WheelSegment[]): { count: number; slices: SliceView[] } {
  const active = segments.filter((s) => s.active && s.weight > 0);
  return {
    count: active.length,
    slices: active.map((s) => ({ id: s.id, label: s.label, color: s.color })),
  };
}

/** SVG path for a pie slice centred on (cx, cy) between two angles (degrees). */
function describeSlice(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toPoint = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const a = toPoint(startDeg);
  const b = toPoint(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${a.x.toFixed(3)} ${a.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${b.x.toFixed(
    3,
  )} ${b.y.toFixed(3)} Z`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
