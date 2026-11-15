import { RESERVATION_METADATA } from '../../db/json-columns';
import type { PublicApiTourColumns } from '../../db/repositories/place-public-api-rows';
import type { PublicApiEndpointRow } from '../../db/repositories/reservation-public-api-rows';
import { decodeJson } from '../../utils/json-column';
import { decodePolyline } from '../../utils/polyline';
import type { TourStageFacts } from './tour-files.interface';
import type {
  PublicApiPlace,
  PublicApiReservationEndpoint,
  PublicApiTransitLeg,
  PublicApiTransitLegStop,
} from '@trek/shared';

import { z } from 'zod';

/**
 * The pure halves of the public API's tour and transit fields: what a stored row
 * becomes on the wire. Kept apart from the service so each rule has one home and
 * a test that does not need a database.
 */

/**
 * Where an integration fetches a tour's route as a file. A path on this instance, resolved against the caller's base URL;
 * a stage of a multi-day tour (MDT-02) is asked for by the key of the stop it starts at.
 */
function tourFilePath(tripId: number, placeId: number, format: 'gpx' | 'fit', stageKey?: string): string {
  const path = `/api/v1/trips/${tripId}/tours/${placeId}/${format}`;
  return stageKey === undefined ? path : `${path}?stage=${encodeURIComponent(stageKey)}`;
}

/**
 * A place's tour fields. A place without a tour row has none of them; a tour
 * without a line of its own has no file links, because the file routes would
 * only refuse it. The length is stored in kilometres and goes out in whole
 * metres. On a day that holds one stage of a multi-day tour (MDT-02), the links
 * serve that stage and the length is the stage's.
 */
export function tourFieldsOf(
  tripId: number,
  row: PublicApiTourColumns,
  stage: TourStageFacts | null = null,
): Pick<PublicApiPlace, 'gpx_url' | 'fit_url' | 'tour_type' | 'distance_m' | 'tour_stage'> {
  if (!row.tour_type) return { gpx_url: null, fit_url: null, tour_type: null, distance_m: null, tour_stage: null };
  if (stage && row.has_route) {
    return {
      gpx_url: tourFilePath(tripId, row.place_id, 'gpx', stage.key),
      fit_url: tourFilePath(tripId, row.place_id, 'fit', stage.key),
      tour_type: row.tour_type,
      distance_m: stage.distance_m,
      tour_stage: { number: stage.number, count: stage.count },
    };
  }
  const km = row.tour_distance_km;
  return {
    gpx_url: row.has_route ? tourFilePath(tripId, row.place_id, 'gpx') : null,
    fit_url: row.has_route ? tourFilePath(tripId, row.place_id, 'fit') : null,
    tour_type: row.tour_type,
    distance_m: typeof km === 'number' && Number.isFinite(km) && km >= 0 ? Math.round(km * 1000) : null,
    tour_stage: null,
  };
}

const ENDPOINT_ROLES = new Set<string>(['from', 'stop', 'to']);

/**
 * The points of every booking, grouped by booking in the order the read sorted
 * them (by `sequence`). A row with a role outside the three TREK writes is left
 * out rather than passed on under a value the contract does not name.
 */
export function endpointsByReservation(
  rows: readonly PublicApiEndpointRow[],
): Map<number, PublicApiReservationEndpoint[]> {
  const grouped = new Map<number, PublicApiReservationEndpoint[]>();
  for (const row of rows) {
    if (!ENDPOINT_ROLES.has(row.role)) continue;
    const endpoint: PublicApiReservationEndpoint = {
      role: row.role as PublicApiReservationEndpoint['role'],
      name: row.name,
      code: row.code ?? null,
      lat: row.lat,
      lng: row.lng,
      local_date: row.local_date ?? null,
      local_time: row.local_time ?? null,
    };
    const bucket = grouped.get(row.reservation_id);
    if (bucket) bucket.push(endpoint);
    else grouped.set(row.reservation_id, [endpoint]);
  }
  return grouped;
}

const text = z.string().nullable().optional().catch(null);
const count = z.number().nullable().optional().catch(null);
const latitude = z.number().min(-90).max(90).nullable().optional().catch(null);
const longitude = z.number().min(-180).max(180).nullable().optional().catch(null);

/**
 * One end of a leg as `buildTransitReservationParts` stores it. Journeys saved
 * before the stop's place was stored with it have no `lat`/`lng`.
 */
const storedLegStopSchema = z
  .object({ name: text, time: text, track: text, lat: latitude, lng: longitude })
  .nullable()
  .optional()
  .catch(null);

/**
 * A leg as `buildTransitReservationParts` (`transit-itinerary.helpers.ts`)
 * stores it in `metadata.transit.legs`. Lenient field by field, because the
 * column is free-form and older journeys may lack a field: a missing or
 * mistyped one reads as null, and only a leg without a mode is dropped.
 */
const storedLegSchema = z.object({
  mode: z.string().min(1),
  line: text,
  headsign: text,
  agency: text,
  duration: count,
  stops: count,
  from: storedLegStopSchema,
  to: storedLegStopSchema,
  geometry: text,
  geometry_precision: count,
});

type StoredLeg = z.infer<typeof storedLegSchema>;

/** `metadata.transit`: only the list of legs is read here, each leg on its own. */
const storedTransitSchema = z.object({ legs: z.array(z.unknown()) });

/** A place on the map, checked to be one. */
interface Point {
  lat: number;
  lng: number;
}

/** The precision the transit backends encode a leg's line with when the leg does not say. */
const DEFAULT_GEOMETRY_PRECISION = 5;

function pointOf(lat: unknown, lng: unknown): Point | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * The first and last point of a leg's drawn line, decoded with the precision it
 * was encoded with. A line that does not decode to valid points gives neither.
 */
function geometryEnds(leg: StoredLeg): { first: Point | null; last: Point | null } {
  if (!leg.geometry) return { first: null, last: null };
  const precision = leg.geometry_precision;
  const valid = typeof precision === 'number' && Number.isInteger(precision) && precision >= 1 && precision <= 10;
  const points = decodePolyline(leg.geometry, valid ? precision : DEFAULT_GEOMETRY_PRECISION);
  const first = points[0];
  const last = points[points.length - 1];
  return { first: first ? pointOf(first[0], first[1]) : null, last: last ? pointOf(last[0], last[1]) : null };
}

/**
 * Where each end of each leg is. Its stored place when the journey has one, else
 * the matching end of the leg's drawn line. A leg with neither (a walk is often
 * stored without a line) borrows from its neighbours: it starts where the
 * previous leg ends and ends where the next one starts, and the first and last
 * leg fall back to the booking's own start and destination.
 */
function legEnds(legs: readonly StoredLeg[], endpoints: readonly PublicApiReservationEndpoint[]) {
  const own = legs.map((leg) => {
    const line = geometryEnds(leg);
    return {
      from: pointOf(leg.from?.lat, leg.from?.lng) ?? line.first,
      to: pointOf(leg.to?.lat, leg.to?.lng) ?? line.last,
    };
  });
  const start = endpoints.find((point) => point.role === 'from');
  const destination = endpoints.find((point) => point.role === 'to');
  const bookingStart = start ? pointOf(start.lat, start.lng) : null;
  const bookingEnd = destination ? pointOf(destination.lat, destination.lng) : null;
  return own.map((ends, i) => ({
    from: ends.from ?? (i > 0 ? own[i - 1].to : bookingStart),
    to: ends.to ?? (i < own.length - 1 ? own[i + 1].from : bookingEnd),
  }));
}

function legStop(stop: StoredLeg['from'], at: Point | null): PublicApiTransitLegStop {
  return {
    name: stop?.name ?? null,
    time: stop?.time ?? null,
    track: stop?.track ?? null,
    lat: at?.lat ?? null,
    lng: at?.lng ?? null,
  };
}

/**
 * The legs of a public transport journey, read from the booking's metadata, with
 * the booking's own points (`endpoints`) to place the ends nothing else places.
 *
 * Field by field, never the stored object: the leg also holds its drawn line
 * and the line's colours, which the contract leaves out; the line is read here
 * only to place the leg's ends. A booking without a journey, or whose metadata
 * does not decode, has no legs.
 */
export function transitLegsOf(
  metadata: string | null,
  endpoints: readonly PublicApiReservationEndpoint[] = [],
): PublicApiTransitLeg[] {
  if (!metadata) return [];
  const transit = storedTransitSchema.safeParse(decodeJson(RESERVATION_METADATA, metadata, 'public api').transit);
  if (!transit.success) return [];
  const legs = transit.data.legs.flatMap((raw) => {
    const parsed = storedLegSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  const ends = legEnds(legs, endpoints);
  return legs.map((leg, i) => ({
    mode: leg.mode,
    line: leg.line ?? null,
    headsign: leg.headsign ?? null,
    agency: leg.agency ?? null,
    duration_s: leg.duration ?? null,
    stops: leg.stops ?? null,
    from: legStop(leg.from, ends[i].from),
    to: legStop(leg.to, ends[i].to),
  }));
}
