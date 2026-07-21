/**
 * A celebration, fired when a goal reaches 100%. The library is loaded lazily so
 * it never lands in the SSR bundle, and the whole thing is a no-op when there's
 * no window (SSR).
 *
 * It fires regardless of `prefers-reduced-motion` — a deliberate choice for this
 * app, where crossing a goal off is the whole point and deserves the full
 * moment. (canvas-confetti's own `disableForReducedMotion` defaults off; we keep
 * it that way rather than gating the burst ourselves.)
 *
 * Rather than a single pop, it fires a handful of bursts spaced by random gaps,
 * so the celebration builds and trails off instead of firing all at once.
 */

/** How many bursts a celebration fires — a random count in this inclusive range. */
const MIN_BURSTS = 5;
const MAX_BURSTS = 7;
/** Random gap between consecutive bursts, in milliseconds. */
const MIN_GAP_MS = 100;
const MAX_GAP_MS = 750;

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function celebrate(): Promise<void> {
  if (typeof window === "undefined") return;

  const confetti = (await import("canvas-confetti")).default;

  // Two side cannons angled inward, fired together for a fuller spread than a
  // single centre burst.
  const fireBurst = () => {
    const shared = { particleCount: 60, spread: 70, startVelocity: 45, ticks: 200 };
    confetti({ ...shared, angle: 60, origin: { x: 0, y: 0.7 } });
    confetti({ ...shared, angle: 120, origin: { x: 1, y: 0.7 } });
  };

  const bursts = Math.round(randomBetween(MIN_BURSTS, MAX_BURSTS));
  for (let i = 0; i < bursts; i++) {
    fireBurst();
    // Pause before the next one — skip the wait after the last burst.
    if (i < bursts - 1) await delay(randomBetween(MIN_GAP_MS, MAX_GAP_MS));
  }
}
