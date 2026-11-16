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
import type { AddonsService } from '../../../src/nest/addons/addons.service';
import { DomainError } from '../../../src/nest/common/domain-error';
import { PublicApiService } from '../../../src/nest/public-api/public-api.service';
import type { TourGpxSource } from '../../../src/nest/public-api/tour-gpx-source.types';
import type { TripMembershipService } from '../../../src/nest/trip-membership/trip-membership.service';
import { NotFoundException } from '@nestjs/common';

import { describe, it, expect, vi } from 'vitest';

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
    toursEnabled?: boolean;
    exportGpx?: TourGpxSource['export'];
    exportFit?: TourGpxSource['exportFit'];
    stagesOf?: TourGpxSource['stagesOf'];
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
  };
  const days = { listForPublicApi: vi.fn().mockResolvedValue(overrides.days ?? []) };
  const places = { listAssignedForPublicApi: vi.fn().mockResolvedValue(overrides.assignedPlaces ?? []) };
  const dayNotes = { listForPublicApi: vi.fn().mockResolvedValue(overrides.dayNotes ?? []) };
  const bucketList = { listForPublicApi: vi.fn().mockResolvedValue(overrides.bucketList ?? []) };
  const addons = { isAddonEnabled: vi.fn().mockResolvedValue(overrides.toursEnabled ?? true) };
  const tourGpx = {
    export: vi.fn(overrides.exportGpx ?? (async () => ({ gpx: '<gpx/>', filename: 'Ridge.gpx' }))),
    exportFit: vi.fn(overrides.exportFit ?? (async () => ({ fit: Buffer.from('.FIT'), filename: 'Ridge.fit' }))),
    stagesOf: vi.fn(overrides.stagesOf ?? (async () => new Map())),
  };
  const service = new PublicApiService(
    membership as unknown as TripMembershipService,
    trips as unknown as TripsRepository,
    reservations as unknown as ReservationsRepository,
    days as unknown as DaysRepository,
    places as unknown as PlacesRepository,
    dayNotes as unknown as DayNotesRepository,
    bucketList as unknown as BucketListRepository,
    addons as unknown as AddonsService,
    tourGpx,
  );
  return { service, membership, trips, reservations, addons, tourGpx };
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
        tour_type: null,
        distance_m: null,
        tour_stage: null,
      },
    ]);
    expect(day.day_notes).toEqual([{ text: 'Bring cash', time: null }]);
    expect(day.reservations).toEqual([
      { type: null, title: null, location: null, time: null, end_time: null, status: null, notes: null },
    ]);
    // Every key is present on the wire, not just equal to null after a lookup.
    expect(Object.keys(day.places[0]!)).toHaveLength(14);
    expect(Object.keys(day.reservations[0]!)).toHaveLength(7);
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

  describe('tours', () => {
    /** The tour columns the place reads add, for a place that is no tour. */
    const NO_TOUR = { place_id: 40, tour_type: null, tour_distance_km: null, has_route: 0 };
    const DAY = { id: 70, day_number: 1, date: '2026-08-01' };

    it('PUBAPI-SVC-008: a tour with a line carries its GPX link, its type and its length in metres', async () => {
      const { service } = makeService({
        days: [DAY],
        assignedPlaces: [
          { day_id: 70, name: 'Ridge', place_id: 41, tour_type: 'hike', tour_distance_km: 12.3456, has_route: 1 },
          { day_id: 70, name: 'Market', ...NO_TOUR },
        ],
      });
      const trip = await service.getTrip(7, 1, ['places']);
      expect(trip?.days?.[0]?.places).toMatchObject([
        { name: 'Ridge', gpx_url: '/api/v1/trips/7/tours/41/gpx', tour_type: 'hike', distance_m: 12346 },
        { name: 'Market', gpx_url: null, tour_type: null, distance_m: null },
      ]);
    });

    it('PUBAPI-SVC-009: a tour without a line has no link, and one of unknown length no length', async () => {
      const { service } = makeService({
        unplannedPlaces: [
          { name: 'Food walk', place_id: 42, tour_type: 'food', tour_distance_km: null, has_route: false },
          // Postgres answers `route_geometry IS NOT NULL` with a boolean.
          { name: 'Lake loop', place_id: 43, tour_type: 'kayak', tour_distance_km: 0, has_route: true },
        ],
      });
      const trip = await service.getTrip(7, 1, ['places']);
      expect(trip?.unplanned_places).toMatchObject([
        { name: 'Food walk', gpx_url: null, tour_type: 'food', distance_m: null },
        { name: 'Lake loop', gpx_url: '/api/v1/trips/7/tours/43/gpx', tour_type: 'kayak', distance_m: 0 },
      ]);
    });

    it('PUBAPI-SVC-010: with the Tours addon off a tour reads as a plain place', async () => {
      const { service } = makeService({
        toursEnabled: false,
        unplannedPlaces: [{ name: 'Ridge', place_id: 41, tour_type: 'hike', tour_distance_km: 5, has_route: 1 }],
      });
      const trip = await service.getTrip(7, 1, ['places']);
      expect(trip?.unplanned_places).toMatchObject([{ gpx_url: null, tour_type: null, distance_m: null }]);
    });

    it('PUBAPI-SVC-011: a trip read without places never asks about the addon', async () => {
      const { service, addons } = makeService({ days: [DAY] });
      await service.getTrip(7, 1, ['days', 'notes']);
      expect(addons.isAddonEnabled).not.toHaveBeenCalled();
    });

    it('PUBAPI-SVC-012: the GPX of a readable trip is the export, asked with the ids it parses', async () => {
      const { service, tourGpx } = makeService();
      await expect(service.getTourGpx(7, 41, 1)).resolves.toEqual({ gpx: '<gpx/>', filename: 'Ridge.gpx' });
      expect(tourGpx.export).toHaveBeenCalledWith('7', '41', undefined);
    });

    it('PUBAPI-SVC-013: a trip the caller may not read is null, and the export is never asked', async () => {
      const { service, tourGpx } = makeService({ accessible: false });
      await expect(service.getTourGpx(7, 41, 1)).resolves.toBeNull();
      expect(tourGpx.export).not.toHaveBeenCalled();
    });

    it('PUBAPI-SVC-014: with the Tours addon off the GPX is a 404, as the app export is', async () => {
      const { service, tourGpx } = makeService({ toursEnabled: false });
      const err = await service.getTourGpx(7, 41, 1).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).getStatus()).toBe(404);
      expect((err as DomainError).toBody()).toEqual({ error: 'Tours addon is not enabled' });
      expect(tourGpx.export).not.toHaveBeenCalled();
    });

    it('PUBAPI-SVC-015: a tour without a line is a 422 that names its code in the body', async () => {
      const { service } = makeService({
        exportGpx: async () => {
          throw new DomainError(422, 'This tour has no route to export', { code: 'tour_without_route' });
        },
      });
      const err = await service.getTourGpx(7, 41, 1).catch((e: unknown) => e);
      expect((err as DomainError).getStatus()).toBe(422);
      expect((err as DomainError).toBody()).toEqual({
        error: 'This tour has no route to export',
        code: 'tour_without_route',
      });
    });

    it('PUBAPI-SVC-016: any other refusal of the export passes as it is', async () => {
      const notFound = new NotFoundException('Tour not found');
      const unprocessable = new DomainError(422, 'Something else');
      const { service } = makeService({
        exportGpx: vi.fn().mockRejectedValueOnce(notFound).mockRejectedValueOnce(unprocessable),
      });
      await expect(service.getTourGpx(7, 41, 1)).rejects.toBe(notFound);
      await expect(service.getTourGpx(7, 41, 1)).rejects.toBe(unprocessable);
    });

    it('PUBAPI-SVC-017: the FIT course of a readable trip is the export’s, asked with the same ids', async () => {
      const { service, tourGpx } = makeService();
      await expect(service.getTourFit(7, 41, 1)).resolves.toEqual({ fit: Buffer.from('.FIT'), filename: 'Ridge.fit' });
      expect(tourGpx.exportFit).toHaveBeenCalledWith('7', '41', undefined);
      expect(tourGpx.export).not.toHaveBeenCalled();
    });

    it('PUBAPI-SVC-018: the FIT course passes every check of the GPX: access, addon and the public code', async () => {
      const unreadable = makeService({ accessible: false });
      await expect(unreadable.service.getTourFit(7, 41, 1)).resolves.toBeNull();
      expect(unreadable.tourGpx.exportFit).not.toHaveBeenCalled();

      const off = makeService({ toursEnabled: false });
      const offErr = await off.service.getTourFit(7, 41, 1).catch((e: unknown) => e);
      expect((offErr as DomainError).getStatus()).toBe(404);
      expect(off.tourGpx.exportFit).not.toHaveBeenCalled();

      const { service } = makeService({
        exportFit: async () => {
          throw new DomainError(422, 'This tour has no route to export', { code: 'tour_without_route' });
        },
      });
      const err = await service.getTourFit(7, 41, 1).catch((e: unknown) => e);
      expect((err as DomainError).toBody()).toEqual({
        error: 'This tour has no route to export',
        code: 'tour_without_route',
      });
    });
  });

  // MDT-02: a day that holds one stage of a multi-day tour.
  describe('tour stages', () => {
    const DAYS = [
      { id: 71, day_number: 1, date: '2026-08-01' },
      { id: 72, day_number: 2, date: '2026-08-02' },
      { id: 73, day_number: 3, date: '2026-08-03' },
    ];
    const HUT = { name: 'Hut to hut', place_id: 44, tour_type: 'hike', tour_distance_km: 30, has_route: 1 };
    const STAGES = new Map([
      [
        44,
        [
          { key: 'start', number: 1, count: 2, distance_m: 14000 },
          { key: 'hut', number: 2, count: 2, distance_m: 16000 },
        ],
      ],
    ]);

    it('PUBAPI-SVC-019: a day holding a stage hands out that stage: its link, its length and which stage it is', async () => {
      const { service, tourGpx } = makeService({
        days: DAYS,
        assignedPlaces: [
          { day_id: 71, ...HUT, tour_stage_key: 'start' },
          { day_id: 72, ...HUT, tour_stage_key: 'hut' },
          // A day that holds the whole tour, and a place that is no tour.
          { day_id: 73, ...HUT, tour_stage_key: null },
          { day_id: 73, name: 'Market', place_id: 40, tour_type: null, tour_distance_km: null, has_route: 0, tour_stage_key: null },
        ],
        unplannedPlaces: [{ ...HUT, place_id: 45 }],
        stagesOf: async () => STAGES,
      });
      const trip = await service.getTrip(7, 1, ['places']);
      const [first, second, third] = trip?.days ?? [];
      expect(first?.places[0]).toMatchObject({
        gpx_url: '/api/v1/trips/7/tours/44/gpx?stage=start',
        distance_m: 14000,
        tour_stage: { number: 1, count: 2 },
      });
      expect(second?.places[0]).toMatchObject({
        gpx_url: '/api/v1/trips/7/tours/44/gpx?stage=hut',
        distance_m: 16000,
        tour_stage: { number: 2, count: 2 },
      });
      expect(third?.places).toMatchObject([
        { gpx_url: '/api/v1/trips/7/tours/44/gpx', distance_m: 30000, tour_stage: null },
        { name: 'Market', tour_stage: null },
      ]);
      expect(trip?.unplanned_places?.[0]?.tour_stage).toBeNull();
      // Asked once, for the tours a day names a stage of.
      expect(tourGpx.stagesOf).toHaveBeenCalledTimes(1);
      expect(tourGpx.stagesOf).toHaveBeenCalledWith(7, [44, 44]);
    });

    it('PUBAPI-SVC-020: a stage the tour no longer has, or the addon off, leaves the day with the whole tour', async () => {
      const stale = makeService({
        days: DAYS,
        assignedPlaces: [{ day_id: 71, ...HUT, tour_stage_key: 'gone' }],
        stagesOf: async () => STAGES,
      });
      const trip = await stale.service.getTrip(7, 1, ['places']);
      expect(trip?.days?.[0]?.places[0]).toMatchObject({ gpx_url: '/api/v1/trips/7/tours/44/gpx', tour_stage: null });

      const off = makeService({
        toursEnabled: false,
        days: DAYS,
        assignedPlaces: [{ day_id: 71, ...HUT, tour_stage_key: 'start' }],
        stagesOf: async () => STAGES,
      });
      const offTrip = await off.service.getTrip(7, 1, ['places']);
      expect(offTrip?.days?.[0]?.places[0]).toMatchObject({ gpx_url: null, tour_stage: null });
      expect(off.tourGpx.stagesOf).not.toHaveBeenCalled();
    });

    it('PUBAPI-SVC-021: a stage key reaches both files', async () => {
      const { service, tourGpx } = makeService();
      await service.getTourGpx(7, 44, 1, 'hut');
      await service.getTourFit(7, 44, 1, 'hut');
      expect(tourGpx.export).toHaveBeenCalledWith('7', '44', 'hut');
      expect(tourGpx.exportFit).toHaveBeenCalledWith('7', '44', 'hut');
    });
  });
});
