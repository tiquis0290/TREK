import { Places } from '../../db/entities/Places.entity';
import { TourWaypoints } from '../../db/entities/TourWaypoints.entity';
import { Tours } from '../../db/entities/Tours.entity';
import { PlaceImportModule } from '../place-import/place-import.module';
import { TourGpxExportService } from './tour-gpx-export.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

/**
 * A saved tour as a GPX file (PR1-06A), in a module of its own so the file can
 * be served outside the Tours module too: the public API hands the same file to
 * integrations (a watch loading a hike as a course) through
 * `TourGpxSourceModule`. It needs the tour, its place and its waypoints, and
 * PlaceImportModule's writer, which carries no further dependencies.
 *
 * Deciding who may read the trip stays with each caller.
 */
@Module({
  imports: [PlaceImportModule, MikroOrmModule.forFeature([Tours, Places, TourWaypoints])],
  providers: [TourGpxExportService],
  exports: [TourGpxExportService],
})
export class TourGpxExportModule {}
