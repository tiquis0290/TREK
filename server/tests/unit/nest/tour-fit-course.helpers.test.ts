import {
  FIT_COURSE_MAX_POINTS,
  FIT_COURSE_MAX_STOPS,
  fitSportOf,
  thinTrack,
  tourFitCourse,
  type TourFitInput,
  type TrackPoint,
} from '../../../src/nest/tours/tour-fit-course.helpers';
import { encodeFitCourse } from '../../../src/nest/tours/tour-fit.codec';
import { gpxActivityOf } from '../../../src/nest/tours/tour-gpx-export.helpers';
import { decodeFit, fromSemicircles, messagesOf, num, referenceFitCrc } from '../../helpers/fit-decoder';
import { longHikeTrack } from '../../helpers/fit-tracks';
import { haversineMetres } from '@trek/shared';

import { describe, expect, it } from 'vitest';

// TOUR-FIT-COURSE-001 to TOUR-FIT-COURSE-013

const CREATED_AT = new Date('2026-08-01T06:00:00Z');

/** A straight line north of `n` points 10 m apart, flat at 500 m. */
function straight(n: number): TrackPoint[] {
  return Array.from({ length: n }, (_, i) => ({ lat: 47 + (i * 10) / 111_320, lng: 11, ele: 500 }));
}

function input(overrides: Partial<TourFitInput> = {}): TourFitInput {
  return {
    name: 'Seerunde',
    activity: 'hiking',
    track: straight(11),
    stops: [],
    durationS: null,
    createdAt: CREATED_AT,
    serial: 7,
    ...overrides,
  };
}

function built(overrides: Partial<TourFitInput> = {}) {
  const course = tourFitCourse(input(overrides));
  if (!course) throw new Error('expected a course');
  return course;
}

describe('thinTrack', () => {
  it('TOUR-FIT-COURSE-001: a line at or under the cap keeps every point', () => {
    expect(thinTrack(straight(5), 5)).toEqual([0, 1, 2, 3, 4]);
    expect(thinTrack(straight(2), 1)).toEqual([0, 1]);
  });

  it('TOUR-FIT-COURSE-002: a long line lands on the cap exactly, both ends kept, in order', () => {
    const track = longHikeTrack(6000);
    const kept = thinTrack(track, FIT_COURSE_MAX_POINTS);
    expect(kept).toHaveLength(FIT_COURSE_MAX_POINTS);
    expect(kept[0]).toBe(0);
    expect(kept[kept.length - 1]).toBe(track.length - 1);
    expect([...kept].sort((a, b) => a - b)).toEqual(kept);
    expect(new Set(kept).size).toBe(kept.length);
  });

  it('TOUR-FIT-COURSE-003: points on a straight stretch go first, a hairpin a stride would skip stays', () => {
    const line = straight(101);
    line[37] = { lat: line[37].lat, lng: 11.001, ele: 500 }; // a 76 m spike sideways
    expect(thinTrack(line, 3)).toEqual([0, 37, 100]);
    // Nothing left off its segment: the line stops short of the cap rather than keep a straight point.
    expect(thinTrack(straight(50), 10)).toEqual([0, 49]);
  });

  it('TOUR-FIT-COURSE-004: a summit on a straight ridge stays, by its height', () => {
    const ridge = straight(101).map((point, i) => ({ ...point, ele: i === 60 ? 900 : 500 }));
    expect(thinTrack(ridge, 3)).toEqual([0, 60, 100]);
    // Without heights on its neighbours the climb cannot be measured, and the summit is a straight point.
    const partial = ridge.map((point, i) => (i === 0 ? { ...point, ele: null } : point));
    expect(thinTrack(partial, 3)).toEqual([0, 100]);
  });

  it('TOUR-FIT-COURSE-005: the thinned line keeps the shape: no dropped point lies far off it', () => {
    const track = longHikeTrack(6000);
    const kept = thinTrack(track, 1500);
    let worst = 0;
    for (let k = 1; k < kept.length; k++) {
      const [a, b] = [track[kept[k - 1]], track[kept[k]]];
      for (let i = kept[k - 1] + 1; i < kept[k]; i++) {
        const p = track[i];
        // Off the chord, by the triangle the point makes with its ends.
        const ab = haversineMetres(a.lat, a.lng, b.lat, b.lng);
        const ap = haversineMetres(a.lat, a.lng, p.lat, p.lng);
        const bp = haversineMetres(b.lat, b.lng, p.lat, p.lng);
        const s = (ab + ap + bp) / 2;
        const area = Math.sqrt(Math.max(0, s * (s - ab) * (s - ap) * (s - bp)));
        worst = Math.max(worst, ab > 0 ? (2 * area) / ab : ap);
      }
    }
    expect(worst).toBeLessThan(5);
  });
});

describe('fitSportOf', () => {
  it('TOUR-FIT-COURSE-006: names the FIT sport of each activity the GPX names, generic for any other', () => {
    const sport = (tour: Parameters<typeof gpxActivityOf>[0]) => fitSportOf(gpxActivityOf(tour)).sport;
    expect(sport({ tour_type: 'hike' })).toBe(17);
    expect(sport({ tour_type: 'walk' })).toBe(11);
    expect(sport({ tour_type: 'food' })).toBe(11);
    expect(sport({ tour_type: 'run', run_profile: 'trail' })).toBe(1);
    expect(sport({ tour_type: 'bike', bike_profile: 'gravel' })).toBe(2);
    expect(sport({ tour_type: 'kayak', boat_type: 'sup' })).toBe(19);
    expect(sport({ tour_type: 'ski', ski_discipline: 'alpine' })).toBe(13);
    expect(sport({ tour_type: 'ski', ski_discipline: 'snowboard' })).toBe(14);
    expect(sport({ tour_type: 'ski', ski_discipline: 'snowshoe' })).toBe(35);
    expect(sport({ tour_type: 'ski', ski_discipline: 'touring' })).toBe(12);
    expect(sport({ tour_type: 'ski', ski_discipline: 'winter_hike' })).toBe(17);
    expect(sport({ tour_type: 'horse' })).toBe(27);
    expect(fitSportOf('paragliding')).toEqual({ sport: 0, speed: 1.1 });
  });
});

describe('tourFitCourse', () => {
  it('TOUR-FIT-COURSE-007: no course under two points', () => {
    expect(tourFitCourse(input({ track: [] }))).toBeNull();
    expect(tourFitCourse(input({ track: straight(1) }))).toBeNull();
  });

  it('TOUR-FIT-COURSE-008: distances run over the whole saved line, so thinning does not shorten the course', () => {
    const track = longHikeTrack(6000);
    const course = built({ track });
    let total = 0;
    for (let i = 1; i < track.length; i++)
      total += haversineMetres(track[i - 1].lat, track[i - 1].lng, track[i].lat, track[i].lng);
    expect(course.records).toHaveLength(FIT_COURSE_MAX_POINTS);
    expect(course.records[course.records.length - 1].distanceM).toBeCloseTo(total, 6);
    expect(course.records[0].distanceM).toBe(0);
  });

  it('TOUR-FIT-COURSE-009: the tour’s own moving time is spread along it; without one, the sport’s speed', () => {
    const own = built({ durationS: 600 });
    expect(own.records[0].elapsedS).toBe(0);
    expect(own.records[5].elapsedS).toBeCloseTo(300, 6);
    expect(own.records[10].elapsedS).toBeCloseTo(600, 6);
    const hike = built();
    const metres = hike.records[10].distanceM;
    expect(metres).toBeCloseTo(100, 0);
    expect(hike.records[10].elapsedS).toBeCloseTo(metres / 1.1, 6);
    const ride = built({ activity: 'cycling', durationS: 0 });
    expect(ride.sport).toBe(2);
    expect(ride.records[10].elapsedS).toBeCloseTo(metres / 5, 6);
    // A line that goes nowhere has nothing to spread a time over.
    const still = built({ track: [straight(1)[0], straight(1)[0]] });
    expect(still.records.map((r) => r.elapsedS)).toEqual([0, 0]);
  });

  it('TOUR-FIT-COURSE-010: each named stop sits where the line passes nearest, in order along it', () => {
    const line = straight(11);
    const course = built({
      durationS: 1000,
      stops: [
        { name: 'Gipfel', lat: line[8].lat, lng: 11.0002 },
        { name: 'Quelle', lat: line[3].lat, lng: 10.9999 },
      ],
    });
    expect(course.coursePoints.map((p) => p.name)).toEqual(['Quelle', 'Gipfel']);
    expect(course.coursePoints[0].distanceM).toBeCloseTo(30, 0);
    expect(course.coursePoints[1].distanceM).toBeCloseTo(80, 0);
    expect(course.coursePoints[1].elapsedS).toBeCloseTo(800, 0);
    expect(course.coursePoints[1]).toMatchObject({ lat: line[8].lat, lng: 11.0002 });
  });

  it('TOUR-FIT-COURSE-011: at most the cap of named stops, the first ones along the line', () => {
    const line = straight(11);
    const stops = Array.from({ length: FIT_COURSE_MAX_STOPS + 5 }, (_, i) => ({
      name: `S${i}`,
      lat: line[10 - (i % 11)].lat,
      lng: 11,
    }));
    const course = built({ stops });
    expect(course.coursePoints).toHaveLength(FIT_COURSE_MAX_STOPS);
    expect(course.coursePoints[0].distanceM).toBe(0);
  });

  it('TOUR-FIT-COURSE-012: a written course decodes back to its thinned route, CRC valid', () => {
    const track = longHikeTrack(6000);
    const course = built({
      track,
      durationS: 4 * 3600,
      stops: [{ name: 'Hütte', lat: track[3000].lat, lng: track[3000].lng }],
    });
    const file = encodeFitCourse(course);
    expect(referenceFitCrc(file)).toBe(0);
    const fit = decodeFit(file);
    const records = messagesOf(fit, 20);
    expect(records).toHaveLength(FIT_COURSE_MAX_POINTS);
    const kept = thinTrack(track);
    records.forEach((record, i) => {
      const point = track[kept[i]];
      expect(Math.abs(fromSemicircles(num(record, 0)) - point.lat)).toBeLessThan(1e-7);
      expect(Math.abs(fromSemicircles(num(record, 1)) - point.lng)).toBeLessThan(1e-7);
      expect(num(record, 2)).toBe(Math.round((point.ele + 500) * 5));
    });
    const distances = records.map((r) => num(r, 5));
    const times = records.map((r) => num(r, 253));
    expect(distances.every((d, i) => i === 0 || d >= distances[i - 1])).toBe(true);
    expect(times.every((t, i) => i === 0 || t >= times[i - 1])).toBe(true);
    expect(times[times.length - 1] - times[0]).toBe(4 * 3600);
    const [hut] = messagesOf(fit, 32);
    expect(hut.fields.get(6)).toBe('Hütte');
    expect(num(hut, 4)).toBe(Math.round(course.coursePoints[0].distanceM * 100));
  });

  it('TOUR-FIT-COURSE-013: a thinned file stays small enough for the trip to the watch', () => {
    const file = encodeFitCourse(built({ track: longHikeTrack(20000) }));
    expect(file.length).toBeLessThan(45_000);
  });
});
