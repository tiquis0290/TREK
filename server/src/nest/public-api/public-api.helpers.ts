import { RESERVATION_METADATA } from '../../db/json-columns';
import type { PublicApiTourColumns } from '../../db/repositories/place-public-api-rows';
import type { PublicApiEndpointRow } from '../../db/repositories/reservation-public-api-rows';
import { decodeJson } from '../../utils/json-column';
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

/** Where an integration fetches a tour's route as a file. A path on this instance, resolved against the caller's base URL. */
function tourFilePath(tripId: number, placeId: number, format: 'gpx' | 'fit'): string {
  return `/api/v1/trips/${tripId}/tours/${placeId}/${format}`;
}

/**
 * A place's tour fields. A place without a tour row has none of them; a tour
 * without a line of its own has no file links, because the file routes would
 * only refuse it. The length is stored in kilometres and goes out in whole metres.
 */
export function tourFieldsOf(
  tripId: number,
  row: PublicApiTourColumns,
): Pick<PublicApiPlace, 'gpx_url' | 'fit_url' | 'tour_type' | 'distance_m'> {
  if (!row.tour_type) return { gpx_url: null, fit_url: null, tour_type: null, distance_m: null };
  const km = row.tour_distance_km;
  return {
    gpx_url: row.has_route ? tourFilePath(tripId, row.place_id, 'gpx') : null,
    fit_url: row.has_route ? tourFilePath(tripId, row.place_id, 'fit') : null,
    tour_type: row.tour_type,
    distance_m: typeof km === 'number' && Number.isFinite(km) && km >= 0 ? Math.round(km * 1000) : null,
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

/** One end of a leg as `buildTransitReservationParts` stores it. */
const storedLegStopSchema = z.object({ name: text, time: text, track: text }).nullable().optional().catch(null);

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
});

/** `metadata.transit`: only the list of legs is read here, each leg on its own. */
const storedTransitSchema = z.object({ legs: z.array(z.unknown()) });

function legStop(stop: z.infer<typeof storedLegStopSchema>): PublicApiTransitLegStop {
  return { name: stop?.name ?? null, time: stop?.time ?? null, track: stop?.track ?? null };
}

/**
 * The legs of a public transport journey, read from the booking's metadata.
 *
 * Field by field, never the stored object: the leg also holds its drawn line
 * and the line's colours, which the contract leaves out. A booking without a
 * journey, or whose metadata does not decode, has no legs.
 */
export function transitLegsOf(metadata: string | null): PublicApiTransitLeg[] {
  if (!metadata) return [];
  const transit = storedTransitSchema.safeParse(decodeJson(RESERVATION_METADATA, metadata, 'public api').transit);
  if (!transit.success) return [];
  return transit.data.legs.flatMap((raw) => {
    const parsed = storedLegSchema.safeParse(raw);
    if (!parsed.success) return [];
    const leg = parsed.data;
    return [
      {
        mode: leg.mode,
        line: leg.line ?? null,
        headsign: leg.headsign ?? null,
        agency: leg.agency ?? null,
        duration_s: leg.duration ?? null,
        stops: leg.stops ?? null,
        from: legStop(leg.from),
        to: legStop(leg.to),
      },
    ];
  });
}
