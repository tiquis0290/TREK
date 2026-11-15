import { Places } from '../../db/entities/Places.entity';
import { TourWaypoints } from '../../db/entities/TourWaypoints.entity';
import { Tours } from '../../db/entities/Tours.entity';
import type { PlacesRepository } from '../../db/repositories/Places.repository';
import type { TourWaypointsRepository } from '../../db/repositories/TourWaypoints.repository';
import type { ToursRepository } from '../../db/repositories/Tours.repository';
import { DomainError } from '../common/domain-error';
import { toRowId } from '../common/row-id';
import { PlaceImportService } from '../place-import/place-import.service';
import type { TourStageFacts } from '../public-api/tour-files.interface';
import {
  fitSerialOf,
  fitSportOf,
  gpxActivityOf,
  stopsOnStage,
  tourStageCutsOf,
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
    const stage = await this.stage(tour.place_id, place.route_geometry ?? null, stageKey);
    const named = await this.namedStops(tid, tour.place_id);
    const stops = stage ? stopsOnStage(named, place.route_geometry ?? null, stage) : named;

    const gpx = this.placeImport.writeTourGpx({
      name: tourStageName(tour.name, stage),
      description: tour.description ?? null,
      website: tour.website ?? null,
      activity: gpxActivityOf(tour),
      route_geometry: stage ? stage.route_geometry : (place.route_geometry ?? null),
      stops,
    });
    if (!gpx) throw withoutRoute();
    return { gpx, filename: this.placeImport.tourGpxFilename(stageFileName(tour.name, stage)) };
  }

  /**
   * The same tour as a FIT course, for a Garmin watch, which takes a downloaded
   * course only as FIT. The same line and the same refusals as the GPX; a
   * course has no waypoints, so the named stops stay out.
   */
  async exportFit(tripId: string, placeId: string, stageKey?: string): Promise<{ fit: Buffer; filename: string }> {
    const { tour, place } = await this.find(tripId, placeId);
    const stage = await this.stage(tour.place_id, place.route_geometry ?? null, stageKey);
    const fit = this.placeImport.writeTourFit({
      name: tourStageName(tour.name, stage),
      sport: fitSportOf(tour.tour_type),
      route_geometry: stage ? stage.route_geometry : (place.route_geometry ?? null),
      serial: fitSerialOf(tour.place_id, stage),
    });
    if (!fit) throw withoutRoute();
    return { fit, filename: this.placeImport.tourFitFilename(stageFileName(tour.name, stage)) };
  }

  /**
   * MDT-02: the stages each multi-day tour among these places of the trip is cut into, as
   * the public API lists them on the days that hold them. A place that is no
   * multi-day tour, or whose line reaches none of its stages, has none.
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

  /** The stage a file is cut to, none without a key, or the 404 a stage the tour does not have answers. */
  private async stage(placeId: number, routeGeometry: string | null, stageKey: string | undefined) {
    if (stageKey === undefined) return null;
    const cut = tourStageCutsOf(await this.toursRepo.listStagePoints(placeId), routeGeometry).find(
      (stage) => stage.key === stageKey,
    );
    if (!cut) throw new NotFoundException('Tour stage not found');
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

/** A tour without a line of its own is refused rather than written as a file that imports as nothing. */
function withoutRoute(): DomainError {
  return new DomainError(422, 'This tour has no route to export', { code: 'tour_without_route' });
}

/** A stage's file is named after the tour and the stage, so the stages of one tour download side by side. */
function stageFileName(tourName: string, stage: TourStageCut | null): string {
  return stage ? `${tourName} ${stage.number}-${stage.count}` : tourName;
}
