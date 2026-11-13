/**
 * The place rows the public API (`public-api.service.ts`) reads, with the
 * Kysely table subsets their reads bind. They live beside the repositories so
 * those files stay readable; `PlacesRepository` re-exports the assigned-place
 * row, so callers keep importing it from there.
 */
import type { DB } from '../kysely/db';
import type { PlaceRow } from './Places.repository';

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

/** The `places` columns {@link PlacesRepository.listAssignedForPublicApi} selects, typed off {@link PlaceRow}. */
type PublicApiPlaceColumns = Pick<
  PlaceRow,
  'name' | 'address' | 'lat' | 'lng' | 'place_time' | 'end_time' | 'duration_minutes' | 'notes' | 'transport_mode'
>;

/** {@link PlacesRepository.listAssignedForPublicApi}'s projection. */
export interface PublicApiAssignedPlaceRow extends PublicApiPlaceColumns, PublicApiTourColumns {
  day_id: number;
  category: string | null;
}

/** {@link PlacesRepository.listAssignedForPublicApi}'s `day_assignments`/`places`/`categories`/`tours` tables. */
export type PublicApiAssignedPlacesKyselyDB = Pick<DB, 'day_assignments' | 'places' | 'categories' | 'tours'>;
