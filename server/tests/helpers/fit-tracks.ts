/**
 * A long, deterministic hiking line for the FIT course tests: a loop of about
 * 40 km in the Wetterstein foothills that winds as a footpath does, climbs to
 * a summit and back, and carries a couple of metres of GPS-like jitter, sampled as densely
 * as a recorded track. Long enough that the course writer has to thin it.
 */
export function longHikeTrack(points: number): Array<{ lat: number; lng: number; ele: number }> {
  // A small linear congruential generator: the same jitter on every run.
  let seed = 20260801;
  const jitter = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31 - 0.5;
  };
  const metre = 1 / 111_320;
  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const turn = 2 * Math.PI * t;
    return {
      lat: 47.42 + 0.03 * Math.sin(turn) + 0.002 * Math.sin(37 * turn) + jitter() * 4 * metre,
      lng: 10.98 + 0.045 * (1 - Math.cos(turn)) + 0.0015 * Math.cos(23 * turn) + jitter() * 4 * metre,
      ele: Math.round((1200 + 600 * Math.sin(Math.PI * t) ** 2 + 25 * Math.sin(41 * turn)) * 10) / 10,
    };
  });
}
