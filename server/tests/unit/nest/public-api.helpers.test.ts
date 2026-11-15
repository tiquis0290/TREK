/**
 * transitLegsOf: where each end of a transit leg is.
 *
 * A watch guides the traveller through every change of a journey, from the stop
 * one ride leaves them at to the stop the next one boards at, so each end of each
 * leg needs a place. Pinned here: the order the place is found in (the stored one,
 * the leg's drawn line, its neighbours, the booking's own points), that only
 * valid coordinates come out, and that the line itself never does.
 */
import { transitLegsOf } from '../../../src/nest/public-api/public-api.helpers';
import { encodePolyline } from '../../../src/utils/polyline';
import type { PublicApiReservationEndpoint } from '@trek/shared';

import { describe, expect, it } from 'vitest';

const MENDLOVO = { lat: 49.19114, lng: 16.59382 };
const HLAVNI = { lat: 49.19052, lng: 16.61283 };
const PRAHA = { lat: 50.08305, lng: 14.43476 };

const stop = (name: string, at?: { lat: number; lng: number }) => ({ name, time: '08:00', track: null, ...at });

const leg = (mode: string, from: object, to: object, extra: object = {}) => ({
  mode,
  line: null,
  headsign: null,
  agency: null,
  duration: 60,
  stops: 0,
  from,
  to,
  geometry: null,
  geometry_precision: 5,
  ...extra,
});

const journey = (...legs: object[]) => JSON.stringify({ transit: { legs } });

/** A leg's drawn line through these points, encoded as the transit backends store it. */
const lineThrough = (precision: number, ...points: Array<{ lat: number; lng: number }>) =>
  encodePolyline(
    points.map((point): [number, number] => [point.lat, point.lng]),
    precision,
  );

const endpoint = (role: 'from' | 'stop' | 'to', at: { lat: number; lng: number }): PublicApiReservationEndpoint => ({
  role,
  name: role,
  code: null,
  local_date: null,
  local_time: null,
  ...at,
});

const ends = (metadata: string, endpoints: PublicApiReservationEndpoint[] = []) =>
  transitLegsOf(metadata, endpoints).map((l) => [
    l.from.lat === null ? null : { lat: l.from.lat, lng: l.from.lng },
    l.to.lat === null ? null : { lat: l.to.lat, lng: l.to.lng },
  ]);

describe('transitLegsOf — leg end coordinates', () => {
  it('PUBAPI-LEG-001: a journey saved with its stops placed reports those places', () => {
    const metadata = journey(leg('TRAM', stop('Mendlovo', MENDLOVO), stop('Hlavní', HLAVNI)));
    expect(ends(metadata)).toEqual([[MENDLOVO, HLAVNI]]);
    const [tram] = transitLegsOf(metadata);
    expect(tram.from).toEqual({ name: 'Mendlovo', time: '08:00', track: null, ...MENDLOVO });
  });

  it('PUBAPI-LEG-002: an older journey is placed from the first and last point of its line, at its precision', () => {
    const line6 = lineThrough(6, MENDLOVO, { lat: 49.2, lng: 16.6 }, HLAVNI);
    const line5 = lineThrough(5, HLAVNI, PRAHA);
    const metadata = journey(
      leg('TRAM', stop('Mendlovo'), stop('Hlavní'), { geometry: line6, geometry_precision: 6 }),
      leg('RAIL', stop('Hlavní'), stop('Praha'), { geometry: line5, geometry_precision: undefined }),
    );
    expect(ends(metadata)).toEqual([
      [MENDLOVO, HLAVNI],
      [HLAVNI, PRAHA],
    ]);
  });

  it('PUBAPI-LEG-003: a walk without a line starts where the ride before ends and ends where the next starts', () => {
    const metadata = journey(
      leg('TRAM', stop('Mendlovo', MENDLOVO), stop('Hlavní', HLAVNI)),
      leg('WALK', stop('Hlavní'), stop('Brno hl.n.')),
      leg('RAIL', stop('Brno hl.n.', { lat: 49.1906, lng: 16.6128 }), stop('Praha', PRAHA)),
    );
    expect(ends(metadata)[1]).toEqual([HLAVNI, { lat: 49.1906, lng: 16.6128 }]);
  });

  it('PUBAPI-LEG-004: the first and last leg fall back to the booking’s start and destination', () => {
    const metadata = journey(
      leg('WALK', stop('Home'), stop('Mendlovo', MENDLOVO)),
      leg('WALK', stop('Praha', PRAHA), stop('Hotel')),
    );
    const start = { lat: 49.18, lng: 16.58 };
    const hotel = { lat: 50.09, lng: 14.42 };
    expect(ends(metadata, [endpoint('from', start), endpoint('stop', HLAVNI), endpoint('to', hotel)])).toEqual([
      [start, MENDLOVO],
      [PRAHA, hotel],
    ]);
  });

  it('PUBAPI-LEG-005: an end nothing places is null, never a guess', () => {
    const metadata = journey(leg('WALK', stop('Somewhere'), stop('Elsewhere')));
    expect(transitLegsOf(metadata)[0]).toMatchObject({
      from: { name: 'Somewhere', lat: null, lng: null },
      to: { name: 'Elsewhere', lat: null, lng: null },
    });
  });

  it('PUBAPI-LEG-006: an out-of-range or mistyped stored place is not used; the line places the stop instead', () => {
    const line = lineThrough(5, MENDLOVO, HLAVNI);
    const metadata = journey(
      leg('TRAM', { name: 'A', lat: 91, lng: 16 }, { name: 'B', lat: '49.1', lng: 16.6 }, { geometry: line }),
    );
    expect(ends(metadata)).toEqual([[MENDLOVO, HLAVNI]]);
  });

  it('PUBAPI-LEG-007: a precision that is no whole number from 1 to 10 reads as 5', () => {
    const line = lineThrough(5, MENDLOVO, HLAVNI);
    for (const precision of [0, 2.5, 99, 'six']) {
      const metadata = journey(leg('TRAM', stop('A'), stop('B'), { geometry: line, geometry_precision: precision }));
      expect(ends(metadata)).toEqual([[MENDLOVO, HLAVNI]]);
    }
  });

  it('PUBAPI-LEG-008: a line that decodes off the globe places nothing', () => {
    // Encoded at precision 5 but stored as 4: the point reads as 450° N, 900° E.
    const metadata = journey(
      leg('TRAM', stop('A'), stop('B'), { geometry: lineThrough(5, { lat: 45, lng: 90 }), geometry_precision: 4 }),
    );
    expect(ends(metadata)).toEqual([[null, null]]);
  });

  it('PUBAPI-LEG-009: the drawn line and its precision never reach the payload', () => {
    const line = lineThrough(5, MENDLOVO, HLAVNI);
    const legs = transitLegsOf(journey(leg('TRAM', stop('A'), stop('B'), { geometry: line, line_color: '#f00' })));
    expect(JSON.stringify(legs)).not.toMatch(/geometry|precision|line_color/);
    expect(Object.keys(legs[0].from)).toEqual(['name', 'time', 'track', 'lat', 'lng']);
  });
});
