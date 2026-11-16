/**
 * What the public API reads a tour's route through: the GPX file TREK's own
 * export writes (`TourGpxExportService`), so an integration gets the same file
 * the app hands out, and the FIT course that export writes from the same line
 * for a watch.
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
  export(tripId: string, placeId: string, stageKey?: string): Promise<{ gpx: string; filename: string }>;

  /** The same tour as a FIT course, from the same line, under the same refusals as `export`. */
  exportFit(tripId: string, placeId: string, stageKey?: string): Promise<{ fit: Buffer; filename: string }>;

  /** MDT-02: the stages each of these tours of the trip is cut into, by place id; a day tour has none. */
  stagesOf(tripId: number, placeIds: readonly number[]): Promise<Map<number, TourStageFacts[]>>;
}

/**
 * MDT-02: one stage of a multi-day tour as the public API lists it on the day
 * that holds it. Given its `key` (the stop it starts at), `export` and
 * `exportFit` serve that stage's stretch of the line alone, and answer 404
 * (`Tour stage not found`) for a stage the tour does not have.
 */
export interface TourStageFacts {
  key: string;
  number: number;
  count: number;
  distance_m: number;
}
