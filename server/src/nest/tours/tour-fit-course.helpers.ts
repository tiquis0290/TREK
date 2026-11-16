import { haversineMetres } from '../common/geo';
import type { FitCourse, FitCoursePoint, FitCourseRecord } from './tour-fit.codec';

/** A point of a tour's saved line, as the GPX export reads it; `ele` null where the line has no height. */
export interface TrackPoint {
  lat: number;
  lng: number;
  ele: number | null;
}

/**
 * The most points a course keeps. Garmin publishes no limit per device, but
 * watches load a course into a fixed memory budget and the older Forerunner,
 * fēnix and Edge models are reported to cut a course short or refuse it past
 * a few thousand points; the download also crosses the phone's Bluetooth link.
 * 2,000 points are about 38 KB of records, one every 50 m on a 100 km route,
 * and the line below keeps them where the route bends, so a footpath's shape
 * stays within a few metres. A shorter track passes untouched.
 */
export const FIT_COURSE_MAX_POINTS = 2000;

/** The most named stops a course carries; devices list course points in a short menu of their own. */
export const FIT_COURSE_MAX_STOPS = 100;

/** What a course is done as on the watch: the FIT `sport` and the steady speed (m/s) its times assume. */
interface FitSport {
  sport: number;
  speed: number;
}

const WALKING: FitSport = { sport: 11, speed: 1.2 };
const HIKING: FitSport = { sport: 17, speed: 1.1 };
const RUNNING: FitSport = { sport: 1, speed: 2.8 };
const CYCLING: FitSport = { sport: 2, speed: 5 };
const XC_SKIING: FitSport = { sport: 12, speed: 2.5 };
const PADDLING: FitSport = { sport: 19, speed: 1.4 };
const GENERIC: FitSport = { sport: 0, speed: 1.1 };

/**
 * The FIT sport for each activity the GPX export names (`gpxActivityOf`), so
 * both files say the same thing about a tour. Only the sports every Garmin
 * course takes; a finer kind (gravel, trail) has no course sport of its own.
 */
const FIT_SPORTS: Record<string, FitSport> = {
  walk: WALKING,
  food: WALKING,
  hiking: HIKING,
  running: RUNNING,
  trail_running: RUNNING,
  cycling: CYCLING,
  road_biking: CYCLING,
  gravel_cycling: CYCLING,
  mountain_biking: CYCLING,
  skiing: XC_SKIING,
  cross_country_skiing: XC_SKIING,
  backcountry_skiing: XC_SKIING,
  alpine_skiing: { sport: 13, speed: 4 },
  snowboarding: { sport: 14, speed: 4 },
  snowshoeing: { sport: 35, speed: 0.9 },
  kayaking: PADDLING,
  canoeing: PADDLING,
  stand_up_paddling: PADDLING,
  paddling: PADDLING,
  horseback_riding: { sport: 27, speed: 1.7 },
};

export function fitSportOf(activity: string): FitSport {
  return FIT_SPORTS[activity] ?? GENERIC;
}

const METRES_PER_DEGREE = 111_320;

/**
 * A point closer than this to its segment adds nothing a watch could show (a
 * fix is good to a few metres), so thinning stops there even below the cap.
 */
const MIN_OFFSET_M = 0.5;

/** Metres from `p` to the segment `a`–`b`, heights included where all three have one. */
function offsetFromSegment(p: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  const cosLat = Math.cos((p.lat * Math.PI) / 180);
  const toXyz = (q: TrackPoint) => [
    (q.lng - p.lng) * METRES_PER_DEGREE * cosLat,
    (q.lat - p.lat) * METRES_PER_DEGREE,
    p.ele !== null && a.ele !== null && b.ele !== null && q.ele !== null ? q.ele - p.ele : 0,
  ];
  const [ax, ay, az] = toXyz(a);
  const [bx, by, bz] = toXyz(b);
  const [dx, dy, dz] = [bx - ax, by - ay, bz - az];
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy + az * dz) / lengthSq)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy, az + t * dz);
}

/** The point between `from` and `to` (exclusive) furthest off their segment, and how far. */
function furthest(points: readonly TrackPoint[], from: number, to: number): { index: number; offset: number } {
  let best = { index: -1, offset: 0 };
  for (let i = from + 1; i < to; i++) {
    const offset = offsetFromSegment(points[i], points[from], points[to]);
    if (offset > best.offset) best = { index: i, offset };
  }
  return best;
}

/**
 * The indexes of the points a line keeps at `maxPoints`, in order: all of them
 * when it has no more, otherwise Douglas–Peucker run best first. Both ends are
 * kept, then the point furthest off its segment among all segments so far,
 * until the cap is reached or every point left lies within half a metre of
 * its segment. Unlike the
 * tolerance form it lands on the cap whatever the track, and unlike even
 * decimation it keeps a hairpin a stride would step over. Heights count in the
 * distance, so a summit on a straight ridge stays and the climb with it.
 */
export function thinTrack(points: readonly TrackPoint[], maxPoints = FIT_COURSE_MAX_POINTS): number[] {
  const n = points.length;
  if (n <= Math.max(2, maxPoints)) return points.map((_, i) => i);
  const kept = [0, n - 1];
  const open = [{ from: 0, to: n - 1, ...furthest(points, 0, n - 1) }];
  while (kept.length < maxPoints) {
    let pick = 0;
    for (let i = 1; i < open.length; i++) if (open[i].offset > open[pick].offset) pick = i;
    const segment = open[pick];
    if (!segment || segment.index < 0 || segment.offset < MIN_OFFSET_M) break;
    kept.push(segment.index);
    open.splice(pick, 1);
    open.push({ from: segment.from, to: segment.index, ...furthest(points, segment.from, segment.index) });
    open.push({ from: segment.index, to: segment.to, ...furthest(points, segment.index, segment.to) });
  }
  return kept.sort((a, b) => a - b);
}

/** Metres along the line at each of its points, measured over every point the tour saved. */
function distancesAlong(points: readonly TrackPoint[]): number[] {
  const along = [0];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    along.push(along[i - 1] + haversineMetres(a.lat, a.lng, b.lat, b.lng));
  }
  return along;
}

/** The index of the line's point nearest to `stop`. */
function nearestIndex(points: readonly TrackPoint[], stop: { lat: number; lng: number }): number {
  let best = 0;
  let bestM = Number.POSITIVE_INFINITY;
  points.forEach((point, i) => {
    const metres = haversineMetres(point.lat, point.lng, stop.lat, stop.lng);
    if (metres < bestM) [best, bestM] = [i, metres];
  });
  return best;
}

export interface TourFitInput {
  name: string;
  /** The activity as the GPX export names it (`gpxActivityOf`). */
  activity: string;
  /** The tour's whole saved line, as the GPX export writes it. */
  track: readonly TrackPoint[];
  /** The tour's named stops, the GPX file's waypoints. */
  stops: ReadonlyArray<{ name: string; lat: number; lng: number }>;
  /** The tour's own moving time in seconds, when it has one. */
  durationS: number | null;
  createdAt: Date;
  serial: number;
  maxPoints?: number;
}

/**
 * A tour as the course its FIT file holds, or null when its line has fewer
 * than two points. Distances are measured over the whole saved line, so the
 * course is as long as the GPX even where thinning straightened a wiggle. A
 * course carries times for the watch's virtual partner: the tour's own moving
 * time spread evenly along it, or without one the sport's steady speed. Each
 * named stop becomes a course point where the line passes nearest to it.
 */
export function tourFitCourse(input: TourFitInput): FitCourse | null {
  const { track } = input;
  if (track.length < 2) return null;
  const along = distancesAlong(track);
  const totalM = along[along.length - 1];
  const { sport, speed } = fitSportOf(input.activity);
  const totalS = input.durationS && input.durationS > 0 ? input.durationS : totalM / speed;
  const elapsedAt = (metres: number) => (totalM > 0 ? (metres / totalM) * totalS : 0);

  const records: FitCourseRecord[] = thinTrack(track, input.maxPoints).map((i) => ({
    ...track[i],
    distanceM: along[i],
    elapsedS: elapsedAt(along[i]),
  }));
  const coursePoints: FitCoursePoint[] = input.stops
    .map((stop) => {
      const distanceM = along[nearestIndex(track, stop)];
      return { name: stop.name, lat: stop.lat, lng: stop.lng, distanceM, elapsedS: elapsedAt(distanceM) };
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, FIT_COURSE_MAX_STOPS);

  return { name: input.name, sport, createdAt: input.createdAt, serial: input.serial, records, coursePoints };
}
