/**
 * A one-shot celebration burst, fired when a goal reaches 100%. The library is
 * loaded lazily so it never lands in the SSR bundle, and the whole thing is a
 * no-op when the user asks for reduced motion or when there's no window (SSR).
 */
export async function celebrate(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const confetti = (await import("canvas-confetti")).default;

  // Two side cannons angled inward, fired together for a fuller spread than a
  // single centre burst.
  const shared = { particleCount: 60, spread: 70, startVelocity: 45, ticks: 200 };
  confetti({ ...shared, angle: 60, origin: { x: 0, y: 0.7 } });
  confetti({ ...shared, angle: 120, origin: { x: 1, y: 0.7 } });
}
