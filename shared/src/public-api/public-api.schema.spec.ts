import {
  publicApiPlaceSchema,
  publicApiReservationEndpointSchema,
  publicApiReservationSchema,
  publicApiTourGpxPath,
  publicApiTransitLegSchema,
} from './public-api.schema';

import { describe, expect, it } from 'vitest';

/** A place as the public API sends it when it is no tour. */
const PLAIN_PLACE = {
  name: 'Uffizi',
  address: null,
  lat: 43.76,
  lng: 11.25,
  time: null,
  end_time: null,
  duration_minutes: null,
  category: null,
  notes: null,
  transport_mode: null,
  gpx_url: null,
  tour_type: null,
  distance_m: null,
  tour_stage: null,
};

describe('publicApiPlaceSchema', () => {
  it('accepts a place that is no tour, with the three tour fields null', () => {
    expect(publicApiPlaceSchema.parse(PLAIN_PLACE)).toEqual(PLAIN_PLACE);
  });

  it('accepts a tour with its link, type and length', () => {
    const tour = { ...PLAIN_PLACE, gpx_url: publicApiTourGpxPath(3, 30), tour_type: 'hike', distance_m: 12346 };
    expect(publicApiPlaceSchema.parse(tour)).toEqual(tour);
  });

  it('refuses a place that leaves a tour field out, because every field is always on the wire', () => {
    for (const key of ['gpx_url', 'tour_type', 'distance_m'] as const) {
      const { [key]: _dropped, ...rest } = PLAIN_PLACE;
      expect(publicApiPlaceSchema.safeParse(rest).success).toBe(false);
    }
  });

  it('refuses a length that is not a number', () => {
    expect(publicApiPlaceSchema.safeParse({ ...PLAIN_PLACE, distance_m: '12 km' }).success).toBe(false);
  });
});

describe('publicApiTourGpxPath', () => {
  it('is relative to the instance, so it survives a reverse proxy', () => {
    expect(publicApiTourGpxPath(12, 345)).toBe('/api/v1/trips/12/tours/345/gpx');
  });
});

const BOOKING = {
  type: 'transit',
  title: 'Brno – Praha',
  location: null,
  time: '2026-06-14T08:02',
  end_time: '2026-06-14T10:56',
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
  from: { name: 'Brno hl.n.', time: '08:28', track: '3', lat: 49.1906, lng: 16.6128 },
  to: { name: 'Praha hl.n.', time: '10:56', track: '5', lat: 50.0831, lng: 14.4348 },
};

describe('publicApiReservationSchema', () => {
  it('a booking with no transport carries both lists, empty', () => {
    expect(publicApiReservationSchema.parse({ ...BOOKING, endpoints: [], legs: [] })).toEqual({
      ...BOOKING,
      endpoints: [],
      legs: [],
    });
  });

  it('the two lists are part of the contract, not optional extras', () => {
    expect(publicApiReservationSchema.safeParse(BOOKING).success).toBe(false);
    expect(publicApiReservationSchema.safeParse({ ...BOOKING, endpoints: [] }).success).toBe(false);
  });

  it('a transit booking carries its points and its legs', () => {
    const endpoint = {
      name: 'Brno hl.n.',
      code: null,
      lat: 49.19,
      lng: 16.61,
      local_date: '2026-06-14',
      local_time: '08:28',
    };
    const parsed = publicApiReservationSchema.parse({ ...BOOKING, endpoints: [endpoint], legs: [LEG] });
    expect(parsed.endpoints).toEqual([endpoint]);
    expect(parsed.legs).toEqual([LEG]);
  });
});

describe('publicApiReservationEndpointSchema', () => {
  it('a point always has a name and a place; its code, date and time may be unknown', () => {
    const bare = { name: 'FRA', code: null, lat: 50.03, lng: 8.57, local_date: null, local_time: null };
    expect(publicApiReservationEndpointSchema.parse(bare)).toEqual(bare);
    expect(publicApiReservationEndpointSchema.safeParse({ ...bare, lat: null }).success).toBe(false);
  });
});

describe('publicApiTransitLegSchema', () => {
  it('a walk has no line, and an end TREK cannot place has no coordinates', () => {
    const walk = {
      ...LEG,
      mode: 'WALK',
      line: null,
      headsign: null,
      agency: null,
      stops: null,
      to: { name: null, time: null, track: null, lat: null, lng: null },
    };
    expect(publicApiTransitLegSchema.parse(walk)).toEqual(walk);
  });

  it('refuses a place off the globe, a negative duration and a fractional stop count', () => {
    expect(publicApiTransitLegSchema.safeParse({ ...LEG, from: { ...LEG.from, lat: 91 } }).success).toBe(false);
    expect(publicApiTransitLegSchema.safeParse({ ...LEG, to: { ...LEG.to, lng: -181 } }).success).toBe(false);
    expect(publicApiTransitLegSchema.safeParse({ ...LEG, duration_s: -1 }).success).toBe(false);
    expect(publicApiTransitLegSchema.safeParse({ ...LEG, stops: 1.5 }).success).toBe(false);
  });
});
