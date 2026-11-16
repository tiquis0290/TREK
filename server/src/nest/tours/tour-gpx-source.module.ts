import { TOUR_GPX_SOURCE } from '../public-api/tour-gpx-source.types';
import { TourGpxExportModule } from './tour-gpx-export.module';
import { TourGpxExportService } from './tour-gpx-export.service';
import { Global, Module } from '@nestjs/common';

/**
 * Binds the public API's TOUR_GPX_SOURCE port to TourGpxExportService, so
 * `GET /api/v1/trips/{id}/tours/{placeId}/gpx` serves the file the app's own
 * export writes. Global so PublicApiModule resolves it without importing this
 * domain (see `tour-gpx-source.types.ts`); AppModule imports it.
 */
@Global()
@Module({
  imports: [TourGpxExportModule],
  providers: [{ provide: TOUR_GPX_SOURCE, useExisting: TourGpxExportService }],
  exports: [TOUR_GPX_SOURCE],
})
export class TourGpxSourceModule {}
