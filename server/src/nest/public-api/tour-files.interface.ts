/**
 * The port the public API reads a tour's route files through: the GPX TREK's own
 * export writes, and the same line as a FIT course for a watch. Tours implements
 * it (`TourGpxExportModule` binds `TourGpxExportService` to `TOUR_FILES`) and
 * makes the binding global, so this domain never imports Tours: Tours reaches
 * Atlas, and Atlas imports this domain's token guard, so an import the other way
 * would close a domain cycle `lint:boundaries` refuses.
 *
 * Both methods answer 404 (`Tour not found`) for a tour the trip does not hold,
 * and 422 with the code `tour_without_route` for a tour without a line.
 */
export interface TourFileSource {
  export(tripId: string, placeId: string): Promise<{ gpx: string; filename: string }>;
  exportFit(tripId: string, placeId: string): Promise<{ fit: Buffer; filename: string }>;
}

export const TOUR_FILES = Symbol('TOUR_FILES');
