import { Places } from '../../db/entities/Places.entity';
import { TourWaypoints } from '../../db/entities/TourWaypoints.entity';
import { Tours } from '../../db/entities/Tours.entity';
import { PlaceImportModule } from '../place-import/place-import.module';
import { TourGpxExportService } from './tour-gpx-export.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

/**
 * The GPX export of a saved tour (PR1-06A), in a module of its own so code
 * outside Tours can import it; the public API does, through
 * `TourGpxSourceModule`. Keep its imports this light: the tour, place and
 * waypoint tables and PlaceImportModule's writer, which brings nothing more.
 * Callers check trip access themselves.
 */
@Module({
  imports: [PlaceImportModule, MikroOrmModule.forFeature([Tours, Places, TourWaypoints])],
  providers: [TourGpxExportService],
  exports: [TourGpxExportService],
})
export class TourGpxExportModule {}
