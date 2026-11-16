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
import type { TourStageFacts } from '../public-api/tour-gpx-source.types';
import {
  fitSerialOf,
  gpxActivityOf,
  stopsOnStage,
  tourStageCutsOf,
  tourStageFileName,
  tourStageName,
  type TourStageCut,
} from './tour-gpx-export.helpers';
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

  async export(tripId: string, placeId: string, stageKey?: string): Promise<{ gpx: string; filename: string }> {
    const { tid, tour, place } = await this.find(tripId, placeId);
    const line = place.route_geometry ?? null;
    const stage = await this.stage(tour.place_id, line, stageKey);
    const named = await this.namedStops(tid, tour.place_id);

    const gpx = this.placeImport.writeTourGpx({
      name: tourStageName(tour.name, stage),
      description: tour.description ?? null,
      website: tour.website ?? null,
      activity: gpxActivityOf(tour),
      route_geometry: stage ? stage.route_geometry : line,
      stops: stage ? stopsOnStage(named, line, stage) : named,
    });
    if (!gpx) throw withoutRoute();
    return { gpx, filename: this.placeImport.tourGpxFilename(tourStageFileName(tour.name, stage)) };
  }

  /**
   * The same tour as a FIT course, for a Garmin watch, which takes a downloaded
   * course only as FIT: the same line read the same way, thinned to what a
   * watch holds, its named stops as course points, and the same refusals.
   */
  async exportFit(tripId: string, placeId: string, stageKey?: string): Promise<{ fit: Buffer; filename: string }> {
    const { tid, tour, place } = await this.find(tripId, placeId);
    const line = place.route_geometry ?? null;
    const stage = await this.stage(tour.place_id, line, stageKey);
    const named = await this.namedStops(tid, tour.place_id);
    const course = tourFitCourse({
      name: tourStageName(tour.name, stage),
      activity: gpxActivityOf(tour),
      track: this.placeImport.readTourTrack(stage ? stage.route_geometry : line),
      stops: stage ? stopsOnStage(named, line, stage) : named,
      // The moving time is kept in minutes; a stage takes its share of it by length.
      durationS: movingSecondsOf(tour, stage),
      createdAt: new Date(),
      // Tells this course from another written in the same second: the tour's, and each stage's own.
      serial: fitSerialOf(tour.place_id, stage),
    });
    if (!course) throw withoutRoute();
    return { fit: encodeFitCourse(course), filename: this.placeImport.tourFitFilename(tourStageFileName(tour.name, stage)) };
  }

  /**
   * MDT-02: the stages each multi-day tour among these places of the trip is
   * cut into, as the public API lists them on the days that hold them. A place
   * that is no multi-day tour, or whose line reaches none of its stages, has none.
   */
  async stagesOf(tripId: number, placeIds: readonly number[]): Promise<Map<number, TourStageFacts[]>> {
    const read = async (placeId: number): Promise<[number, TourStageFacts[]]> => {
      const [place, points] = await Promise.all([
        this.placesRepo.findInTrip(placeId, tripId),
        this.toursRepo.listStagePoints(placeId),
      ]);
      const cuts = tourStageCutsOf(points, place?.route_geometry ?? null);
      return [placeId, cuts.map(({ key, number, count, distance_m }) => ({ key, number, count, distance_m }))];
    };
    const tours = await Promise.all([...new Set(placeIds)].map(read));
    return new Map(tours.filter(([, stages]) => stages.length > 0));
  }

  /** The stage a file is cut to: none without a key, else the stage, or the 404 for one the tour does not have. */
  private async stage(placeId: number, line: string | null, stageKey: string | undefined): Promise<TourStageCut | null> {
    if (stageKey === undefined) return null;
    const cut = tourStageCutsOf(await this.toursRepo.listStagePoints(placeId), line).find(
      (stage) => stage.key === stageKey,
    );
    // A DomainError, not Nest's NotFoundException: in production the SPA fallback answers a GET's
    // NotFoundException with index.html.
    if (!cut) throw new DomainError(404, 'Tour stage not found');
    return cut;
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

/**
 * The moving time of a course in seconds: the tour's (kept in minutes), and for
 * one stage its share by length; none when the tour has no time or no length.
 */
function movingSecondsOf(
  tour: { duration?: number | null; distance?: number | null },
  stage: TourStageCut | null,
): number | null {
  if (tour.duration == null) return null;
  if (!stage) return tour.duration * 60;
  const km = tour.distance;
  return km != null && km > 0 ? Math.round(tour.duration * 60 * Math.min(1, stage.distance_m / (km * 1000))) : null;
}

/** A tour without a line of its own is refused rather than written as a file that imports as nothing. */
function withoutRoute(): DomainError {
  return new DomainError(422, 'This tour has no route to export', { code: 'tour_without_route' });
}
