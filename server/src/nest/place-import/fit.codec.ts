/**
 * A route as a FIT course file, the one form a Garmin watch takes a downloaded
 * course in: a Connect IQ app can store a course only by downloading it, and
 * the watch refuses a GPX download. Written by hand rather than through a FIT
 * library, because a course needs six message types and nothing else.
 *
 * The layout: a 14-byte header (its own CRC included), the messages
 * (`file_id`, `course`, `lap`, a timer start `event`, one `record` per point,
 * a timer stop `event`), then the CRC of everything before it. Every message
 * is little-endian and preceded by its definition. A course carries no real
 * times, so the points are timed as if walked at a steady pace from the moment
 * the file is written.
 */

/** Seconds between the Unix epoch and the FIT epoch, 1989-12-31T00:00:00Z. */
const FIT_EPOCH_OFFSET_S = 631_065_600;

/** The pace the synthetic times assume, in metres per second: a walk. */
const PACE_M_PER_S = 1.1;

const EARTH_RADIUS_M = 6_371_000;
const RADIANS_PER_DEGREE = Math.PI / 180;

/** The FIT protocol (2.0) and profile (21.32) versions the header names. */
const PROTOCOL_VERSION = 0x20;
const PROFILE_VERSION = 2132;

/** `uint16` invalid: an altitude the point does not have. */
const ALTITUDE_INVALID = 0xffff;

/** The values of the FIT profile's enums this file writes. */
const FILE_TYPE_COURSE = 6;
const MANUFACTURER_DEVELOPMENT = 255;
const EVENT_TIMER = 0;
const EVENT_TYPE_START = 0;
/** `stop_disable_all`, as Garmin's own course files end their timer. */
const EVENT_TYPE_STOP_DISABLE_ALL = 9;

/** A point of the line; `ele` in metres, null where the line has no height. */
export interface FitPoint {
  lat: number;
  lng: number;
  ele: number | null;
}

type FieldType = 'enum' | 'uint16' | 'sint32' | 'uint32' | 'string32';

/** Each field type's size in bytes and its FIT base type. */
const FIELD_TYPES: Record<FieldType, { size: number; base: number }> = {
  enum: { size: 1, base: 0x00 },
  uint16: { size: 2, base: 0x84 },
  sint32: { size: 4, base: 0x85 },
  uint32: { size: 4, base: 0x86 },
  string32: { size: 32, base: 0x07 },
};

/** A message as this file defines it: its local number, its global number and its fields in order. */
interface MessageDef {
  local: number;
  global: number;
  fields: ReadonlyArray<readonly [num: number, type: FieldType]>;
}

const FILE_ID: MessageDef = {
  local: 0,
  global: 0,
  fields: [
    [0, 'enum'], // type
    [1, 'uint16'], // manufacturer
    [2, 'uint16'], // product
    [4, 'uint32'], // time_created
  ],
};
const COURSE: MessageDef = {
  local: 1,
  global: 31,
  fields: [
    [5, 'string32'], // name
    [4, 'enum'], // sport
  ],
};
const LAP: MessageDef = {
  local: 2,
  global: 19,
  fields: [
    [253, 'uint32'], // timestamp
    [2, 'uint32'], // start_time
    [3, 'sint32'], // start_position_lat
    [4, 'sint32'], // start_position_long
    [5, 'sint32'], // end_position_lat
    [6, 'sint32'], // end_position_long
    [7, 'uint32'], // total_elapsed_time, ms
    [8, 'uint32'], // total_timer_time, ms
    [9, 'uint32'], // total_distance, cm
  ],
};
const EVENT: MessageDef = {
  local: 3,
  global: 21,
  fields: [
    [253, 'uint32'], // timestamp
    [0, 'enum'], // event
    [1, 'enum'], // event_type
  ],
};
const RECORD: MessageDef = {
  local: 4,
  global: 20,
  fields: [
    [253, 'uint32'], // timestamp
    [0, 'sint32'], // position_lat
    [1, 'sint32'], // position_long
    [2, 'uint16'], // altitude, (m + 500) * 5
    [5, 'uint32'], // distance, cm
  ],
};

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01,
  0x8801, 0x4400,
];

/** The FIT CRC-16 of the bytes, continued from `crc`. Over a whole file, its trailing CRC included, it comes out 0. */
export function fitCrc(bytes: Uint8Array, crc = 0): number {
  let out = crc;
  for (const byte of bytes) {
    for (const nibble of [byte & 0x0f, byte >> 4]) {
      const tmp = CRC_TABLE[out & 0x0f];
      out = (out >> 4) & 0x0fff;
      out = out ^ tmp ^ CRC_TABLE[nibble];
    }
  }
  return out;
}

/** Degrees as FIT semicircles, `deg * 2^31 / 180`, held inside sint32. */
function semicircles(deg: number): number {
  return Math.max(-0x80000000, Math.min(0x7fffffff, Math.round((deg * 2 ** 31) / 180)));
}

/** Metres as FIT stores an altitude, or invalid when the point has none or it does not fit. */
function altitude(ele: number | null): number {
  if (ele === null) return ALTITUDE_INVALID;
  const raw = Math.trunc((ele + 500) * 5);
  return raw >= 0 && raw < ALTITUDE_INVALID ? raw : ALTITUDE_INVALID;
}

function haversineM(a: FitPoint, b: FitPoint): number {
  const [lat1, lng1, lat2, lng2] = [a.lat, a.lng, b.lat, b.lng].map((deg) => deg * RADIANS_PER_DEGREE);
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** The name in at most 31 bytes of UTF-8, cut between characters, padded with zeros to the field's 32. */
function nameField(name: string): Buffer {
  const field = Buffer.alloc(FIELD_TYPES.string32.size);
  let used = 0;
  for (const char of name) {
    const size = Buffer.byteLength(char);
    if (used + size > FIELD_TYPES.string32.size - 1) break;
    used += field.write(char, used);
  }
  return field;
}

function definition(def: MessageDef): Buffer {
  const out = Buffer.alloc(6 + def.fields.length * 3);
  out.writeUInt8(0x40 | def.local, 0);
  // Byte 1 is reserved and byte 2 says little-endian; both stay 0.
  out.writeUInt16LE(def.global, 3);
  out.writeUInt8(def.fields.length, 5);
  def.fields.forEach(([num, type], i) => {
    out.writeUInt8(num, 6 + i * 3);
    out.writeUInt8(FIELD_TYPES[type].size, 7 + i * 3);
    out.writeUInt8(FIELD_TYPES[type].base, 8 + i * 3);
  });
  return out;
}

function data(def: MessageDef, values: ReadonlyArray<number | Buffer>): Buffer {
  const size = def.fields.reduce((sum, [, type]) => sum + FIELD_TYPES[type].size, 1);
  const out = Buffer.alloc(size);
  out.writeUInt8(def.local, 0);
  let at = 1;
  def.fields.forEach(([, type], i) => {
    const value = values[i];
    if (Buffer.isBuffer(value)) value.copy(out, at);
    else if (type === 'enum') out.writeUInt8(value, at);
    else if (type === 'uint16') out.writeUInt16LE(value, at);
    else if (type === 'sint32') out.writeInt32LE(value, at);
    else out.writeUInt32LE(value, at);
    at += FIELD_TYPES[type].size;
  });
  return out;
}

/**
 * The points as a FIT course named `name` for `sport` (the FIT profile's
 * sport enum), created at `createdAt`. Null under two points: a course
 * needs a line.
 */
export function encodeFitCourse(
  name: string,
  sport: number,
  points: readonly FitPoint[],
  createdAt: Date,
): Buffer | null {
  if (points.length < 2) return null;
  const t0 = Math.floor(createdAt.getTime() / 1000) - FIT_EPOCH_OFFSET_S;
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1] + haversineM(points[i - 1], points[i]));
  const total = along[along.length - 1];
  const seconds = Math.trunc(total / PACE_M_PER_S);
  const first = points[0];
  const last = points[points.length - 1];

  const body = Buffer.concat([
    definition(FILE_ID),
    data(FILE_ID, [FILE_TYPE_COURSE, MANUFACTURER_DEVELOPMENT, 1, t0]),
    definition(COURSE),
    data(COURSE, [nameField(name), sport]),
    definition(LAP),
    data(LAP, [
      t0,
      t0,
      semicircles(first.lat),
      semicircles(first.lng),
      semicircles(last.lat),
      semicircles(last.lng),
      seconds * 1000,
      seconds * 1000,
      Math.trunc(total * 100),
    ]),
    definition(EVENT),
    data(EVENT, [t0, EVENT_TIMER, EVENT_TYPE_START]),
    definition(RECORD),
    ...points.map((point, i) =>
      data(RECORD, [
        t0 + Math.trunc(along[i] / PACE_M_PER_S),
        semicircles(point.lat),
        semicircles(point.lng),
        altitude(point.ele),
        Math.trunc(along[i] * 100),
      ]),
    ),
    data(EVENT, [t0 + seconds, EVENT_TIMER, EVENT_TYPE_STOP_DISABLE_ALL]),
  ]);

  const header = Buffer.alloc(14);
  header.writeUInt8(14, 0);
  header.writeUInt8(PROTOCOL_VERSION, 1);
  header.writeUInt16LE(PROFILE_VERSION, 2);
  header.writeUInt32LE(body.length, 4);
  header.write('.FIT', 8, 'ascii');
  header.writeUInt16LE(fitCrc(header.subarray(0, 12)), 12);

  const file = Buffer.concat([header, body, Buffer.alloc(2)]);
  file.writeUInt16LE(fitCrc(file.subarray(0, file.length - 2)), file.length - 2);
  return file;
}
