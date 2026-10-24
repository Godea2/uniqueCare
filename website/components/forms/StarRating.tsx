"use client";

import { Star } from "lucide-react";
import { useState } from "react";

export default function StarRating({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(5, (value || 0) + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(1, (value || 1) - 1));
    }
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Rating out of 5 stars"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "rating-err" : undefined}
        className="flex gap-1"
        onMouseLeave={() => setHover(0)}
        onKeyDown={onKey}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            tabIndex={value === n || (value === 0 && n === 1) ? 0 : -1}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full"
          >
            <Star
              className={`h-7 w-7 ${n <= shown ? "fill-amber-400 text-amber-400" : "text-line"}`}
              aria-hidden
            />
          </button>
        ))}
      </div>
      {error && (
        <p id="rating-err" className="mt-1 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
