import {
  fitSerialOf,
  gpxActivityOf,
  stopsOnStage,
  tourStageCutsOf,
  tourStageFileName,
  tourStageName,
} from '../../../src/nest/tours/tour-gpx-export.helpers';

import { describe, expect, it } from 'vitest';

// TOUR-GPX-ACTIVITY-001 to TOUR-GPX-ACTIVITY-007

describe('gpxActivityOf (PR1-06A, BIK-01, RUN-01, SKI-02, HOR-01)', () => {
  it('TOUR-GPX-ACTIVITY-001: a bike tour names its profile, and the plainest riding without a known one', () => {
    expect(gpxActivityOf({ tour_type: 'bike', bike_profile: 'mtb' })).toBe('mountain_biking');
    expect(gpxActivityOf({ tour_type: 'bike', bike_profile: null })).toBe('cycling');
    expect(gpxActivityOf({ tour_type: 'bike', bike_profile: 'unicycle' })).toBe('cycling');
  });

  it('TOUR-GPX-ACTIVITY-002: a paddle tour names its boat, and paddling without a known one', () => {
    expect(gpxActivityOf({ tour_type: 'kayak', boat_type: 'canoe' })).toBe('canoeing');
    expect(gpxActivityOf({ tour_type: 'kayak', boat_type: null })).toBe('paddling');
    expect(gpxActivityOf({ tour_type: 'kayak', boat_type: 'raft' })).toBe('paddling');
  });

  it('TOUR-GPX-ACTIVITY-003: a hike is hiking, any other type its own key', () => {
    expect(gpxActivityOf({ tour_type: 'hike' })).toBe('hiking');
    expect(gpxActivityOf({ tour_type: 'walk' })).toBe('walk');
  });

  it('TOUR-GPX-ACTIVITY-004: snowshoes make a ski tour snowshoeing, a winter hike stays hiking, a hike is hiking (SKI-02)', () => {
    expect(gpxActivityOf({ tour_type: 'ski', ski_discipline: 'snowshoe' })).toBe('snowshoeing');
    expect(gpxActivityOf({ tour_type: 'ski', ski_discipline: 'winter_hike' })).toBe('hiking');
    expect(gpxActivityOf({ tour_type: 'hike', ski_discipline: null })).toBe('hiking');
    expect(gpxActivityOf({ tour_type: 'walk' })).toBe('walk');
  });

  it('TOUR-GPX-ACTIVITY-005: a run is running, and stays running without a profile this build knows (RUN-01)', () => {
    expect(gpxActivityOf({ tour_type: 'run', run_profile: 'running' })).toBe('running');
    expect(gpxActivityOf({ tour_type: 'run', run_profile: null })).toBe('running');
    expect(gpxActivityOf({ tour_type: 'run', run_profile: 'sprint' })).toBe('running');
    expect(gpxActivityOf({ tour_type: 'run', run_profile: 'trail' })).toBe('trail_running');
  });

  it('TOUR-GPX-ACTIVITY-006: a ski track names its discipline, and skiing without a known one (SKI-02)', () => {
    expect(gpxActivityOf({ tour_type: 'ski', ski_discipline: 'alpine' })).toBe('alpine_skiing');
    expect(gpxActivityOf({ tour_type: 'ski', ski_discipline: 'snowboard' })).toBe('snowboarding');
    expect(gpxActivityOf({ tour_type: 'ski', ski_discipline: 'cross_country' })).toBe('cross_country_skiing');
    expect(gpxActivityOf({ tour_type: 'ski', ski_discipline: 'touring' })).toBe('backcountry_skiing');
    expect(gpxActivityOf({ tour_type: 'ski', ski_discipline: null })).toBe('skiing');
    expect(gpxActivityOf({ tour_type: 'ski', ski_discipline: 'freeride' })).toBe('skiing');
  });

  it('TOUR-GPX-ACTIVITY-007: a horse tour is horseback riding (HOR-01)', () => {
    expect(gpxActivityOf({ tour_type: 'horse' })).toBe('horseback_riding');
  });
});

// TOUR-STAGE-CUT-001 to TOUR-STAGE-CUT-004
describe('tourStageCutsOf (MDT-02)', () => {
  type Role = 'start' | 'via' | 'end';
  const point = (key: string, lat: number, role: Role, stage_end = false) => ({
    key,
    lat,
    lng: 11,
    role,
    ...(stage_end ? { stage_end: true } : {}),
  });
  const points = [
    point('a', 47, 'start'),
    point('b', 47.01, 'via'),
    point('c', 47.02, 'via', true),
    point('e', 47.04, 'end'),
  ];
  const line = JSON.stringify([0, 1, 2, 3, 4].map((step) => [47 + step * 0.01, 11, 1000 + step]));

  it('TOUR-STAGE-CUT-001: cuts each stage from the stop it starts at to the next, with its heights and length', () => {
    const cuts = tourStageCutsOf(points, line);
    expect(cuts.map(({ key, number, count, from, to }) => ({ key, number, count, from, to }))).toEqual([
      { key: 'a', number: 1, count: 2, from: 0, to: 2 },
      { key: 'c', number: 2, count: 2, from: 2, to: 4 },
    ]);
    expect(JSON.parse(cuts[1].route_geometry)).toEqual([
      [47.02, 11, 1002],
      [47.03, 11, 1003],
      [47.04, 11, 1004],
    ]);
    // Two hundredths of a degree of latitude: about 2.2 km.
    expect(cuts[0].distance_m).toBeGreaterThan(2200);
    expect(cuts[0].distance_m).toBeLessThan(2240);
  });

  it('TOUR-STAGE-CUT-002: has none for a day tour, a line it cannot read, or one too short to reach a stage', () => {
    expect(
      tourStageCutsOf(
        points.map(({ stage_end: _, ...p }) => p),
        line,
      ),
    ).toEqual([]);
    expect(tourStageCutsOf(points, null)).toEqual([]);
    expect(tourStageCutsOf(points, 'not json')).toEqual([]);
    expect(tourStageCutsOf(points, '{"lat":47}')).toEqual([]);
    const short = JSON.stringify([
      [47, 11],
      ['x', 11],
      [47.01, 11],
      [47.02, 11],
    ]);
    expect(tourStageCutsOf(points, short).map((cut) => cut.key)).toEqual(['a']);
  });

  it('TOUR-STAGE-CUT-003: keeps the named stops that lie on a stage', () => {
    const stops = [
      { name: 'Hut', lat: 47.02, lng: 11 },
      { name: 'Lake', lat: 47.035, lng: 11 },
      { name: 'Spring', lat: 47.005, lng: 11 },
    ];
    expect(stopsOnStage(stops.slice(0, 2), line, { from: 2, to: 4 }).map((s) => s.name)).toEqual(['Hut', 'Lake']);
    expect(stopsOnStage([stops[2]], line, { from: 2, to: 4 })).toEqual([]);
  });

  it('TOUR-STAGE-CUT-004: names a stage by its number first, and a whole tour by its own name', () => {
    expect(tourStageName('Hut to hut', { number: 2, count: 3 })).toBe('2/3 Hut to hut');
    expect(tourStageName('Hut to hut', null)).toBe('Hut to hut');
    expect(tourStageFileName('Hut to hut', { number: 2, count: 3 })).toBe('Hut to hut 2-3');
    expect(tourStageFileName('Hut to hut', null)).toBe('Hut to hut');
  });

  it('TOUR-STAGE-CUT-005: gives each tour and each of its stages a FIT serial of its own, never 0', () => {
    const serials = [
      fitSerialOf(41, null),
      fitSerialOf(41, { number: 1 }),
      fitSerialOf(41, { number: 2 }),
      fitSerialOf(42, null),
    ];
    expect(new Set(serials).size).toBe(4);
    expect(serials.every((serial) => serial > 0 && serial <= 0xffffffff)).toBe(true);
    // The whole tour keeps the serial PR 3 gave it, its place id.
    expect(fitSerialOf(41, null)).toBe(41);
    expect(fitSerialOf(0x7fffffff, { number: 63 })).toBeGreaterThan(0);
  });
});
