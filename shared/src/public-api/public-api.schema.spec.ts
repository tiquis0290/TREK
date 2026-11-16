import { publicApiPlaceSchema, publicApiTourGpxPath } from './public-api.schema';

import { describe, it, expect } from 'vitest';

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
