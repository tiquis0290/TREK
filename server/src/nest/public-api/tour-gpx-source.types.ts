/**
 * What the public API reads a tour's route through: the GPX file TREK's own
 * export writes (`TourGpxExportService`), so an integration gets the same file
 * the app hands out.
 *
 * A port rather than the export service itself: Tours reaches, through the
 * domains it imports, the Atlas domain, which mounts this domain's token
 * guard, so importing Tours from here would close a domain cycle. The Tours
 * domain binds the token (`TourGpxSourceModule`), globally, the way
 * JourneyAccessModule binds the realtime gateway's port.
 */
export const TOUR_GPX_SOURCE = Symbol('TOUR_GPX_SOURCE');

export interface TourGpxSource {
  /**
   * The tour on the place `placeId` of trip `tripId` as GPX. Throws a 404 for
   * a tour the trip does not hold and a `DomainError` with the code
   * `tour_without_route` for a tour without a line. Who may read the trip is
   * the caller's to decide.
   */
  export(tripId: string, placeId: string): Promise<{ gpx: string; filename: string }>;
}
