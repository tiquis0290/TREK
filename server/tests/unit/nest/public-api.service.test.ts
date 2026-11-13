/**
 * PublicApiService: the shaping of sparse rows and the two early answers.
 *
 * The e2e suite drives the service against real SQL with well-filled rows. This
 * file pins what that cannot reach cheaply: a caller with no trips is answered
 * without a second query, a trip that is not readable (or vanished between the
 * access check and the read) comes back as null, and every optional column the
 * database leaves empty reaches the wire as an explicit `null` rather than a
 * missing key, so a consumer can rely on the field being there.
 */
import type { BucketListRepository } from '../../../src/db/repositories/BucketList.repository';
import type { DayNotesRepository } from '../../../src/db/repositories/DayNotes.repository';
import type { DaysRepository } from '../../../src/db/repositories/Days.repository';
import type { PlacesRepository } from '../../../src/db/repositories/Places.repository';
import type { ReservationsRepository } from '../../../src/db/repositories/Reservations.repository';
import type { TripsRepository } from '../../../src/db/repositories/Trips.repository';
import { PublicApiService } from '../../../src/nest/public-api/public-api.service';
import type { TourFileSource } from '../../../src/nest/public-api/tour-files.interface';
import type { TripMembershipService } from '../../../src/nest/trip-membership/trip-membership.service';

import { describe, it, expect, vi } from 'vitest';

/** A booking's first point as the wire carries it; the read adds the booking's id. */
const MENDLOVO = {
  role: 'from',
  name: 'Mendlovo',
  code: null,
  lat: 49.2,
  lng: 16.6,
  local_date: '2026-06-14',
  local_time: '08:02',
};
const PRAGUE = { role: 'to', name: 'Prague', code: 'PRG', lat: 50.1, lng: 14.26, local_date: null, local_time: null };

/** A trip row as the summary query returns it when nothing optional was filled in. */
const BARE_TRIP = { id: 7, title: 'Somewhere', is_archived: 0 };

function makeService(
  overrides: {
    accessibleIds?: number[];
    accessible?: boolean;
    summary?: unknown;
    days?: unknown[];
    assignedPlaces?: unknown[];
    dayNotes?: unknown[];
    scheduledReservations?: unknown[];
    unscheduledReservations?: unknown[];
    unplannedPlaces?: unknown[];
    accommodations?: unknown[];
    bucketList?: unknown[];
    endpoints?: unknown[];
  } = {},
) {
  const membership = { listAccessibleTripIds: vi.fn().mockResolvedValue(overrides.accessibleIds ?? []) };
  const trips = {
    listSummariesByIds: vi.fn().mockResolvedValue([BARE_TRIP]),
    findAccessible: vi.fn().mockResolvedValue(overrides.accessible ?? true),
    findSummaryById: vi.fn().mockResolvedValue('summary' in overrides ? overrides.summary : BARE_TRIP),
    listTravellerUsernames: vi.fn().mockResolvedValue([]),
  };
  const reservations = {
    listScheduledForPublicApi: vi.fn().mockResolvedValue(overrides.scheduledReservations ?? []),
    listUnscheduledForPublicApi: vi.fn().mockResolvedValue(overrides.unscheduledReservations ?? []),
    listUnplannedPlacesForPublicApi: vi.fn().mockResolvedValue(overrides.unplannedPlaces ?? []),
    listAccommodationsForPublicApi: vi.fn().mockResolvedValue(overrides.accommodations ?? []),
    listEndpointsForPublicApi: vi.fn().mockResolvedValue(overrides.endpoints ?? []),
  };
  const days = { listForPublicApi: vi.fn().mockResolvedValue(overrides.days ?? []) };
  const places = { listAssignedForPublicApi: vi.fn().mockResolvedValue(overrides.assignedPlaces ?? []) };
  const dayNotes = { listForPublicApi: vi.fn().mockResolvedValue(overrides.dayNotes ?? []) };
  const bucketList = { listForPublicApi: vi.fn().mockResolvedValue(overrides.bucketList ?? []) };
  const gpxExport = {
    export: vi.fn().mockResolvedValue({ gpx: '<gpx/>', filename: 'Ridge.gpx' }),
    exportFit: vi.fn().mockResolvedValue({ fit: Buffer.from('.FIT'), filename: 'Ridge.fit' }),
  };
  const service = new PublicApiService(
    membership as unknown as TripMembershipService,
    trips as unknown as TripsRepository,
    reservations as unknown as ReservationsRepository,
    days as unknown as DaysRepository,
    places as unknown as PlacesRepository,
    dayNotes as unknown as DayNotesRepository,
    bucketList as unknown as BucketListRepository,
    gpxExport as unknown as TourFileSource,
  );
  return { service, membership, trips, reservations, gpxExport };
}

describe('PublicApiService', () => {
  it('PUBAPI-SVC-001: a caller with no trips gets an empty list without a summary query', async () => {
    const { service, trips } = makeService({ accessibleIds: [] });
    await expect(service.listTrips(1)).resolves.toEqual([]);
    expect(trips.listSummariesByIds).not.toHaveBeenCalled();
  });

  it('PUBAPI-SVC-002: a trip the caller may not read is null, and nothing else is queried', async () => {
    const { service, trips } = makeService({ accessible: false });
    await expect(service.getTrip(7, 1, ['days'])).resolves.toBeNull();
    expect(trips.findSummaryById).not.toHaveBeenCalled();
  });

  it('PUBAPI-SVC-003: a trip deleted between the access check and the read is null, not a crash', async () => {
    const { service } = makeService({ summary: null });
    await expect(service.getTrip(7, 1, ['days'])).resolves.toBeNull();
  });

  it('PUBAPI-SVC-004: a bare trip summary carries every optional field as an explicit null', async () => {
    const { service } = makeService({ accessibleIds: [7] });
    const [trip] = await service.listTrips(1);
    expect(trip).toEqual({
      id: 7,
      title: 'Somewhere',
      description: null,
      start_date: null,
      end_date: null,
      currency: null,
      archived: false,
      updated_at: null,
    });
  });

  it('PUBAPI-SVC-005: sparse places, notes and bookings on a day report null instead of dropping the key', async () => {
    const { service } = makeService({
      days: [{ id: 70, day_number: 1, date: null }],
      assignedPlaces: [{ day_id: 70, name: 'Market' }],
      dayNotes: [{ day_id: 70, text: 'Bring cash' }],
      scheduledReservations: [{ day_id: 70 }],
    });
    const trip = await service.getTrip(7, 1, ['days', 'places', 'notes', 'reservations']);
    const day = trip!.days![0]!;
    expect(day.places).toEqual([
      {
        name: 'Market',
        address: null,
        lat: null,
        lng: null,
        time: null,
        end_time: null,
        duration_minutes: null,
        category: null,
        notes: null,
        transport_mode: null,
        gpx_url: null,
        fit_url: null,
        tour_type: null,
        distance_m: null,
      },
    ]);
    expect(day.day_notes).toEqual([{ text: 'Bring cash', time: null }]);
    expect(day.reservations).toEqual([
      {
        type: null,
        title: null,
        location: null,
        time: null,
        end_time: null,
        status: null,
        notes: null,
        endpoints: [],
        legs: [],
      },
    ]);
    // Every key is present on the wire, not just equal to null after a lookup.
    expect(Object.keys(day.places[0]!)).toHaveLength(14);
    expect(Object.keys(day.reservations[0]!)).toHaveLength(9);
  });

  it('PUBAPI-SVC-006: an accommodation without dates or details is still listed, every field null', async () => {
    const { service } = makeService({ accommodations: [{}] });
    const trip = await service.getTrip(7, 1, ['accommodations']);
    expect(trip!.accommodations).toEqual([
      {
        name: null,
        address: null,
        lat: null,
        lng: null,
        start_date: null,
        end_date: null,
        check_in: null,
        check_out: null,
        notes: null,
      },
    ]);
    // Accommodations alone do not imply the day spine.
    expect(trip!.days).toBeUndefined();
  });

  it('PUBAPI-SVC-007: a bucket list entry with only a name reports the rest as null', async () => {
    const { service } = makeService({ bucketList: [{ name: 'Lofoten' }] });
    await expect(service.listBucketList(1)).resolves.toEqual([
      { name: 'Lofoten', lat: null, lng: null, country_code: null, notes: null, target_date: null },
    ]);
  });

  it('PUBAPI-SVC-008: a tour with a route carries its GPX and FIT links, its type and its length in metres', async () => {
    const tour = { place_id: 41, tour_type: 'hike', tour_distance_km: 12.3456, has_route: 1 };
    const { service } = makeService({
      days: [{ id: 70, day_number: 1, date: '2026-06-14' }],
      assignedPlaces: [{ day_id: 70, name: 'Ridge', ...tour }],
      unplannedPlaces: [{ name: 'Lake loop', ...tour, place_id: 42, tour_type: 'run', tour_distance_km: null }],
    });
    const trip = await service.getTrip(7, 1, ['places']);
    expect(trip?.days?.[0]?.places[0]).toMatchObject({
      gpx_url: '/api/v1/trips/7/tours/41/gpx',
      fit_url: '/api/v1/trips/7/tours/41/fit',
      tour_type: 'hike',
      distance_m: 12346,
    });
    expect(trip?.unplanned_places?.[0]).toMatchObject({
      gpx_url: '/api/v1/trips/7/tours/42/gpx',
      fit_url: '/api/v1/trips/7/tours/42/fit',
      tour_type: 'run',
      distance_m: null,
    });
  });

  it('PUBAPI-SVC-009: a tour without a route has no file links, and a plain place no tour fields', async () => {
    const { service } = makeService({
      unplannedPlaces: [
        { name: 'Food walk', place_id: 43, tour_type: 'food', tour_distance_km: 2, has_route: 0 },
        { name: 'Cafe', place_id: 44, tour_type: null, tour_distance_km: null, has_route: 1 },
      ],
    });
    const trip = await service.getTrip(7, 1, ['places']);
    expect(trip?.unplanned_places).toMatchObject([
      { name: 'Food walk', gpx_url: null, fit_url: null, tour_type: 'food', distance_m: 2000 },
      { name: 'Cafe', gpx_url: null, fit_url: null, tour_type: null, distance_m: null },
    ]);
  });

  it('PUBAPI-SVC-010: a booking carries its own endpoints and transit legs, read once for the trip', async () => {
    const metadata = JSON.stringify({
      transit: {
        provider: 'motis',
        legs: [
          {
            mode: 'TRAM',
            line: '4',
            line_color: '#ff0000',
            headsign: 'Hauptbahnhof',
            agency: 'DPMB',
            duration: 420,
            stops: 3,
            from: { name: 'Mendlovo', time: '08:02', track: null },
            to: { name: 'Hlavni nadrazi', time: '08:09', track: 'B' },
            geometry: 'abc',
          },
          { line: 'no mode' },
        ],
      },
    });
    const { service, reservations } = makeService({
      days: [{ id: 70, day_number: 1, date: '2026-06-14' }],
      scheduledReservations: [{ id: 5, day_id: 70, type: 'transit', metadata }],
      unscheduledReservations: [{ id: 6, type: 'flight', metadata: 'not json' }],
      endpoints: [
        { reservation_id: 5, ...MENDLOVO },
        { reservation_id: 5, ...PRAGUE, role: 'banana' },
        { reservation_id: 6, ...PRAGUE },
      ],
    });
    const trip = await service.getTrip(7, 1, ['reservations']);
    const [transit] = trip?.days?.[0]?.reservations ?? [];
    expect(transit?.endpoints).toEqual([MENDLOVO]);
    expect(transit?.legs).toEqual([
      {
        mode: 'TRAM',
        line: '4',
        headsign: 'Hauptbahnhof',
        agency: 'DPMB',
        duration_s: 420,
        stops: 3,
        from: { name: 'Mendlovo', time: '08:02', track: null },
        to: { name: 'Hlavni nadrazi', time: '08:09', track: 'B' },
      },
    ]);
    const [flight] = trip?.unscheduled_reservations ?? [];
    expect(flight?.endpoints).toEqual([PRAGUE]);
    expect(flight?.legs).toEqual([]);
    expect(reservations.listEndpointsForPublicApi).toHaveBeenCalledTimes(1);
  });

  it('PUBAPI-SVC-011: endpoints are not read when bookings were not asked for', async () => {
    const { service, reservations } = makeService({ days: [{ id: 70, day_number: 1, date: '2026-06-14' }] });
    await service.getTrip(7, 1, ['days', 'places']);
    expect(reservations.listEndpointsForPublicApi).not.toHaveBeenCalled();
  });

  it('PUBAPI-SVC-012: a tour file is the export of a readable trip, as GPX or FIT, and null for any other', async () => {
    const readable = makeService();
    await expect(readable.service.getTourFile(7, 41, 1, 'gpx')).resolves.toEqual({
      body: '<gpx/>',
      filename: 'Ridge.gpx',
    });
    expect(readable.gpxExport.export).toHaveBeenCalledWith('7', '41');
    await expect(readable.service.getTourFile(7, 41, 1, 'fit')).resolves.toEqual({
      body: Buffer.from('.FIT'),
      filename: 'Ridge.fit',
    });
    expect(readable.gpxExport.exportFit).toHaveBeenCalledWith('7', '41');

    const hidden = makeService({ accessible: false });
    await expect(hidden.service.getTourFile(7, 41, 1, 'fit')).resolves.toBeNull();
    expect(hidden.gpxExport.exportFit).not.toHaveBeenCalled();
  });
});
