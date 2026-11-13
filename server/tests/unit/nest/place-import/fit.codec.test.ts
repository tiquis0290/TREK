/**
 * The FIT course writer: a tour's line as the course file a Garmin watch takes.
 *
 * The golden file is what the reference encoder the watch app was tested with
 * (tour_fit in the trek-garmin mock server, run on the fēnix 7X Pro simulator up
 * to its "Launch Course?" screen) writes for the same line at the same moment,
 * so a byte that moves here is a byte the watch has not seen. The other cases
 * read the file back message by message.
 */
import { encodeFitCourse, fitCrc, type FitPoint } from '../../../../src/nest/place-import/fit.codec';
import { buildTourFit } from '../../../../src/nest/place-import/providers/gpx.provider';

import { describe, expect, it } from 'vitest';

const CREATED_AT = new Date('2026-08-01T06:00:00Z');

const RIDGE: FitPoint[] = [
  { lat: 47.42, lng: 10.98, ele: 1210 },
  { lat: 47.43, lng: 10.99, ele: 1380 },
  { lat: 47.44, lng: 11.01, ele: 1525 },
];

/** tour_fit('Gratweg', RIDGE, 17) of the reference encoder, its clock at CREATED_AT. */
const GOLDEN =
  '0e205408fb0000002e464954f7264000000000040001000102840202840404860006ff000100603fd0444100001f000205200704010001' +
  '477261747765670000000000000000000000000000000000000000000000000011420000130009fd048602048603048504048505048506' +
  '048507048608048609048602603fd044603fd0442d8cb82117d9ce073e30bc21304fd40728922c0028922c0026e70400430000150003fd' +
  '048600010001010003603fd0440000440000140005fd048600048501048502028405048604603fd0442d8cb82117d9ce07662100000000' +
  '042444d044355eba211fabd007b8246c0c020004c94ad0443e30bc21304fd4078d2726e7040003c94ad04400098dfb';

/** A file the writer must have produced; a null fails the case here rather than further down. */
function written(file: Buffer | null): Buffer {
  if (!file) throw new Error('expected a FIT file');
  return file;
}

/** The course the writer makes of these points, at CREATED_AT. */
const course = (name: string, sport: number, points: FitPoint[]) =>
  written(encodeFitCourse(name, sport, points, CREATED_AT));

/** The data messages of a FIT file, by global message number, each as its fields' raw values. */
function readMessages(file: Buffer): Array<{ global: number; fields: Map<number, number | Buffer> }> {
  const defs = new Map<number, { global: number; fields: Array<[number, number]> }>();
  const out: Array<{ global: number; fields: Map<number, number | Buffer> }> = [];
  let at = file.readUInt8(0);
  const end = at + file.readUInt32LE(4);
  while (at < end) {
    const header = file.readUInt8(at++);
    const local = header & 0x0f;
    if (header & 0x40) {
      const global = file.readUInt16LE(at + 2);
      const count = file.readUInt8(at + 4);
      const fields: Array<[number, number]> = [];
      for (let i = 0; i < count; i++) fields.push([file.readUInt8(at + 5 + i * 3), file.readUInt8(at + 6 + i * 3)]);
      defs.set(local, { global, fields });
      at += 5 + count * 3;
      continue;
    }
    const def = defs.get(local);
    if (!def) throw new Error(`data message for undefined local message ${local}`);
    const fields = new Map<number, number | Buffer>();
    for (const [num, size] of def.fields) {
      if (size === 1) fields.set(num, file.readUInt8(at));
      else if (size === 2) fields.set(num, file.readUInt16LE(at));
      else if (size === 4) fields.set(num, num === 253 || num > 6 ? file.readUInt32LE(at) : file.readInt32LE(at));
      else fields.set(num, file.subarray(at, at + size));
      at += size;
    }
    out.push({ global: def.global, fields });
  }
  return out;
}

describe('encodeFitCourse', () => {
  it('FIT-001: writes the reference encoder’s course byte for byte', () => {
    expect(course('Gratweg', 17, RIDGE).toString('hex')).toBe(GOLDEN);
  });

  it('FIT-002: a 14-byte header with the .FIT signature, its own CRC and the data size', () => {
    const file = course('Gratweg', 17, RIDGE);
    expect(file.readUInt8(0)).toBe(14);
    expect(file.readUInt8(1)).toBe(0x20);
    expect(file.readUInt16LE(2)).toBe(2132);
    expect(file.toString('ascii', 8, 12)).toBe('.FIT');
    expect(file.readUInt16LE(12)).toBe(fitCrc(file.subarray(0, 12)));
    expect(file.readUInt32LE(4)).toBe(file.length - 14 - 2);
  });

  it('FIT-003: the CRC over the whole file, its trailing CRC included, is 0', () => {
    const file = course('Gratweg', 17, RIDGE);
    expect(fitCrc(file)).toBe(0);
    file[20] ^= 0xff;
    expect(fitCrc(file)).not.toBe(0);
  });

  it('FIT-004: file_id, course, lap, timer start, one record per point, timer stop, in that order', () => {
    const messages = readMessages(course('Gratweg', 17, RIDGE));
    expect(messages.map((m) => m.global)).toEqual([0, 31, 19, 21, 20, 20, 20, 21]);
    expect(messages[0].fields.get(0)).toBe(6); // a course
    expect(messages[1].fields.get(4)).toBe(17); // hiking
    expect(messages[3].fields.get(1)).toBe(0); // start
    expect(messages[7].fields.get(1)).toBe(9); // stop_disable_all
  });

  it('FIT-005: records carry semicircles, heights as (m + 500) * 5, and growing distances', () => {
    const records = readMessages(course('Gratweg', 17, RIDGE)).filter((m) => m.global === 20);
    expect(records[0].fields.get(0)).toBe(Math.round((47.42 * 2 ** 31) / 180));
    expect(records[0].fields.get(1)).toBe(Math.round((10.98 * 2 ** 31) / 180));
    expect(records.map((r) => r.fields.get(2))).toEqual([8550, 9400, 10125]);
    const distances = records.map((r) => r.fields.get(5) as number);
    expect(distances[0]).toBe(0);
    expect(distances[1]).toBeGreaterThan(0);
    expect(distances[2]).toBeGreaterThan(distances[1]);
  });

  it('FIT-006: a point without a height leaves the altitude invalid rather than at sea level', () => {
    const flat = RIDGE.map((point) => ({ ...point, ele: null }));
    const records = readMessages(course('Flat', 0, flat)).filter((m) => m.global === 20);
    expect(records.map((r) => r.fields.get(2))).toEqual([0xffff, 0xffff, 0xffff]);
  });

  it('FIT-007: a long name is cut to 31 bytes between characters, zero-padded to 32', () => {
    const name = 'Ž'.repeat(40);
    const named = readMessages(course(name, 17, RIDGE)).find((m) => m.global === 31);
    const field = named?.fields.get(5) as Buffer;
    expect(field.length).toBe(32);
    expect(field.subarray(0, 30).toString('utf8')).toBe('Ž'.repeat(15));
    expect([...field.subarray(30)]).toEqual([0, 0]);
  });

  it('FIT-008: no course under two points', () => {
    expect(encodeFitCourse('One', 17, RIDGE.slice(0, 1), CREATED_AT)).toBeNull();
    expect(encodeFitCourse('None', 17, [], CREATED_AT)).toBeNull();
  });
});

describe('buildTourFit', () => {
  it('FIT-009: reads the stored line, with or without heights, like the GPX', () => {
    const route = JSON.stringify([
      [47.42, 10.98, 1210],
      [47.43, 10.99, 1380],
      [47.44, 11.01, 1525],
    ]);
    expect(
      written(buildTourFit({ name: 'Gratweg', sport: 17, route_geometry: route }, CREATED_AT)).toString('hex'),
    ).toBe(GOLDEN);
    const flat = buildTourFit({ name: 'Flat', sport: 0, route_geometry: '[[47.42,10.98],[47.43,10.99]]' }, CREATED_AT);
    expect(readMessages(written(flat)).filter((m) => m.global === 20)).toHaveLength(2);
  });

  it('FIT-010: no course without a line', () => {
    expect(buildTourFit({ name: 'x', sport: 0, route_geometry: null })).toBeNull();
    expect(buildTourFit({ name: 'x', sport: 0, route_geometry: '[[47.42,10.98]]' })).toBeNull();
    expect(buildTourFit({ name: 'x', sport: 0, route_geometry: 'not json' })).toBeNull();
  });
});
