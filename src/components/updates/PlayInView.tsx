"use client";

import { useEffect, useRef } from "react";

/**
 * Plays the videos inside while they're on screen (all of them at once is
 * heavy) and pauses them off it. With reduced motion they keep their stills
 * and get controls, so people press play.
 */
export default function PlayInView({ className, children }: { className?: string; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const videos = [...(root.current?.querySelectorAll("video") ?? [])];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      videos.forEach((v) => { v.controls = true; });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      }
    }, { threshold: 0.35 });
    videos.forEach((v) => io.observe(v));
    return () => {
      io.disconnect();
      videos.forEach((v) => v.pause());
    };
  }, []);

  return <div ref={root} className={className}>{children}</div>;
}
