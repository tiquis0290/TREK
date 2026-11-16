import { RESERVATION_METADATA } from '../../db/json-columns';
import type { PublicApiEndpointRow } from '../../db/repositories/Reservations.repository';
import { decodeJson } from '../../utils/json-column';
import { decodePolyline } from '../../utils/polyline';
import type { PublicApiReservationEndpoint, PublicApiTransitLeg, PublicApiTransitLegEnd } from '@trek/shared';

import { z } from 'zod';

/**
 * A booking's `endpoints` and `legs` in the public API: what `reservation_endpoints`
 * rows and `metadata.transit.legs` become on the wire.
 *
 * Every field is mapped by name into the shapes in `shared/src/public-api/`, never
 * passed through, so the stored transit metadata can change without breaking v1
 * clients. A stored value of the wrong kind is read as null or left out; it never
 * fails the request. To publish another field, add it to the shared schema and
 * map it here.
 */

/** A place on the globe, checked to be one. */
interface Point {
  lat: number;
  lng: number;
}

function pointOf(lat: unknown, lng: unknown): Point | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * A booking's points, in the order the read sorted them. The contract promises
 * each a place, so a row whose `lat`/`lng` is not one (REAL columns, which
 * SQLite lets hold text) is left out.
 */
export function toPublicEndpoints(rows: readonly PublicApiEndpointRow[]): PublicApiReservationEndpoint[] {
  return rows.flatMap((row) => {
    const at = pointOf(row.lat, row.lng);
    if (!at) return [];
    return [
      {
        name: row.name,
        code: row.code ?? null,
        lat: at.lat,
        lng: at.lng,
        local_date: row.local_date ?? null,
        local_time: row.local_time ?? null,
      },
    ];
  });
}

const text = z.string().nullable().optional().catch(null);
const seconds = z.number().nonnegative().nullable().optional().catch(null);
const count = z.number().int().nonnegative().nullable().optional().catch(null);

/**
 * One end of a leg as `buildTransitReservationParts` (`transit-itinerary.helpers.ts`)
 * stores it. Older journeys have no `lat`/`lng`; `legEnds` places those ends.
 */
const storedLegEndSchema = z
  .object({ name: text, time: text, track: text, lat: z.unknown().optional(), lng: z.unknown().optional() })
  .nullable()
  .optional()
  .catch(null);

/**
 * A leg as `buildTransitReservationParts` stores it in `metadata.transit.legs`.
 * Lenient field by field, because the column is free-form and older journeys may
 * lack a field: a missing or mistyped one reads as null, and only a leg without a
 * mode is dropped. `geometry` is read only to place the leg's ends and never
 * goes out.
 */
const storedLegSchema = z.object({
  mode: z.string().min(1),
  line: text,
  headsign: text,
  agency: text,
  duration: seconds,
  stops: count,
  from: storedLegEndSchema,
  to: storedLegEndSchema,
  geometry: text,
  geometry_precision: z.number().int().min(0).max(10).nullable().optional().catch(null),
});

type StoredLeg = z.infer<typeof storedLegSchema>;
type StoredLegEnd = StoredLeg['from'];

/** `metadata.transit`: only its list of legs is read, each leg on its own. */
const storedTransitSchema = z.object({ legs: z.array(z.unknown()) });

/** Used when a leg stores no precision; the same default as the client's map (`Map/transitGeometry.ts`). */
const DEFAULT_GEOMETRY_PRECISION = 6;

/** The first and last point of a leg's drawn line; an end that does not decode to a valid point is null. */
function lineEnds(leg: StoredLeg): { first: Point | null; last: Point | null } {
  if (!leg.geometry) return { first: null, last: null };
  const points = decodePolyline(leg.geometry, leg.geometry_precision ?? DEFAULT_GEOMETRY_PRECISION);
  const first = points[0];
  const last = points[points.length - 1];
  return { first: first ? pointOf(first[0], first[1]) : null, last: last ? pointOf(last[0], last[1]) : null };
}

/**
 * Where each end of each leg is, first match wins: the stored place, the matching
 * end of the leg's drawn line, the neighbouring leg's end (walks are often stored
 * without a line), and for the first and last leg the booking's own `from`/`to`
 * endpoint. Else null.
 */
function legEnds(legs: readonly StoredLeg[], endpoints: readonly PublicApiEndpointRow[]) {
  const own = legs.map((leg) => {
    const from = pointOf(leg.from?.lat, leg.from?.lng);
    const to = pointOf(leg.to?.lat, leg.to?.lng);
    if (from && to) return { from, to };
    const line = lineEnds(leg);
    return { from: from ?? line.first, to: to ?? line.last };
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

function legEnd(end: StoredLegEnd, at: Point | null): PublicApiTransitLegEnd {
  return {
    name: end?.name ?? null,
    time: end?.time ?? null,
    track: end?.track ?? null,
    lat: at?.lat ?? null,
    lng: at?.lng ?? null,
  };
}

/**
 * The legs of a public transport journey from the booking's metadata, in stored
 * order. `endpoints` are the booking's own stored points (role included), used
 * by `legEnds`. A booking without `metadata.transit.legs`, or whose metadata
 * does not decode, has none. `context` names the booking in the warning
 * `decodeJson` logs for a broken column.
 */
export function transitLegsOf(
  metadata: string | null,
  endpoints: readonly PublicApiEndpointRow[],
  context: string,
): PublicApiTransitLeg[] {
  if (!metadata) return [];
  const transit = storedTransitSchema.safeParse(decodeJson(RESERVATION_METADATA, metadata, context).transit);
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
    from: legEnd(leg.from, ends[i].from),
    to: legEnd(leg.to, ends[i].to),
  }));
}
