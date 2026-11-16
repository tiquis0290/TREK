import { RESERVATION_METADATA } from '../../db/json-columns';
import type { PublicApiEndpointRow } from '../../db/repositories/Reservations.repository';
import { decodeJson } from '../../utils/json-column';
import { decodePolyline } from '../../utils/polyline';
import type { PublicApiReservationEndpoint, PublicApiTransitLeg, PublicApiTransitLegEnd } from '@trek/shared';

import { z } from 'zod';

/**
 * The pure half of a booking's `endpoints` and `legs` in the public API: what the
 * stored rows become on the wire. Every field is mapped by name into the public
 * shape, never passed through, so the storage format stays free to change and a
 * stored value of the wrong kind is dropped or read as null rather than failing
 * the request.
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
 * A booking's points, in the order the read sorted them. The booking's id and
 * the point's role stay inside. A point without a name or a place on the globe
 * is left out: the contract promises both.
 */
export function toPublicEndpoints(rows: readonly PublicApiEndpointRow[]): PublicApiReservationEndpoint[] {
  return rows.flatMap((row) => {
    const at = pointOf(row.lat, row.lng);
    if (!at || typeof row.name !== 'string') return [];
    return [
      {
        name: row.name,
        code: typeof row.code === 'string' ? row.code : null,
        lat: at.lat,
        lng: at.lng,
        local_date: typeof row.local_date === 'string' ? row.local_date : null,
        local_time: typeof row.local_time === 'string' ? row.local_time : null,
      },
    ];
  });
}

const text = z.string().nullable().optional().catch(null);
const seconds = z.number().nonnegative().nullable().optional().catch(null);
const count = z.number().int().nonnegative().nullable().optional().catch(null);

/**
 * One end of a leg as `buildTransitReservationParts` (`transit-itinerary.helpers.ts`)
 * stores it. Journeys saved before the end's place was stored with it have no
 * `lat`/`lng`; those are checked by `pointOf`, not here.
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
 * mode is dropped. The line and its precision are read only to place the leg's
 * ends; the colours are not read at all.
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

/** The precision a leg's line is decoded with when the leg does not say: MOTIS's, as on TREK's own map. */
const DEFAULT_GEOMETRY_PRECISION = 6;

/** The first and last point of a leg's drawn line. A line that does not decode to valid points gives neither. */
function lineEnds(leg: StoredLeg): { first: Point | null; last: Point | null } {
  if (!leg.geometry) return { first: null, last: null };
  const points = decodePolyline(leg.geometry, leg.geometry_precision ?? DEFAULT_GEOMETRY_PRECISION);
  const first = points[0];
  const last = points[points.length - 1];
  return { first: first ? pointOf(first[0], first[1]) : null, last: last ? pointOf(last[0], last[1]) : null };
}

/**
 * Where each end of each leg is. Its stored place when the journey has one, else
 * the matching end of the leg's drawn line. A leg with neither (a walk is often
 * stored without a line) borrows from its neighbours: it starts where the
 * previous leg ends and ends where the next one starts, and the first and last
 * leg fall back to the booking's own start and destination. Else null.
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
 * The legs of a public transport journey, read from the booking's metadata, with
 * the booking's own points to place the ends nothing else places. A booking
 * without a journey, or whose metadata does not decode, has no legs.
 *
 * `context` names the booking in the log line a broken metadata column writes.
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
