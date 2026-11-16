/**
 * The port the public API reads a tour's route through: the GPX file TREK's
 * own export writes (`TourGpxExportService`), so integrations get the file the
 * app hands out.
 *
 * Do not import the Tours module from public-api instead: Tours reaches the
 * Atlas domain, which mounts this domain's token guard, so that import closes
 * a domain cycle. Tours binds the token globally (`TourGpxSourceModule`), the
 * way JourneyAccessModule binds the realtime gateway's port.
 */
export const TOUR_GPX_SOURCE = Symbol('TOUR_GPX_SOURCE');

export interface TourGpxSource {
  /**
   * The tour on the place `placeId` of trip `tripId` as GPX. Throws Nest's
   * `NotFoundException` for a tour the trip does not hold and a `DomainError`
   * with the code `tour_without_route` for a tour without a line. Checking who
   * may read the trip is the caller's job.
   */
  export(tripId: string, placeId: string): Promise<{ gpx: string; filename: string }>;
}
