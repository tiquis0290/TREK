import { ADDON_IDS } from '../../addons';
import { BucketList } from '../../db/entities/BucketList.entity';
import { DayNotes } from '../../db/entities/DayNotes.entity';
import { Days } from '../../db/entities/Days.entity';
import { Places } from '../../db/entities/Places.entity';
import { Reservations } from '../../db/entities/Reservations.entity';
import { Trips } from '../../db/entities/Trips.entity';
import type { BucketListRepository } from '../../db/repositories/BucketList.repository';
import type { DayNotesRepository } from '../../db/repositories/DayNotes.repository';
import type { DaysRepository } from '../../db/repositories/Days.repository';
import type { PlacesRepository, PublicApiAssignedPlaceRow } from '../../db/repositories/Places.repository';
import type { ReservationsRepository } from '../../db/repositories/Reservations.repository';
import type { TripsRepository } from '../../db/repositories/Trips.repository';
import type { PublicApiTourColumns } from '../../db/repositories/place-public-api-rows';
import { AddonsService } from '../addons/addons.service';
import { DomainError } from '../common/domain-error';
import { TripMembershipService } from '../trip-membership/trip-membership.service';
import { TOUR_GPX_SOURCE, type TourGpxSource } from './tour-gpx-source.types';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { publicApiTourGpxPath } from '@trek/shared';
import type {
  PublicApiAccommodation,
  PublicApiBucketListItem,
  PublicApiDay,
  PublicApiDayNote,
  PublicApiInclude,
  PublicApiPlace,
  PublicApiReservation,
  PublicApiTraveller,
  PublicApiTrip,
  PublicApiTripSummary,
} from '@trek/shared';

/**
 * Assembles the read-only public API payloads.
 *
 * Two rules run through everything here:
 *
 * 1. **Access is decided per trip, against the database, every time.** The list
 *    comes from `listAccessibleTripIds`, a single trip goes through
 *    `canAccessTrip` — the same predicates the rest of TREK uses (owner or member).
 *    Nothing is filtered in application code after a broad read, because a filter
 *    that is forgotten once leaks everything.
 * 2. **Rows are never handed out as they are stored.** Ids, foreign keys and
 *    ordering columns stay inside; the caller gets resolved names, dates and times.
 *    That keeps the contract stable when the tables move, and it keeps internal
 *    structure — which user owns what, how ids are numbered — out of the response.
 *
 * The child queries are scoped by `trip_id` in SQL rather than by filtering a
 * wider result set, so a bug in the include handling cannot widen what a caller
 * sees; at worst it returns less.
 *
 * Plan 4 Task 1: the four raw `this.db.all(...)` reads (days, places,
 * day-notes, bucket-list) moved onto `DaysRepository`/`PlacesRepository`/
 * `DayNotesRepository`/`BucketListRepository`. Plan 4 Task 2: `getTrip`'s
 * `canAccessTrip` delegate is now `TripsRepository.findAccessible` directly
 * (reusing `tripsRepo` below) — `DatabaseService` is gone from this file
 * entirely.
 */
@Injectable()
export class PublicApiService {
  constructor(
    private readonly membership: TripMembershipService,
    @InjectRepository(Trips) private readonly tripsRepo: TripsRepository,
    @InjectRepository(Reservations) private readonly reservationsRepo: ReservationsRepository,
    @InjectRepository(Days) private readonly daysRepo: DaysRepository,
    @InjectRepository(Places) private readonly placesRepo: PlacesRepository,
    @InjectRepository(DayNotes) private readonly dayNotesRepo: DayNotesRepository,
    @InjectRepository(BucketList) private readonly bucketListRepo: BucketListRepository,
    private readonly addons: AddonsService,
    @Inject(TOUR_GPX_SOURCE) private readonly tourGpx: TourGpxSource,
  ) {}

  /** Every trip the token's owner may read, newest first, without itineraries. */
  async listTrips(userId: number): Promise<PublicApiTripSummary[]> {
    const ids = await this.membership.listAccessibleTripIds(userId);
    if (ids.length === 0) return [];
    const rows = await this.tripsRepo.listSummariesByIds(ids);
    return rows.map(toTripSummary);
  }

  /**
   * One trip with the requested sections, or null when the caller may not read it.
   *
   * Null covers both "no such trip" and "not yours" on purpose — the controller
   * turns both into the same 404, so the endpoint cannot be used to probe which
   * trip ids exist.
   */
  async getTrip(
    tripId: number,
    userId: number,
    include: PublicApiInclude[],
    granted: readonly string[] = include,
  ): Promise<PublicApiTrip | null> {
    if (!(await this.tripsRepo.findAccessible(tripId, userId))) return null;
    const row = await this.tripsRepo.findSummaryById(tripId);
    if (!row) return null;

    const trip: PublicApiTrip = toTripSummary(row);
    // Tours are places of the trip; while the addon is off they read as plain places.
    const tours = include.includes('places') && (await this.addons.isAddonEnabled(ADDON_IDS.TOURS));
    // Places, notes and reservations hang off days, so asking for one of them
    // and not for `days` used to return the trip and nothing else — silently,
    // which is the worst way to answer. Days are implied instead.
    //
    // Implied, not granted: `granted` is what the key may read at all, and a key
    // narrowed to places must not get the day's title and free-text notes back
    // through the container those places arrive in. The shell it does get is the
    // join key the children are useless without.
    if (DAY_SCOPED.some((section) => include.includes(section))) {
      trip.days = await this.buildDays(tripId, include, granted.includes('days'), tours);
    }
    if (include.includes('places')) {
      trip.unplanned_places = await this.buildUnplannedPlaces(tripId, tours);
    }
    if (include.includes('reservations')) {
      trip.unscheduled_reservations = await this.buildUnscheduledReservations(tripId);
    }
    if (include.includes('accommodations')) {
      trip.accommodations = await this.buildAccommodations(tripId);
    }
    if (include.includes('travellers')) {
      trip.travellers = await this.buildTravellers(tripId);
    }
    return trip;
  }

  /**
   * The itinerary. Days are the spine: everything dated hangs off one, which is
   * what lets a consumer join on `date` alone.
   *
   * The per-day children are fetched once for the whole trip and grouped in memory
   * rather than queried per day — a two-week trip would otherwise cost 42 round
   * trips for the same rows.
   */
  private async buildDays(
    tripId: number,
    include: PublicApiInclude[],
    dayFields: boolean,
    tours: boolean,
  ): Promise<PublicApiDay[]> {
    const days = await this.daysRepo.listForPublicApi(tripId);
    if (days.length === 0) return [];

    const placesByDay = include.includes('places') ? await this.placesByDay(tripId, tours) : new Map();
    const notesByDay = include.includes('notes') ? await this.dayNotesByDay(tripId) : new Map();
    const reservationsByDay = include.includes('reservations') ? await this.reservationsByDay(tripId) : new Map();

    return days.map((day) => ({
      date: day.date,
      day_number: day.day_number,
      title: dayFields ? (day.title ?? null) : null,
      notes: dayFields ? (day.notes ?? null) : null,
      places: placesByDay.get(day.id) ?? [],
      day_notes: notesByDay.get(day.id) ?? [],
      reservations: reservationsByDay.get(day.id) ?? [],
    }));
  }

  /**
   * Places in the order the traveller planned to visit them.
   *
   * `order_index` decides the sequence and is then dropped: it is a storage detail
   * that only means something relative to its siblings, and an array already
   * carries order.
   *
   * A booked night puts a stop of its own on its check-in day, so the route can
   * reach the hotel. That stop is the booking, not a place the traveller planned
   * to visit, and the booking is already reported in full under `accommodations`;
   * listed here as well it would read as two different intentions. Same rule as
   * the shortlist below.
   */
  private async placesByDay(tripId: number, tours: boolean): Promise<Map<number, PublicApiPlace[]>> {
    const rows = await this.placesRepo.listAssignedForPublicApi(tripId);
    return groupBy<PublicApiAssignedPlaceRow, PublicApiPlace>(
      rows,
      (r) => r.day_id,
      (r) => toPlace(r, tripId, tours),
    );
  }

  private async dayNotesByDay(tripId: number): Promise<Map<number, PublicApiDayNote[]>> {
    const rows = await this.dayNotesRepo.listForPublicApi(tripId);
    return groupBy(
      rows,
      (r) => r.day_id,
      (r) => ({
        text: r.text,
        time: r.time ?? null,
      }),
    );
  }

  /**
   * Bookings, reported on their starting day.
   *
   * A reservation may span days (`end_day_id`), but it is listed once rather than
   * repeated on each — a consumer that sees the same flight on three days has no
   * way to tell that from three flights.
   */
  private async reservationsByDay(tripId: number): Promise<Map<number, PublicApiReservation[]>> {
    const rows = await this.reservationsRepo.listScheduledForPublicApi(tripId);
    return groupBy(rows as ReservationRow[], (r: ReservationRow) => r.day_id, toReservation);
  }

  /**
   * Accommodations with their date range resolved from the start/end day rows.
   *
   * Stored as day ids, reported as ISO dates: a consumer has no way to look up a
   * TREK day id, and the dates are what it actually needs to match its own nights.
   */
  private async buildAccommodations(tripId: number): Promise<PublicApiAccommodation[]> {
    const rows = await this.reservationsRepo.listAccommodationsForPublicApi(tripId);
    return rows.map((r) => ({
      name: r.name ?? null,
      address: r.address ?? null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      start_date: r.start_date ?? null,
      end_date: r.end_date ?? null,
      check_in: r.check_in ?? null,
      check_out: r.check_out ?? null,
      notes: r.notes ?? null,
    }));
  }

  /**
   * Places the traveller collected but has not scheduled: no row in
   * `day_assignments`, so they belong to the trip rather than to any day.
   *
   * These are not leftovers. On a real instance roughly half the places on a
   * trip sit here, and they are the ones a consumer can most usefully act on:
   * somewhere the traveller wants to go, with a coordinate, and no claim yet
   * about when.
   *
   * Ordered by creation, which is the only order they have: an unscheduled place
   * has no position relative to its siblings.
   *
   * Hotels are excluded. An accommodation's place has no day assignment either,
   * but it is not a shortlist entry and it is already reported in full under
   * `accommodations` — listing it twice would read as two different intentions.
   */
  private async buildUnplannedPlaces(tripId: number, tours: boolean): Promise<PublicApiPlace[]> {
    const rows = await this.reservationsRepo.listUnplannedPlacesForPublicApi(tripId);
    return rows.map((r) => toPlace(r, tripId, tours));
  }

  /**
   * A tour's route as GPX: the file TREK's own export writes, through the
   * TOUR_GPX_SOURCE port. Null when the caller may not read the trip, which
   * the controller answers exactly as the trip route does, so a tour id cannot
   * be used to probe someone else's trips either.
   *
   * While the Tours addon is off this is a 404, as the app's own export
   * answers. The export's refusals are turned into this surface's own: a tour
   * the trip does not hold is a 404 JSON body, and a tour without a line a 422
   * with its code in the body, because this surface promises one an
   * integration can branch on.
   */
  async getTourGpx(tripId: number, placeId: number, userId: number): Promise<{ gpx: string; filename: string } | null> {
    return this.readTourFile(tripId, userId, () => this.tourGpx.export(String(tripId), String(placeId)));
  }

  /** The same tour as a FIT course for a watch, under every rule of {@link getTourGpx}. */
  async getTourFit(tripId: number, placeId: number, userId: number): Promise<{ fit: Buffer; filename: string } | null> {
    return this.readTourFile(tripId, userId, () => this.tourGpx.exportFit(String(tripId), String(placeId)));
  }

  /** The checks every tour file passes before `read` writes it, and the public code on its refusal. */
  private async readTourFile<T>(tripId: number, userId: number, read: () => Promise<T>): Promise<T | null> {
    if (!(await this.addons.isAddonEnabled(ADDON_IDS.TOURS))) {
      throw new DomainError(404, 'Tours addon is not enabled');
    }
    if (!(await this.tripsRepo.findAccessible(tripId, userId))) return null;
    try {
      return await read();
    } catch (err) {
      throw toPublicTourError(err);
    }
  }

  /**
   * Bookings with no day. `reservations.day_id` is nullable and a deleted day
   * sets it null rather than cascading, so a flight can outlive the day it was
   * pinned to. Reporting only day-bound bookings would quietly lose those.
   */
  private async buildUnscheduledReservations(tripId: number): Promise<PublicApiReservation[]> {
    const rows = await this.reservationsRepo.listUnscheduledForPublicApi(tripId);
    return rows.map(toReservation);
  }

  /**
   * The caller's bucket list: places they want to reach, with no trip attached.
   *
   * Read here rather than through AtlasService, for the same reason every other
   * table in this file is: importing a domain module for one SELECT drags its
   * whole graph in, and this surface has to be able to boot on its own. The query
   * is scoped by `user_id` in SQL, which is the part that matters.
   *
   * Returns entries even when the Atlas addon is switched off: the addon governs
   * whether TREK shows the feature, not whether the rows exist, and a key whose
   * answers change when an unrelated toggle moves is a key nobody can build on.
   */
  async listBucketList(userId: number): Promise<PublicApiBucketListItem[]> {
    const rows = await this.bucketListRepo.listForPublicApi(userId);
    return rows.map((r) => ({
      name: r.name,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      country_code: r.country_code ?? null,
      notes: r.notes ?? null,
      target_date: r.target_date ?? null,
    }));
  }

  /**
   * Who is on the trip: the owner first, then members in join order.
   *
   * Names only. The query selects `username` and nothing else — no ids, no email
   * addresses — because an integration key is a credential for reading its owner's
   * itinerary, not for enumerating the people around them. What it returns is
   * exactly what those people already see on the trip in TREK.
   */
  private async buildTravellers(tripId: number): Promise<PublicApiTraveller[]> {
    const rows = await this.tripsRepo.listTravellerUsernames(tripId);
    return rows.map((r) => ({ name: r.username, owner: r.is_owner === 1 }));
  }
}

/**
 * Sections that live on a day. Asking for any of them implies `days`, because
 * that is where they are reported.
 */
const DAY_SCOPED: PublicApiInclude[] = ['days', 'places', 'notes', 'reservations'];

/**
 * One definition of what a place looks like on the wire, used both for places on
 * a day and for unscheduled ones. Two copies would drift, and the second copy is
 * always the one that forgets a field.
 */
function toPlace(row: Omit<PlaceRow, 'day_id'>, tripId: number, tours: boolean): PublicApiPlace {
  const tour = tours && row.tour_type ? row : null;
  return {
    name: row.name,
    address: row.address ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    time: row.place_time ?? null,
    end_time: row.end_time ?? null,
    duration_minutes: row.duration_minutes ?? null,
    category: row.category ?? null,
    notes: row.notes ?? null,
    transport_mode: row.transport_mode ?? null,
    gpx_url: tour?.has_route ? publicApiTourGpxPath(tripId, tour.place_id) : null,
    tour_type: tour?.tour_type ?? null,
    distance_m: tour?.tour_distance_km != null ? Math.round(tour.tour_distance_km * 1000) : null,
  };
}

/**
 * The export's refusals as this surface answers them; anything else unchanged.
 *
 * A tour the trip does not hold leaves the export as Nest's NotFoundException,
 * which the production SPA fallback (`SpaFallbackFilter`) answers on a GET with
 * index.html and a 200. Raised again as a DomainError it is an HttpException
 * that filter does not catch, so the client gets the JSON 404 this surface
 * documents. A tour without a line keeps its code, now in the body as well.
 */
function toPublicTourError(err: unknown): unknown {
  if (err instanceof NotFoundException) {
    return new DomainError(404, 'Tour not found');
  }
  if (err instanceof DomainError && err.code === 'tour_without_route') {
    return new DomainError(422, err.publicMessage, { code: err.code, details: { code: err.code } });
  }
  return err;
}

function toReservation(row: Omit<ReservationRow, 'day_id'>): PublicApiReservation {
  return {
    type: row.type ?? null,
    title: row.title ?? null,
    location: row.location ?? null,
    time: row.reservation_time ?? null,
    end_time: row.reservation_end_time ?? null,
    status: row.status ?? null,
    notes: row.notes ?? null,
  };
}

function toTripSummary(row: TripRow): PublicApiTripSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    currency: row.currency ?? null,
    archived: row.is_archived === 1,
    updated_at: row.updated_at ?? null,
  };
}

function groupBy<Row, Out>(rows: Row[], key: (row: Row) => number, map: (row: Row) => Out): Map<number, Out[]> {
  const grouped = new Map<number, Out[]>();
  for (const row of rows) {
    const id = key(row);
    const bucket = grouped.get(id);
    if (bucket) bucket.push(map(row));
    else grouped.set(id, [map(row)]);
  }
  return grouped;
}

interface TripRow {
  id: number;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  currency: string | null;
  is_archived: number | null;
  updated_at: string | null;
}

interface DayRow {
  id: number;
  day_number: number;
  date: string;
  title: string | null;
  notes: string | null;
}

interface PlaceRow extends PublicApiTourColumns {
  day_id: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  place_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  transport_mode: string | null;
  category: string | null;
}

interface DayNoteRow {
  day_id: number;
  text: string;
  time: string | null;
}

interface ReservationRow {
  day_id: number;
  type: string | null;
  title: string | null;
  location: string | null;
  reservation_time: string | null;
  reservation_end_time: string | null;
  status: string | null;
  notes: string | null;
}

interface AccommodationRow {
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  start_date: string | null;
  end_date: string | null;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
}

interface BucketListRow {
  name: string;
  lat: number | null;
  lng: number | null;
  country_code: string | null;
  notes: string | null;
  target_date: string | null;
}
