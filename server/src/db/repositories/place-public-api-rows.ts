/**
 * The place rows the public API (`public-api.service.ts`) reads, and the tour
 * columns both of its place reads (on a day and unplanned) add.
 */
import type { DB } from '../kysely/db';

/**
 * What `LEFT JOIN tours t ON t.place_id = p.id` adds to a place read for the
 * public API: the place's id (to build the tour's GPX link, never handed out
 * as an id field), the tour's type and length, and whether the place holds a
 * route at all. `tour_type` is null for a place that is no tour; the length is
 * stored in kilometres. `has_route` is `p.route_geometry IS NOT NULL`, which
 * SQLite answers as 0/1 and Postgres as a boolean.
 */
export interface PublicApiTourColumns {
  place_id: number;
  tour_type: string | null;
  tour_distance_km: number | null;
  has_route: number | boolean | null;
}

/** {@link PlacesRepository.listAssignedForPublicApi}'s projection. */
export interface PublicApiAssignedPlaceRow extends PublicApiTourColumns {
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

/** {@link PlacesRepository.listAssignedForPublicApi}'s `day_assignments`/`places`/`categories`/`tours` tables. */
export type PublicApiAssignedPlacesKyselyDB = Pick<DB, 'day_assignments' | 'places' | 'categories' | 'tours'>;
