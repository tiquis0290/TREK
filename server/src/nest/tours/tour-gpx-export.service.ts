import { Places } from '../../db/entities/Places.entity';
import { TourWaypoints } from '../../db/entities/TourWaypoints.entity';
import { Tours } from '../../db/entities/Tours.entity';
import type { PlacesRepository } from '../../db/repositories/Places.repository';
import type { TourWaypointsRepository } from '../../db/repositories/TourWaypoints.repository';
import type { ToursRepository } from '../../db/repositories/Tours.repository';
import { DomainError } from '../common/domain-error';
import { toRowId } from '../common/row-id';
import { PlaceImportService } from '../place-import/place-import.service';
import { tourFitCourse } from './tour-fit-course.helpers';
import { encodeFitCourse } from './tour-fit.codec';
import { gpxActivityOf } from './tour-gpx-export.helpers';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, NotFoundException } from '@nestjs/common';

/**
 * PR1-06A: one saved tour as a GPX file, its whole saved line with the heights
 * it has, and the points that stand for a place of the trip as named waypoints. A read: nothing about the tour, its days or where it came from
 * changes, and a tour without a line of its own is refused rather than written
 * as a file that imports as nothing.
 */
@Injectable()
export class TourGpxExportService {
  constructor(
    @InjectRepository(Tours) private readonly toursRepo: ToursRepository,
    @InjectRepository(Places) private readonly placesRepo: PlacesRepository,
    @InjectRepository(TourWaypoints) private readonly waypointsRepo: TourWaypointsRepository,
    private readonly placeImport: PlaceImportService,
  ) {}

  async export(tripId: string, placeId: string): Promise<{ gpx: string; filename: string }> {
    const { tid, tour, place } = await this.find(tripId, placeId);
    const stops = await this.namedStops(tid, tour.place_id);

    const gpx = this.placeImport.writeTourGpx({
      name: tour.name,
      description: tour.description ?? null,
      website: tour.website ?? null,
      activity: gpxActivityOf(tour),
      route_geometry: place.route_geometry ?? null,
      stops,
    });
    if (!gpx) throw withoutRoute();
    return { gpx, filename: this.placeImport.tourGpxFilename(tour.name) };
  }

  /**
   * The same tour as a FIT course, for a Garmin watch, which takes a downloaded
   * course only as FIT: the same line read the same way, thinned to what a
   * watch holds, its named stops as course points, and the same refusals.
   */
  async exportFit(tripId: string, placeId: string): Promise<{ fit: Buffer; filename: string }> {
    const { tid, tour, place } = await this.find(tripId, placeId);
    const course = tourFitCourse({
      name: tour.name,
      activity: gpxActivityOf(tour),
      track: this.placeImport.readTourTrack(place.route_geometry ?? null),
      stops: await this.namedStops(tid, tour.place_id),
      // The moving time is kept in minutes.
      durationS: tour.duration != null ? tour.duration * 60 : null,
      createdAt: new Date(),
      // The place id tells this tour's course from another written in the same second.
      serial: tour.place_id,
    });
    if (!course) throw withoutRoute();
    return { fit: encodeFitCourse(course), filename: this.placeImport.tourFitFilename(tour.name) };
  }

  /** The tour and its place in the trip, or the 404 both files answer when either is missing. */
  private async find(tripId: string, placeId: string) {
    const tid = toRowId(tripId);
    const pid = toRowId(placeId);
    const tour = tid !== null && pid !== null ? await this.toursRepo.findInTrip(tid, pid) : undefined;
    const place = tour && tid !== null ? await this.placesRepo.findInTrip(tour.place_id, tid) : undefined;
    if (!tour || !place || tid === null) throw new NotFoundException('Tour not found');
    return { tid, tour, place };
  }

  /** The points that stand for a place of the trip (PR1-10), named after it, as the file's waypoints. */
  private async namedStops(
    tripId: number,
    placeId: number,
  ): Promise<Array<{ name: string; lat: number; lng: number }>> {
    const points = (await this.waypointsRepo.listForPlace(placeId)).filter((point) => point.linked_place_id);
    const names = await this.waypointsRepo.placeNames(
      tripId,
      points.map((point) => point.linked_place_id as number),
    );
    return points.flatMap((point) => {
      const name = names.get(point.linked_place_id as number);
      return name ? [{ name, lat: point.lat, lng: point.lng }] : [];
    });
  }
}

/** A tour without a line of its own is refused rather than written as a file that imports as nothing. */
function withoutRoute(): DomainError {
  return new DomainError(422, 'This tour has no route to export', { code: 'tour_without_route' });
}
