"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Full-bleed background video for hero sections, with a left-weighted
 * deep-navy gradient overlay so the text column keeps AA contrast.
 * When `sources` is provided, the clips rotate continuously: on `ended`
 * the video fades out (~700ms), the next source is loaded and played,
 * then it fades back in, wrapping to the first clip after the last.
 * Pauses playback (poster only, first clip) for users who prefer reduced motion.
 */
export default function HeroVideo({
  src,
  poster,
  sources,
}: {
  src: string;
  poster: string;
  sources?: string[];
}) {
  const playlist = useMemo(() => (sources && sources.length > 0 ? sources : [src]), [sources, src]);
  const rotating = playlist.length > 1;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      const v = videoRef.current;
      if (!v) return;
      if (mq.matches) {
        v.pause();
      } else {
        v.play().catch(() => {});
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Crossfade to the next clip when the current one ends.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !rotating) return;
    let timer: number | undefined;
    const onEnded = () => {
      setFading(true);
      timer = window.setTimeout(() => {
        setIndex((i) => (i + 1) % playlist.length);
      }, 700);
    };
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("ended", onEnded);
      window.clearTimeout(timer);
    };
  }, [rotating, playlist.length]);

  // Swap the source imperatively so React doesn't reset playback.
  const startedRef = useRef(false);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !rotating) return;
    if (index === 0 && !startedRef.current) return;
    startedRef.current = true;
    const onPlaying = () => setFading(false);
    v.addEventListener("playing", onPlaying);
    v.src = playlist[index];
    v.load();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.play().catch(() => {});
    } else {
      setFading(false);
    }
    return () => v.removeEventListener("playing", onPlaying);
  }, [index, rotating, playlist]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        muted
        loop={!rotating}
        playsInline
        preload="metadata"
        poster={poster}
        aria-hidden="true"
        src={playlist[0]}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          fading ? "opacity-0" : "opacity-100"
        }`}
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-[rgba(10,37,64,0.82)] via-[rgba(10,37,64,0.55)] to-[rgba(10,37,64,0.25)]"
        aria-hidden
      />
      {rotating && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
          {playlist.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
                i === index ? "bg-white" : "bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </>
  );
}
