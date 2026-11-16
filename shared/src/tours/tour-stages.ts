/**
 * MDT-01: a multi-day tour is one tour, planned whole, whose stops mark where
 * each day's stage ends. The stages are read off the route in its order: the
 * first runs from the start to the first stage end, the next from there on,
 * the last to the end of the tour. Nothing about a stage is stored besides the
 * mark on its last stop, so the whole route and its stages cannot drift apart.
 * A tour without a mark is a day tour, as every tour saved before was.
 */

/** A day in minutes: the most one stage, and a day tour, is planned for. */
export const TOUR_DAY_MINUTES = 24 * 60;

/** The most stages a tour is split into, two months of days. */
export const MAX_TOUR_STAGES = 60;

/** A point as a stage end is read from: where it sits on the tour, and whether it steers only. */
interface StagePoint {
  role: 'start' | 'via' | 'end';
  shaping?: boolean;
  stage_end?: boolean;
}

/** Where a request's stage ends do not hold, and why. */
interface StageIssue {
  path: Array<string | number>;
  message: string;
}

/** How many stages the points make: one more than their stage ends, one for a day tour. */
export function tourStageCountOf(points: ReadonlyArray<{ stage_end?: boolean }>): number {
  return 1 + points.filter((point) => point.stage_end === true).length;
}

/** The longest moving time plus breaks a tour of so many stages is planned for: a day each. */
export function maxTourMinutesFor(stageCount: number): number {
  return Math.max(1, stageCount) * TOUR_DAY_MINUTES;
}

/**
 * Where a stage end may not sit: at the start or the end of the tour, which
 * begin and finish the first and the last stage anyway, and on a shaping
 * point, which is no stop to spend a night at. Beyond {@link MAX_TOUR_STAGES}
 * the tour is refused as a whole.
 */
export function tourStageIssues(points: readonly StagePoint[]): StageIssue[] {
  const issues: StageIssue[] = [];
  points.forEach((point, index) => {
    if (point.stage_end !== true) return;
    if (point.role !== 'via')
      issues.push({ path: ['waypoints', index, 'stage_end'], message: 'a stage ends at a stop between start and end' });
    else if (point.shaping === true)
      issues.push({ path: ['waypoints', index, 'stage_end'], message: 'a shaping point ends no stage' });
  });
  if (tourStageCountOf(points) > MAX_TOUR_STAGES)
    issues.push({ path: ['waypoints'], message: `a tour has at most ${MAX_TOUR_STAGES} stages` });
  return issues;
}

/** MDT-02: a stop a stage starts or ends at, as a list or a day plan places the stages. */
export interface TourStageStop {
  /** The point's own key, kept across saves; a stage is known by the key of the stop it starts at. */
  key: string;
  lat: number;
  lng: number;
}

/** A saved point as the stops between the stages are read from it. */
interface StoredStagePoint extends StagePoint {
  key?: string;
  lat: number;
  lng: number;
}

/**
 * MDT-02: the stops the stages of a multi-day tour run between, in route
 * order: the start, every stop that ends a stage, and the end, so stage `n`
 * runs from stop `n - 1` to stop `n`. A stage is put on a day by the key of
 * the stop it starts at, which a save keeps, so a stage end set or taken away
 * elsewhere leaves the other stages on their days. None for a day tour, and
 * none where a stop has no key yet (a point no save has kept), since such a
 * stage could not be found again.
 */
export function tourStageStopsOf(points: readonly StoredStagePoint[]): TourStageStop[] {
  if (points.length < 2 || tourStageCountOf(points) < 2) return [];
  const last = points.length - 1;
  const stops = points.filter((point, index) => index === 0 || index === last || point.stage_end === true);
  const keyed = stops.flatMap((point) => (point.key ? [{ key: point.key, lat: point.lat, lng: point.lng }] : []));
  return keyed.length === stops.length ? keyed : [];
}

/** The keys a stage can be put on a day by: those of the stops the stages start at, the last stop starting none. */
export function tourStageKeysOf(points: readonly StoredStagePoint[]): string[] {
  return tourStageStopsOf(points)
    .slice(0, -1)
    .map((stop) => stop.key);
}

/** Metres per degree of latitude: near enough to place a stop on its line. */
const METRES_PER_DEGREE = 111_320;
/**
 * How much farther than the nearest spot of the line a point may lie and
 * still be placed at an earlier pass: a route that comes by a point twice (out
 * and back) places it where it gets there first.
 */
const PASS_TOLERANCE_M = 30;

function metresFrom(vertex: readonly number[], lat: number, lng: number): number {
  const x = ((vertex[1] ?? 0) - lng) * Math.cos((lat * Math.PI) / 180);
  const y = (vertex[0] ?? 0) - lat;
  return Math.hypot(x, y) * METRES_PER_DEGREE;
}

/** The vertex of the line (`[lat, lng, …]` each) each point lies at, searching on from where the one before lay. */
export function vertexIndicesOf(
  points: ReadonlyArray<{ lat: number; lng: number }>,
  line: ReadonlyArray<readonly number[]>,
): number[] {
  const indices: number[] = [];
  let from = 0;
  for (const point of points) {
    let nearest = Infinity;
    for (let i = from; i < line.length; i++) nearest = Math.min(nearest, metresFrom(line[i], point.lat, point.lng));
    let index = from;
    for (let i = from; i < line.length; i++) {
      if (metresFrom(line[i], point.lat, point.lng) <= nearest + PASS_TOLERANCE_M) {
        index = i;
        break;
      }
    }
    indices.push(index);
    from = index;
  }
  return indices;
}

/** One stage of a multi-day tour on its line: which stage it is (from 0), and the vertices it runs between. */
export interface TourStageStretch {
  index: number;
  from: number;
  to: number;
}

/**
 * MDT-02: the stretch of a multi-day tour's line each stage runs, in route
 * order, from the stop it starts at to the stop the next one starts at, as the
 * map draws a day's stage and an export cuts it. A stage the stops do not place
 * on the line (one the line has not reached yet) is null; none for a day tour
 * or a line of less than two points.
 */
export function tourStageStretchesOf(
  stops: readonly TourStageStop[],
  line: ReadonlyArray<readonly number[]>,
): Array<TourStageStretch | null> {
  if (stops.length < 2 || line.length < 2) return [];
  const at = vertexIndicesOf(stops, line);
  return stops
    .slice(0, -1)
    .map((_, index) => (at[index + 1] > at[index] ? { index, from: at[index], to: at[index + 1] } : null));
}

/** MDT-02: the stretch of the one stage known by `stageKey`; null for a stage the tour no longer has or the line does not place. */
export function tourStageStretchOf(
  stops: readonly TourStageStop[],
  line: ReadonlyArray<readonly number[]>,
  stageKey: string | null | undefined,
): TourStageStretch | null {
  if (!stageKey) return null;
  const index = stops.findIndex((stop) => stop.key === stageKey);
  if (index < 0 || index >= stops.length - 1) return null;
  return tourStageStretchesOf(stops, line)[index] ?? null;
}
