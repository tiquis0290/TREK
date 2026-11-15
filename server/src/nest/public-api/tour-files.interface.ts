/**
 * The port the public API reads a tour's route files through: the GPX TREK's own
 * export writes, and the same line as a FIT course for a watch. Tours implements
 * it (`TourGpxExportModule` binds `TourGpxExportService` to `TOUR_FILES`) and
 * makes the binding global, so this domain never imports Tours: Tours reaches
 * Atlas, and Atlas imports this domain's token guard, so an import the other way
 * would close a domain cycle `lint:boundaries` refuses.
 *
 * Both files answer 404 (`Tour not found`) for a tour the trip does not hold,
 * and 422 with the code `tour_without_route` for a tour without a line. Given a
 * stage key (MDT-02), they serve that stage's stretch of the line alone, and
 * answer 404 (`Tour stage not found`) for a stage the tour does not have.
 */
export interface TourFileSource {
  export(tripId: string, placeId: string, stageKey?: string): Promise<{ gpx: string; filename: string }>;
  exportFit(tripId: string, placeId: string, stageKey?: string): Promise<{ fit: Buffer; filename: string }>;
  /** MDT-02: the stages each of these tours of the trip is cut into, by place id; a day tour has none. */
  stagesOf(tripId: number, placeIds: readonly number[]): Promise<Map<number, TourStageFacts[]>>;
}

/** MDT-02: one stage of a multi-day tour as the public API lists it. */
export interface TourStageFacts {
  key: string;
  number: number;
  count: number;
  distance_m: number;
}

export const TOUR_FILES = Symbol('TOUR_FILES');
