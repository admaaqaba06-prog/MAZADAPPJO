import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';

type ConfettiProps = {
  fire: boolean;
  pieceCount?: number;
  onDone?: () => void;
};

const COLORS = ['#F05123', '#F5B301', '#16A34A', '#FFFFFF'];
const DURATION_S = 1.4;

/** Deterministic-ish pseudo-random in [0, 1) derived from an index + salt. */
function pseudo(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Piece = {
  id: number;
  color: string;
  x: number; // horizontal travel (vw-ish %)
  y: number; // vertical fall distance (vh-ish %)
  rotate: number;
  size: number;
  delay: number;
  round: boolean;
};

/**
 * One-shot celebratory burst — pure motion + divs, no canvas dependency.
 * Particles fly outward from the center, fall with rotation, and fade out
 * over ~1.4s; then `onDone` fires and nothing is rendered.
 */
export default function Confetti({ fire, pieceCount = 80, onDone }: ConfettiProps) {
  const [burstId, setBurstId] = useState(0);
  const [active, setActive] = useState(false);
  const prevFire = useRef(fire);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (fire && !prevFire.current) {
      setBurstId((b) => b + 1);
      setActive(true);
    }
    prevFire.current = fire;
  }, [fire]);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      setActive(false);
      onDoneRef.current?.();
    }, DURATION_S * 1000 + 100);
    return () => clearTimeout(timer);
  }, [active, burstId]);

  const pieces = useMemo<Piece[]>(() => {
    if (!active) return [];
    return Array.from({ length: pieceCount }, (_, i) => {
      const angle = (i / pieceCount) * Math.PI * 2 + pseudo(i, burstId) * 0.6;
      const power = 22 + pseudo(i, burstId + 1) * 34; // burst radius
      return {
        id: i,
        color: COLORS[i % COLORS.length],
        x: Math.cos(angle) * power,
        y: Math.abs(Math.sin(angle)) * -power * 0.6 + 40 + pseudo(i, burstId + 2) * 35,
        rotate: (pseudo(i, burstId + 3) - 0.5) * 720,
        size: 6 + pseudo(i, burstId + 4) * 6,
        delay: pseudo(i, burstId + 5) * 0.12,
        round: i % 3 === 0,
      };
    });
  }, [active, burstId, pieceCount]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
    >
      {pieces.map((p) => (
        <motion.div
          key={`${burstId}-${p.id}`}
          className="absolute left-1/2 top-1/2"
          style={{
            width: p.size,
            height: p.round ? p.size : p.size * 0.55,
            backgroundColor: p.color,
            borderRadius: p.round ? '9999px' : '2px',
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
          animate={{
            x: `${p.x}vw`,
            y: `${p.y}vh`,
            rotate: p.rotate,
            opacity: [1, 1, 0],
            scale: [1, 1, 0.7],
          }}
          transition={{
            duration: DURATION_S,
            delay: p.delay,
            ease: 'easeOut',
            opacity: { duration: DURATION_S, times: [0, 0.6, 1], ease: 'easeOut' },
          }}
        />
      ))}
    </div>
  );
}
