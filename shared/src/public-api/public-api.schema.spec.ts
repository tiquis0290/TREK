import {
  publicApiPlaceSchema,
  publicApiReservationEndpointSchema,
  publicApiReservationSchema,
  publicApiTransitLegSchema,
} from './public-api.schema';

import { describe, expect, it } from 'vitest';

const PLACE = {
  name: 'Ridge walk',
  address: null,
  lat: 47.42,
  lng: 10.98,
  time: null,
  end_time: null,
  duration_minutes: null,
  category: null,
  notes: null,
  transport_mode: 'walking',
};

const BOOKING = {
  type: 'transit',
  title: 'Brno → Praha',
  location: null,
  time: '2026-08-01T08:02',
  end_time: null,
  status: 'confirmed',
  notes: null,
};

const LEG = {
  mode: 'LONG_DISTANCE',
  line: 'EC 278',
  headsign: 'Praha hl.n.',
  agency: 'České dráhy',
  duration_s: 8880,
  stops: 2,
  from: { name: 'Brno hl.n.', time: '08:28', track: '3', lat: 49.19, lng: 16.61 },
  to: { name: 'Praha hl.n.', time: '10:56', track: '5', lat: 50.08, lng: 14.43 },
};

describe('public API v1 tour fields', () => {
  it('describes a tour with its GPX and FIT links, type and length in metres', () => {
    const tour = {
      ...PLACE,
      gpx_url: '/api/v1/trips/3/tours/30/gpx',
      fit_url: '/api/v1/trips/3/tours/30/fit',
      tour_type: 'hike',
      distance_m: 12346,
      tour_stage: null,
    };
    expect(publicApiPlaceSchema.parse(tour)).toEqual(tour);
  });

  it('MDT-02: names the stage of a multi-day tour a day holds, of at least two', () => {
    const stage = {
      ...PLACE,
      gpx_url: '/api/v1/trips/3/tours/30/gpx?stage=hut',
      fit_url: '/api/v1/trips/3/tours/30/fit?stage=hut',
      tour_type: 'hike',
      distance_m: 6100,
      tour_stage: { number: 2, count: 3 },
    };
    expect(publicApiPlaceSchema.parse(stage)).toEqual(stage);
    const at = (tour_stage: unknown) => publicApiPlaceSchema.safeParse({ ...stage, tour_stage }).success;
    expect(at({ number: 0, count: 3 })).toBe(false);
    expect(at({ number: 1, count: 1 })).toBe(false);
    expect(at(undefined)).toBe(false);
  });

  it('describes a plain place with all five tour fields null', () => {
    const plain = { ...PLACE, gpx_url: null, fit_url: null, tour_type: null, distance_m: null, tour_stage: null };
    expect(publicApiPlaceSchema.safeParse(plain).success).toBe(true);
  });

  it('holds fit_url as part of the contract, next to gpx_url', () => {
    const withoutFit = { ...PLACE, gpx_url: null, tour_type: null, distance_m: null, tour_stage: null };
    expect(publicApiPlaceSchema.safeParse(withoutFit).success).toBe(false);
  });

  it('holds the tour fields as part of the contract, not as optional extras', () => {
    expect(publicApiPlaceSchema.safeParse(PLACE).success).toBe(false);
  });

  it('takes the length in whole, non-negative metres', () => {
    const at = (distance_m: number) =>
      publicApiPlaceSchema.safeParse({
        ...PLACE,
        gpx_url: null,
        fit_url: null,
        tour_type: 'run',
        distance_m,
        tour_stage: null,
      }).success;
    expect(at(0)).toBe(true);
    expect(at(12.5)).toBe(false);
    expect(at(-1)).toBe(false);
  });
});

describe('public API v1 transport fields', () => {
  it('describes a journey with its points and legs', () => {
    const journey = {
      ...BOOKING,
      endpoints: [
        {
          role: 'from',
          name: 'Brno hl.n.',
          code: null,
          lat: 49.19,
          lng: 16.61,
          local_date: '2026-08-01',
          local_time: '08:28',
        },
      ],
      legs: [LEG],
    };
    expect(publicApiReservationSchema.parse(journey)).toEqual(journey);
  });

  it('describes a booking that is no journey with two empty lists', () => {
    expect(publicApiReservationSchema.safeParse({ ...BOOKING, endpoints: [], legs: [] }).success).toBe(true);
    expect(publicApiReservationSchema.safeParse(BOOKING).success).toBe(false);
  });

  it('names a point only from, stop or to', () => {
    const point = { name: 'X', code: null, lat: 0, lng: 0, local_date: null, local_time: null };
    expect(publicApiReservationEndpointSchema.safeParse({ ...point, role: 'stop' }).success).toBe(true);
    expect(publicApiReservationEndpointSchema.safeParse({ ...point, role: 'layover' }).success).toBe(false);
  });

  it('describes a walk leg, which has no line', () => {
    const walk = { ...LEG, mode: 'WALK', line: null, headsign: null, agency: null, stops: 0 };
    expect(publicApiTransitLegSchema.safeParse(walk).success).toBe(true);
  });

  it('places each end of a leg, or says it cannot with null', () => {
    const unplaced = { name: null, time: null, track: null, lat: null, lng: null };
    expect(publicApiTransitLegSchema.safeParse({ ...LEG, from: unplaced }).success).toBe(true);
    expect(publicApiTransitLegSchema.safeParse({ ...LEG, to: { ...LEG.to, lat: 91 } }).success).toBe(false);
    expect(publicApiTransitLegSchema.safeParse({ ...LEG, to: { ...LEG.to, lng: -181 } }).success).toBe(false);
    const { lat: _lat, ...withoutLat } = LEG.from;
    expect(publicApiTransitLegSchema.safeParse({ ...LEG, from: withoutLat }).success).toBe(false);
  });
});
