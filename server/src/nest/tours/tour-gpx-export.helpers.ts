import {
  haversineMetres,
  tourStageStopsOf,
  tourStageStretchesOf,
  vertexIndicesOf,
  type BikeProfile,
  type PaddleBoatType,
  type RunProfile,
  type SkiDiscipline,
} from '@trek/shared';

/** What GPX calls the activity in a track's <type>; a paddle tour says what it is paddled in. */
const PADDLE_ACTIVITY: Record<PaddleBoatType, string> = {
  kayak: 'kayaking',
  canoe: 'canoeing',
  sup: 'stand_up_paddling',
  other: 'paddling',
};

/** A bike tour says what it is ridden on, in the words Garmin and Strava read. */
const BIKE_ACTIVITY: Record<BikeProfile, string> = {
  touring: 'cycling',
  road: 'road_biking',
  gravel: 'gravel_cycling',
  mtb: 'mountain_biking',
};

/** RUN-01, RUN-02: a run says how it is run, in the same words. */
const RUN_ACTIVITY: Record<RunProfile, string> = {
  running: 'running',
  trail: 'trail_running',
};

/**
 * SKI-02: a ski tour says how it is done, in the same words: snowshoes make it
 * snowshoeing, and a winter hike is walked as any hike is. Without a known
 * discipline it is skiing.
 */
const SKI_ACTIVITY: Record<SkiDiscipline, string> = {
  alpine: 'alpine_skiing',
  snowboard: 'snowboarding',
  cross_country: 'cross_country_skiing',
  touring: 'backcountry_skiing',
  snowshoe: 'snowshoeing',
  winter_hike: 'hiking',
};

/** The activity a ride names in GPX (HOR-01), in the words Garmin reads. */
const HORSE_ACTIVITY = 'horseback_riding';

/**
 * The activity a tour's track names in GPX: a paddle tour its boat, a bike
 * tour and a run their profile, a ski tour its discipline (SKI-02), a ride
 * horseback riding (HOR-01) and a hike hiking; whatever is missing falls back
 * to the plainest.
 */
export function gpxActivityOf(tour: {
  tour_type: string;
  boat_type?: string | null;
  bike_profile?: string | null;
  run_profile?: string | null;
  ski_discipline?: string | null;
}): string {
  const { tour_type: type, boat_type: boat, bike_profile: bike } = tour;
  if (type === 'kayak') return PADDLE_ACTIVITY[(boat ?? 'other') as PaddleBoatType] ?? PADDLE_ACTIVITY.other;
  if (type === 'bike') return BIKE_ACTIVITY[(bike ?? 'touring') as BikeProfile] ?? BIKE_ACTIVITY.touring;
  if (type === 'run') return RUN_ACTIVITY[(tour.run_profile ?? 'running') as RunProfile] ?? RUN_ACTIVITY.running;
  if (type === 'ski') return SKI_ACTIVITY[tour.ski_discipline as SkiDiscipline] ?? 'skiing';
  if (type === 'horse') return HORSE_ACTIVITY;
  return type === 'hike' ? 'hiking' : type;
}

/**
 * The sport a tour's FIT course names, as the FIT profile numbers its `sport`
 * enum: the watch shows it and picks its activity profile by it. By tour type
 * alone; a type without a FIT sport of its own is generic (0).
 */
const FIT_SPORT = new Map<string, number>([
  ['run', 1], // running
  ['bike', 2], // cycling
  ['walk', 11], // walking
  ['ski', 12], // cross_country_skiing
  ['hike', 17], // hiking
  ['kayak', 19], // paddling
]);

export function fitSportOf(tourType: string): number {
  return FIT_SPORT.get(tourType) ?? 0;
}

/** MDT-02: one stage of a multi-day tour as its files cut it. */
export interface TourStageCut {
  /** The key of the stop the stage starts at, which a day holding it names. */
  key: string;
  /** Which stage it is, from 1, of `count`. */
  number: number;
  count: number;
  /** The vertices of the saved line it runs between. */
  from: number;
  to: number;
  /** Its stretch of the saved line, as JSON like the line itself. */
  route_geometry: string;
  /** Its length in whole metres. */
  distance_m: number;
}

/** A saved line as the points it holds (`[lat, lng, ele?]`), leaving out any entry that is no point. */
function savedLineOf(raw: string | null): number[][] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is number[] =>
      Array.isArray(entry) && entry.length >= 2 && Number.isFinite(entry[0]) && Number.isFinite(entry[1]),
  );
}

function lengthOf(line: readonly number[][]): number {
  let metres = 0;
  for (let i = 1; i < line.length; i++)
    metres += haversineMetres(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
  return metres;
}

/**
 * MDT-02: the stages of a multi-day tour as its files cut them, each the
 * stretch of the saved line from the stop it starts at to the stop the next one
 * starts at, the stretch the map draws for the day. None for a day tour; a
 * stage the line does not reach yet is left out.
 */
export function tourStageCutsOf(
  points: Parameters<typeof tourStageStopsOf>[0],
  routeGeometry: string | null,
): TourStageCut[] {
  const stops = tourStageStopsOf(points);
  const line = savedLineOf(routeGeometry);
  return tourStageStretchesOf(stops, line).flatMap((stretch) => {
    if (!stretch) return [];
    const part = line.slice(stretch.from, stretch.to + 1);
    return [
      {
        key: stops[stretch.index].key,
        number: stretch.index + 1,
        count: stops.length - 1,
        from: stretch.from,
        to: stretch.to,
        route_geometry: JSON.stringify(part),
        distance_m: Math.round(lengthOf(part)),
      },
    ];
  });
}

/** The named stops of a tour that lie on one stage's stretch of its line, in their order. */
export function stopsOnStage<T extends { lat: number; lng: number }>(
  stops: readonly T[],
  routeGeometry: string | null,
  stage: Pick<TourStageCut, 'from' | 'to'>,
): T[] {
  const at = vertexIndicesOf(stops, savedLineOf(routeGeometry));
  return stops.filter((_, index) => at[index] >= stage.from && at[index] <= stage.to);
}

/** A stage's name: its number first, so a watch that cuts a course's name short still tells the stages apart. */
export function tourStageName(tourName: string, stage: Pick<TourStageCut, 'number' | 'count'> | null): string {
  return stage ? `${stage.number}/${stage.count} ${tourName}` : tourName;
}

/**
 * MDT-02: the serial number of a tour's FIT course, one of its own for each
 * tour and each of its stages, so a watch that downloads the stages one after
 * another keeps each rather than taking them for one file. Never 0.
 */
export function fitSerialOf(placeId: number, stage: Pick<TourStageCut, 'number'> | null): number {
  return ((placeId * 64 + (stage?.number ?? 0)) % 0xffffffff) + 1;
}
