/**
 * The public API's booking points and transit legs: what stored rows and
 * `metadata.transit.legs` become on the wire. Pure functions, so every rule —
 * the field-by-field mapping, the tolerance for broken or older stored data, and
 * the order in which a leg's ends are placed — is pinned here without a database.
 */
import type { PublicApiEndpointRow } from '../../../src/db/repositories/Reservations.repository';
import { toPublicEndpoints, transitLegsOf } from '../../../src/nest/public-api/public-api.helpers';
import { encodePolyline } from '../../../src/utils/polyline';
import { publicApiTransitLegSchema } from '@trek/shared';

import { describe, expect, it } from 'vitest';

const BRNO: PublicApiEndpointRow = {
  reservation_id: 5,
  role: 'from',
  name: 'Brno hl.n.',
  code: null,
  lat: 49.1906,
  lng: 16.6128,
  local_date: '2026-06-14',
  local_time: '08:28',
};
const PARDUBICE: PublicApiEndpointRow = {
  ...BRNO,
  role: 'stop',
  name: 'Pardubice hl.n.',
  code: 'PCE',
  lat: 50.0322,
  lng: 15.7569,
  local_time: '09:58',
};
const PRAHA: PublicApiEndpointRow = {
  ...BRNO,
  role: 'to',
  name: 'Praha hl.n.',
  lat: 50.0831,
  lng: 14.4348,
  local_date: null,
  local_time: null,
};

/** A leg as `buildTransitReservationParts` stores it, colours and drawn line included. */
function storedLeg(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'LONG_DISTANCE',
    line: 'EC 278',
    line_color: '#ff0000',
    line_text_color: '#ffffff',
    headsign: 'Praha hl.n.',
    agency: 'České dráhy',
    duration: 8880,
    stops: 2,
    from: { name: 'Brno hl.n.', time: '08:28', track: '3', lat: 49.1906, lng: 16.6128 },
    to: { name: 'Praha hl.n.', time: '10:56', track: '5', lat: 50.0831, lng: 14.4348 },
    geometry: null,
    geometry_precision: 6,
    ...overrides,
  };
}

const journey = (...legs: unknown[]) => JSON.stringify({ transit: { provider: 'motis', legs } });

describe('toPublicEndpoints', () => {
  it('PUBAPI-HLP-001: maps each point by name, dropping the booking id and the role', () => {
    expect(toPublicEndpoints([BRNO, PARDUBICE, PRAHA])).toEqual([
      { name: 'Brno hl.n.', code: null, lat: 49.1906, lng: 16.6128, local_date: '2026-06-14', local_time: '08:28' },
      {
        name: 'Pardubice hl.n.',
        code: 'PCE',
        lat: 50.0322,
        lng: 15.7569,
        local_date: '2026-06-14',
        local_time: '09:58',
      },
      { name: 'Praha hl.n.', code: null, lat: 50.0831, lng: 14.4348, local_date: null, local_time: null },
    ]);
  });

  it('PUBAPI-HLP-002: leaves out a point whose lat/lng is not a place on the globe', () => {
    const broken = [
      { ...BRNO, lat: 'north' },
      { ...BRNO, lng: Number.NaN },
      { ...BRNO, lat: 91 },
      PRAHA,
    ] as unknown as PublicApiEndpointRow[];
    expect(toPublicEndpoints(broken).map((point) => point.name)).toEqual(['Praha hl.n.']);
  });
});

describe('transitLegsOf', () => {
  it('PUBAPI-HLP-003: maps a stored leg field by field, leaving the line, its colours and its geometry out', () => {
    const legs = transitLegsOf(journey(storedLeg({ geometry: '_p~iF~ps|U' })), [BRNO, PRAHA], 'reservation 5');
    expect(legs).toEqual([
      {
        mode: 'LONG_DISTANCE',
        line: 'EC 278',
        headsign: 'Praha hl.n.',
        agency: 'České dráhy',
        duration_s: 8880,
        stops: 2,
        from: { name: 'Brno hl.n.', time: '08:28', track: '3', lat: 49.1906, lng: 16.6128 },
        to: { name: 'Praha hl.n.', time: '10:56', track: '5', lat: 50.0831, lng: 14.4348 },
      },
    ]);
    expect(publicApiTransitLegSchema.parse(legs[0])).toEqual(legs[0]);
    expect(JSON.stringify(legs)).not.toMatch(/color|geometry|precision/);
  });

  it('PUBAPI-HLP-004: a booking without a journey, or with metadata that does not decode, has no legs', () => {
    expect(transitLegsOf(null, [], 'r')).toEqual([]);
    expect(transitLegsOf('', [], 'r')).toEqual([]);
    expect(transitLegsOf('not json', [], 'r')).toEqual([]);
    expect(transitLegsOf('[1, 2]', [], 'r')).toEqual([]);
    expect(transitLegsOf(JSON.stringify({ legs: [storedLeg()] }), [], 'r')).toEqual([]);
    expect(transitLegsOf(JSON.stringify({ transit: { legs: 'many' } }), [], 'r')).toEqual([]);
    expect(transitLegsOf(JSON.stringify({ transit: null }), [], 'r')).toEqual([]);
  });

  it('PUBAPI-HLP-005: reads metadata stored as a JSON string of the JSON, as older rows hold it', () => {
    const doubled = JSON.stringify(journey(storedLeg()));
    expect(transitLegsOf(doubled, [], 'r').map((leg) => leg.line)).toEqual(['EC 278']);
  });

  it('PUBAPI-HLP-006: drops a leg without a mode, and reads every other missing or mistyped field as null', () => {
    const legs = transitLegsOf(
      journey({ line: 'no mode' }, 'not a leg', {
        mode: 'BUS',
        line: 40,
        headsign: ['x'],
        duration: -5,
        stops: 1.5,
        from: 'Mendlovo',
        to: { name: 9, time: '10:00', track: false, lat: 'n', lng: 200 },
      }),
      [],
      'r',
    );
    expect(legs).toEqual([
      {
        mode: 'BUS',
        line: null,
        headsign: null,
        agency: null,
        duration_s: null,
        stops: null,
        from: { name: null, time: null, track: null, lat: null, lng: null },
        to: { name: null, time: '10:00', track: null, lat: null, lng: null },
      },
    ]);
  });

  describe('placing the ends of a journey saved before the ends had places', () => {
    const withoutPlaces = (overrides: Record<string, unknown> = {}) => {
      const leg = storedLeg(overrides);
      return {
        ...leg,
        from: { name: leg.from.name, time: leg.from.time, track: leg.from.track },
        to: { name: leg.to.name, time: leg.to.time, track: leg.to.track },
      };
    };

    it('PUBAPI-HLP-007: takes the ends of the leg’s drawn line, at its stored precision or MOTIS’s 6', () => {
      const line: [number, number][] = [
        [49.19, 16.61],
        [49.7, 15.9],
        [50.08, 14.43],
      ];
      const legs = transitLegsOf(
        journey(
          withoutPlaces({ geometry: encodePolyline(line, 5), geometry_precision: 5 }),
          withoutPlaces({ geometry: encodePolyline(line, 6), geometry_precision: null }),
        ),
        [],
        'r',
      );
      for (const leg of legs) {
        // Name, time and track come from the stored end; only the place is derived.
        expect(leg.from).toEqual({ name: 'Brno hl.n.', time: '08:28', track: '3', lat: 49.19, lng: 16.61 });
        expect(leg.to).toEqual({ name: 'Praha hl.n.', time: '10:56', track: '5', lat: 50.08, lng: 14.43 });
      }
    });

    it('PUBAPI-HLP-008: a stored place wins over the line, end by end', () => {
      const leg = storedLeg({
        geometry: encodePolyline(
          [
            [1, 1],
            [2, 2],
          ],
          6,
        ),
      });
      const [mapped] = transitLegsOf(journey({ ...leg, to: { name: 'X' } }), [], 'r');
      expect(mapped?.from).toMatchObject({ lat: 49.1906, lng: 16.6128 });
      expect(mapped?.to).toMatchObject({ lat: 2, lng: 2 });
    });

    it('PUBAPI-HLP-009: a walk without a line borrows its neighbours’ ends, and the journey’s ends the booking’s', () => {
      const tram = withoutPlaces({
        mode: 'TRAM',
        geometry: encodePolyline(
          [
            [49.2, 16.6],
            [49.19, 16.61],
          ],
          6,
        ),
      });
      const walk = withoutPlaces({ mode: 'WALK', geometry: null });
      const train = withoutPlaces({
        geometry: encodePolyline(
          [
            [49.1906, 16.6128],
            [50.0831, 14.4348],
          ],
          6,
        ),
      });

      const legs = transitLegsOf(journey(walk, tram, walk, train, walk), [BRNO, PRAHA], 'r');
      const [first, , between, , last] = legs.map((leg) => [leg.from.lat, leg.from.lng, leg.to.lat, leg.to.lng]);

      // The first walk starts where the booking does and ends where the tram starts.
      expect(first).toEqual([49.1906, 16.6128, 49.2, 16.6]);
      // The walk between two rides runs from where the tram ends to where the train starts.
      expect(between).toEqual([49.19, 16.61, 49.1906, 16.6128]);
      // The last walk starts where the train ends and ends at the booking's destination.
      expect(last).toEqual([50.0831, 14.4348, 50.0831, 14.4348]);
    });

    it('PUBAPI-HLP-010: an end nothing places stays null, and a line that decodes off the globe places nothing', () => {
      const offGlobe = withoutPlaces({ geometry: encodePolyline([[120, 300]], 5), geometry_precision: 5 });
      const [only] = transitLegsOf(journey(offGlobe), [PARDUBICE], 'r');
      expect(only?.from).toMatchObject({ lat: null, lng: null });
      expect(only?.to).toMatchObject({ lat: null, lng: null });
    });
  });
});
