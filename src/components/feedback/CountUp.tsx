import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion/react';

type CountUpProps = {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
  className?: string;
};

/**
 * Animated number transition: when `value` changes, smoothly counts from the
 * previous value to the new one. Ease-out, no springs. Used for auction prices.
 */
export default function CountUp({
  value,
  durationMs = 600,
  format = (n: number) => String(Math.round(n)),
  className,
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    const from = prevValue.current;
    prevValue.current = value;
    if (from === value) return;

    const controls = animate(from, value, {
      duration: durationMs / 1000,
      ease: 'easeOut',
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [value, durationMs]);

  return <span className={className}>{format(display)}</span>;
}
