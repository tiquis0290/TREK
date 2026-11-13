import { Places } from '../../db/entities/Places.entity';
import { TourWaypoints } from '../../db/entities/TourWaypoints.entity';
import { Tours } from '../../db/entities/Tours.entity';
import { PlaceImportModule } from '../place-import/place-import.module';
import { TOUR_FILES } from '../public-api/tour-files.interface';
import { TourGpxExportService } from './tour-gpx-export.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Global, Module } from '@nestjs/common';

/**
 * A saved tour as a GPX file (PR1-06A) or a FIT course, in a module of its own
 * so the public API takes these two writers without the whole Tours module:
 * it serves the same files to integrations (a watch turning a hike into a
 * course). It needs the tour, its place and its waypoints, and the writers of
 * PlaceImportModule, which carry no further dependencies.
 *
 * Global because the public API reads the files through its `TOUR_FILES` port
 * and cannot import this domain (see `tour-files.interface.ts`), the same
 * binding JourneyAccessModule makes for the realtime gateway. ToursModule
 * imports it, which is what puts it in the application; a test harness that
 * mounts PublicApiModule without ToursModule imports it itself.
 *
 * Deciding who may read the trip stays with the caller, as it does for the
 * Tours route that serves the file to the app.
 */
@Global()
@Module({
  imports: [PlaceImportModule, MikroOrmModule.forFeature([Tours, Places, TourWaypoints])],
  providers: [TourGpxExportService, { provide: TOUR_FILES, useExisting: TourGpxExportService }],
  exports: [TourGpxExportService, TOUR_FILES],
})
export class TourGpxExportModule {}
