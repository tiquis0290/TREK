import type {
  PublicApiEndpointKyselyDB,
  PublicApiEndpointRow,
  PublicApiReservationKyselyDB,
  PublicApiScheduledReservationRow,
  PublicApiUnscheduledReservationRow,
} from '../reservation-public-api-rows';

import type { Kysely } from 'kysely';

/**
 * The public API's reads of a trip's bookings and their points, behind
 * `ReservationsRepository.list*ForPublicApi` (that file is at its size
 * baseline). Every read is scoped to the trip in SQL; keep it that way, the
 * service never filters a wider result.
 */

/** The columns both booking reads select; `day_id` only where a booking has one. */
const BOOKING_COLUMNS = [
  'id',
  'type',
  'title',
  'location',
  'reservation_time',
  'reservation_end_time',
  'status',
  'notes',
  'metadata',
] as const;

/** Bookings on a day, by day then time. See {@link PublicApiScheduledReservationRow}. */
export async function scheduledForPublicApiQuery(
  kysely: Kysely<PublicApiReservationKyselyDB>,
  trip_id: number,
): Promise<PublicApiScheduledReservationRow[]> {
  const rows = await kysely
    .selectFrom('reservations')
    .select(['day_id', ...BOOKING_COLUMNS])
    .where('trip_id', '=', trip_id)
    .where('day_id', 'is not', null)
    .orderBy('day_id', 'asc')
    .orderBy('reservation_time', 'asc')
    .execute();
  return rows as PublicApiScheduledReservationRow[];
}

/** Bookings without a day, by time. See {@link PublicApiUnscheduledReservationRow}. */
export async function unscheduledForPublicApiQuery(
  kysely: Kysely<PublicApiReservationKyselyDB>,
  trip_id: number,
): Promise<PublicApiUnscheduledReservationRow[]> {
  return await kysely
    .selectFrom('reservations')
    .select(BOOKING_COLUMNS)
    .where('trip_id', '=', trip_id)
    .where('day_id', 'is', null)
    .orderBy('reservation_time', 'asc')
    .orderBy('id', 'asc')
    .execute();
}

/** Every booking's points on the trip, per booking in travel order. See {@link PublicApiEndpointRow}. */
export async function endpointsForPublicApiQuery(
  kysely: Kysely<PublicApiEndpointKyselyDB>,
  trip_id: number,
): Promise<PublicApiEndpointRow[]> {
  return await kysely
    .selectFrom('reservation_endpoints as e')
    .innerJoin('reservations as r', 'r.id', 'e.reservation_id')
    .select(['e.reservation_id', 'e.role', 'e.name', 'e.code', 'e.lat', 'e.lng', 'e.local_date', 'e.local_time'])
    .where('r.trip_id', '=', trip_id)
    .orderBy('e.reservation_id', 'asc')
    .orderBy('e.sequence', 'asc')
    .orderBy('e.id', 'asc')
    .execute();
}
