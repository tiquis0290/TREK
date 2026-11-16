import {
  encodeFitCourse,
  fitCrc,
  semicircles,
  type FitCourse,
  type FitCourseRecord,
} from '../../../src/nest/tours/tour-fit.codec';
import { decodeFit, fromSemicircles, messagesOf, num, referenceFitCrc } from '../../helpers/fit-decoder';

import { describe, expect, it } from 'vitest';

// TOUR-FIT-CODEC-001 to TOUR-FIT-CODEC-011

const CREATED_AT = new Date('2026-08-01T06:00:00Z');
/** CREATED_AT in FIT seconds, which count from 1989-12-31T00:00:00Z. */
const T0 = Date.UTC(2026, 7, 1, 6) / 1000 - Date.UTC(1989, 11, 31) / 1000;

const RIDGE: FitCourseRecord[] = [
  { lat: 47.42, lng: 10.98, ele: 1210, distanceM: 0, elapsedS: 0 },
  { lat: 47.43, lng: 10.99, ele: 1380.4, distanceM: 1330.25, elapsedS: 1209.3 },
  { lat: 47.44, lng: 11.01, ele: null, distanceM: 3204.5, elapsedS: 2913.2 },
];

function course(overrides: Partial<FitCourse> = {}): FitCourse {
  return {
    name: 'Gratweg',
    sport: 17,
    createdAt: CREATED_AT,
    serial: 42,
    records: RIDGE,
    coursePoints: [{ name: 'Hütte', lat: 47.43, lng: 10.99, distanceM: 1330.25, elapsedS: 1209.3 }],
    ...overrides,
  };
}

describe('encodeFitCourse', () => {
  it('TOUR-FIT-CODEC-001: a 14-byte header with the .FIT signature, its own CRC and the data size', () => {
    const file = encodeFitCourse(course());
    const fit = decodeFit(file);
    expect(fit.headerSize).toBe(14);
    expect(fit.protocolVersion).toBe(0x20);
    expect(fit.profileVersion).toBe(2132);
    expect(fit.signature).toBe('.FIT');
    expect(fit.dataSize).toBe(file.length - 14 - 2);
    expect(file.readUInt16LE(12)).toBe(referenceFitCrc(file.subarray(0, 12)));
  });

  it('TOUR-FIT-CODEC-002: the trailing CRC is the CRC of everything before it, so the whole file comes out 0', () => {
    const file = encodeFitCourse(course());
    expect(file.readUInt16LE(file.length - 2)).toBe(referenceFitCrc(file.subarray(0, file.length - 2)));
    expect(referenceFitCrc(file)).toBe(0);
    const corrupted = Buffer.from(file);
    corrupted[40] ^= 0x01;
    expect(referenceFitCrc(corrupted)).not.toBe(0);
  });

  it('TOUR-FIT-CODEC-003: the writer’s CRC agrees with the reference on any bytes', () => {
    const bytes = Buffer.from(Array.from({ length: 257 }, (_, i) => (i * 37 + 11) & 0xff));
    expect(fitCrc(bytes)).toBe(referenceFitCrc(bytes));
    expect(fitCrc(Buffer.alloc(0))).toBe(0);
  });

  it('TOUR-FIT-CODEC-004: file_id, course, lap, timer start, the records, the course points, timer stop', () => {
    const fit = decodeFit(encodeFitCourse(course()));
    expect(fit.messages.map((m) => m.global)).toEqual([0, 31, 19, 21, 20, 20, 20, 32, 21]);
    const [fileId, named, lap, start] = fit.messages;
    expect(num(fileId, 0)).toBe(6); // a course
    expect(num(fileId, 1)).toBe(255); // development
    expect(num(fileId, 3)).toBe(42);
    expect(num(fileId, 4)).toBe(T0);
    expect(named.fields.get(5)).toBe('Gratweg');
    expect(num(named, 4)).toBe(17);
    expect(num(lap, 2)).toBe(T0);
    expect(fromSemicircles(num(lap, 3))).toBeCloseTo(47.42, 6);
    expect(fromSemicircles(num(lap, 6))).toBeCloseTo(11.01, 6);
    expect(num(lap, 7)).toBe(2913200); // ms
    expect(num(lap, 8)).toBe(2913200);
    expect(num(lap, 9)).toBe(320450); // cm
    expect([num(start, 0), num(start, 1), num(start, 253)]).toEqual([0, 0, T0]);
    const stop = fit.messages[fit.messages.length - 1];
    expect([num(stop, 0), num(stop, 1), num(stop, 253)]).toEqual([0, 9, T0 + 2913]);
  });

  it('TOUR-FIT-CODEC-005: the records decode back to the line: position, height, distance and time', () => {
    const records = messagesOf(decodeFit(encodeFitCourse(course())), 20);
    expect(records).toHaveLength(RIDGE.length);
    records.forEach((record, i) => {
      const point = RIDGE[i];
      // One semicircle is about 8 mm; the round trip is exact to it.
      expect(Math.abs(fromSemicircles(num(record, 0)) - point.lat)).toBeLessThan(1e-7);
      expect(Math.abs(fromSemicircles(num(record, 1)) - point.lng)).toBeLessThan(1e-7);
      expect(num(record, 5)).toBe(Math.round(point.distanceM * 100));
      expect(num(record, 253)).toBe(T0 + Math.round(point.elapsedS));
    });
    // altitude is (m + 500) * 5; a point without a height leaves it invalid, never sea level.
    expect(records.map((r) => num(r, 2))).toEqual([8550, 9402, 0xffff]);
  });

  it('TOUR-FIT-CODEC-006: a height FIT cannot hold is left invalid', () => {
    const records = [
      { ...RIDGE[0], ele: -600 },
      { ...RIDGE[1], ele: 13000 },
    ];
    const decoded = messagesOf(decodeFit(encodeFitCourse(course({ records }))), 20);
    expect(decoded.map((r) => num(r, 2))).toEqual([0xffff, 0xffff]);
  });

  it('TOUR-FIT-CODEC-007: a course point carries its name, place, distance and time', () => {
    const [point] = messagesOf(decodeFit(encodeFitCourse(course())), 32);
    expect(point.fields.get(6)).toBe('Hütte');
    expect(num(point, 1)).toBe(T0 + 1209);
    expect(num(point, 2)).toBe(semicircles(47.43));
    expect(num(point, 3)).toBe(semicircles(10.99));
    expect(num(point, 4)).toBe(133025);
    expect(num(point, 5)).toBe(0); // generic
  });

  it('TOUR-FIT-CODEC-008: no course point definition when the tour has no named stops', () => {
    const fit = decodeFit(encodeFitCourse(course({ coursePoints: [] })));
    expect(fit.messages.map((m) => m.global)).toEqual([0, 31, 19, 21, 20, 20, 20, 21]);
  });

  it('TOUR-FIT-CODEC-009: names are cut between characters to their field, zero-terminated', () => {
    const long = 'Ž'.repeat(40);
    const fit = decodeFit(
      encodeFitCourse(
        course({ name: long, coursePoints: [{ name: long, lat: 47.43, lng: 10.99, distanceM: 1, elapsedS: 1 }] }),
      ),
    );
    // Ž is two bytes: 15 fit in a 32-byte name, 7 in a 16-byte course point name.
    expect(messagesOf(fit, 31)[0].fields.get(5)).toBe('Ž'.repeat(15));
    expect(messagesOf(fit, 32)[0].fields.get(6)).toBe('Ž'.repeat(7));
  });

  it('TOUR-FIT-CODEC-010: serial 0 is none in FIT and becomes 1; a serial past uint32 wraps', () => {
    expect(num(decodeFit(encodeFitCourse(course({ serial: 0 }))).messages[0], 3)).toBe(1);
    expect(num(decodeFit(encodeFitCourse(course({ serial: 2 ** 32 + 5 }))).messages[0], 3)).toBe(5);
  });

  it('TOUR-FIT-CODEC-011: semicircles clamp to sint32, and a course needs two points', () => {
    expect(semicircles(180)).toBe(0x7fffffff);
    expect(semicircles(-180)).toBe(-0x80000000);
    expect(() => encodeFitCourse(course({ records: RIDGE.slice(0, 1) }))).toThrow(RangeError);
  });
});
