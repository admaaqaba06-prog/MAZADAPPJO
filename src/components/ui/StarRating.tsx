import React, { useState } from 'react';
import { Star } from 'lucide-react';

/**
 * Shared star-rating primitive (E7 B2).
 *
 * Two modes, selected by whether `onChange` is passed:
 *  - Read mode:  `<StarRating value={4.3} count={12} />` — renders 5 stars with
 *                filled / partial / empty fills derived from `value`, plus an
 *                optional `(count)` and the numeric average.
 *  - Input mode: `<StarRating value={pick} onChange={setPick} />` — hover
 *                highlight + click to pick 1..5.
 *
 * Numbers only — no i18n inside; callers own any surrounding labels.
 */
export interface StarRatingProps {
  /** Current rating value (read: the average; input: the current pick). */
  value: number;
  /** When provided, the component is an interactive picker (1..5). */
  onChange?: (n: number) => void;
  /** Read mode: optional number of ratings shown as "(count)". */
  count?: number;
  /** Pixel size of each star. Default 16. */
  size?: number;
  /** Read mode: show the numeric average next to the stars. Default true. */
  showValue?: boolean;
  /** Extra classes on the wrapper. */
  className?: string;
}

const STARS = [1, 2, 3, 4, 5];

export const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  count,
  size = 16,
  showValue = true,
  className = '',
}) => {
  const [hover, setHover] = useState(0);
  const isInput = typeof onChange === 'function';
  const dim = `${size}px`;

  if (isInput) {
    const active = hover || value;
    return (
      <div className={`inline-flex items-center gap-0.5 ${className}`} dir="ltr">
        {STARS.map((n) => {
          const on = n <= active;
          return (
            <button
              key={n}
              type="button"
              aria-label={`${n}`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => onChange?.(n)}
              className="p-0.5 cursor-pointer transition-transform hover:scale-110 active:scale-95"
            >
              <Star
                style={{ width: dim, height: dim }}
                className={on ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}
              />
            </button>
          );
        })}
      </div>
    );
  }

  // Read mode — filled / partial / empty derived from the numeric value.
  const rounded = Math.max(0, Math.min(5, value || 0));
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} dir="ltr">
      {STARS.map((n) => {
        const fill = Math.max(0, Math.min(1, rounded - (n - 1))); // 0..1 for this star
        return (
          <span
            key={n}
            className="relative inline-block"
            style={{ width: dim, height: dim }}
          >
            <Star
              style={{ width: dim, height: dim }}
              className="absolute inset-0 text-gray-300"
            />
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star
                  style={{ width: dim, height: dim }}
                  className="text-amber-400 fill-amber-400"
                />
              </span>
            )}
          </span>
        );
      })}
      {showValue && (
        <span className="ml-1 text-xs font-black text-gray-700 tabular-nums">
          {rounded.toFixed(1)}
        </span>
      )}
      {typeof count === 'number' && (
        <span className="ml-0.5 text-[10px] font-bold text-gray-400 tabular-nums">
          ({count})
        </span>
      )}
    </span>
  );
};

export default StarRating;
