/**
 * A tour's line as a FIT course file, the one form a Garmin watch takes a
 * downloaded course in: a Connect IQ app can store a course only by downloading
 * it as FIT, and the watch refuses GPX. Written by hand rather than through
 * Garmin's FIT SDK, which comes under a licence of its own, because a course
 * needs seven message types and nothing else of the protocol.
 *
 * The layout: a 14-byte header (its own CRC included), the messages
 * (`file_id`, `course`, `lap`, a timer start `event`, one `record` per point,
 * one `course_point` per named stop, a timer stop `event`), then the CRC of
 * everything before it. Every message is little-endian and preceded once by
 * its definition. What goes into the records (which points, their distances
 * and times) is decided by the caller, `tour-fit-course.helpers.ts`; this file
 * only lays the bytes out.
 */

/** Seconds between the Unix epoch and the FIT epoch, 1989-12-31T00:00:00Z. */
const FIT_EPOCH_OFFSET_S = 631_065_600;

/** The FIT protocol (2.0) and profile (21.32) versions the header names. */
const PROTOCOL_VERSION = 0x20;
const PROFILE_VERSION = 2132;
const HEADER_SIZE = 14;

/** `uint16` invalid: an altitude the point does not have. */
const ALTITUDE_INVALID = 0xffff;

/** The values of the FIT profile's enums this file writes. */
const FILE_TYPE_COURSE = 6;
const MANUFACTURER_DEVELOPMENT = 255;
const EVENT_TIMER = 0;
const EVENT_TYPE_START = 0;
/** `stop_disable_all`, as Garmin's own course files end their timer. */
const EVENT_TYPE_STOP_DISABLE_ALL = 9;
/** `course_point` type `generic`: a named stop, no turn. */
const COURSE_POINT_GENERIC = 0;

/** One point of the course's line, at `distanceM` along it and `elapsedS` after the start. */
export interface FitCourseRecord {
  lat: number;
  lng: number;
  /** Metres above sea level, null where the line has no height. */
  ele: number | null;
  distanceM: number;
  elapsedS: number;
}

/** A named point on the course (a stop of the tour), placed where the line passes it. */
export interface FitCoursePoint {
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
  elapsedS: number;
}

export interface FitCourse {
  name: string;
  /** The FIT profile's `sport` enum, e.g. 17 for hiking. */
  sport: number;
  createdAt: Date;
  /**
   * The file's serial number. A watch knows a file by its `file_id`, so two
   * courses written in the same second would be one file to it without a
   * serial of their own, the later replacing the earlier. 0 is none in FIT.
   */
  serial: number;
  /** At least two, in order along the line. */
  records: readonly FitCourseRecord[];
  /** In order along the line. */
  coursePoints: readonly FitCoursePoint[];
}

type FieldType = 'enum' | 'uint16' | 'sint32' | 'uint32' | 'uint32z' | 'string16' | 'string32';

/** Each field type's size in bytes and its FIT base type. */
const FIELD_TYPES: Record<FieldType, { size: number; base: number }> = {
  enum: { size: 1, base: 0x00 },
  uint16: { size: 2, base: 0x84 },
  sint32: { size: 4, base: 0x85 },
  uint32: { size: 4, base: 0x86 },
  uint32z: { size: 4, base: 0x8c },
  string16: { size: 16, base: 0x07 },
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
    [3, 'uint32z'], // serial_number
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
const COURSE_POINT: MessageDef = {
  local: 5,
  global: 32,
  fields: [
    [1, 'uint32'], // timestamp (course_point numbers its own, not 253)
    [2, 'sint32'], // position_lat
    [3, 'sint32'], // position_long
    [4, 'uint32'], // distance, cm
    [5, 'enum'], // type
    [6, 'string16'], // name; a watch shows about a dozen characters of it
  ],
};

/** The FIT SDK's CRC-16 nibble table. */
const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01,
  0x8801, 0x4400,
];

/** The FIT CRC-16 of the bytes. Over a whole file, its trailing CRC included, it comes out 0. */
export function fitCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    for (const nibble of [byte & 0x0f, byte >> 4]) {
      const low = CRC_TABLE[crc & 0x0f];
      crc = ((crc >> 4) & 0x0fff) ^ low ^ CRC_TABLE[nibble];
    }
  }
  return crc;
}

/** Degrees as FIT semicircles, `deg * 2^31 / 180`, held inside sint32. */
export function semicircles(deg: number): number {
  return Math.max(-0x80000000, Math.min(0x7fffffff, Math.round((deg * 2 ** 31) / 180)));
}

/** Metres as FIT stores an altitude, or invalid when the point has none or it does not fit. */
function altitude(ele: number | null): number {
  if (ele === null) return ALTITUDE_INVALID;
  const raw = Math.round((ele + 500) * 5);
  return raw >= 0 && raw < ALTITUDE_INVALID ? raw : ALTITUDE_INVALID;
}

/** Seconds or metres scaled to the whole units a field holds, never below 0 nor past uint32. */
function scaled(value: number, scale: number): number {
  return Math.min(0xfffffffe, Math.max(0, Math.round(value * scale)));
}

/** The text in at most `size - 1` bytes of UTF-8, cut between characters, zero-padded to `size`. */
function stringField(text: string, size: number): Buffer {
  const field = Buffer.alloc(size);
  let used = 0;
  for (const char of text) {
    const bytes = Buffer.byteLength(char);
    if (used + bytes > size - 1) break;
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

function message(def: MessageDef, values: ReadonlyArray<number | Buffer>): Buffer {
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

/** The 14-byte file header for a body of `bodySize` bytes, its own CRC last. */
function header(bodySize: number): Buffer {
  const out = Buffer.alloc(HEADER_SIZE);
  out.writeUInt8(HEADER_SIZE, 0);
  out.writeUInt8(PROTOCOL_VERSION, 1);
  out.writeUInt16LE(PROFILE_VERSION, 2);
  out.writeUInt32LE(bodySize, 4);
  out.write('.FIT', 8, 'ascii');
  out.writeUInt16LE(fitCrc(out.subarray(0, 12)), 12);
  return out;
}

/** The course as a FIT file. Throws on fewer than two records: a course needs a line. */
export function encodeFitCourse(course: FitCourse): Buffer {
  const { records, coursePoints } = course;
  if (records.length < 2) throw new RangeError('A FIT course needs at least two points');
  const t0 = Math.floor(course.createdAt.getTime() / 1000) - FIT_EPOCH_OFFSET_S;
  const at = (elapsedS: number) => t0 + Math.round(Math.max(0, elapsedS));
  const first = records[0];
  const last = records[records.length - 1];
  const serial = course.serial >>> 0 || 1;

  const body = Buffer.concat([
    definition(FILE_ID),
    message(FILE_ID, [FILE_TYPE_COURSE, MANUFACTURER_DEVELOPMENT, 1, serial, t0]),
    definition(COURSE),
    message(COURSE, [stringField(course.name, FIELD_TYPES.string32.size), course.sport]),
    definition(LAP),
    message(LAP, [
      t0,
      t0,
      semicircles(first.lat),
      semicircles(first.lng),
      semicircles(last.lat),
      semicircles(last.lng),
      scaled(last.elapsedS, 1000),
      scaled(last.elapsedS, 1000),
      scaled(last.distanceM, 100),
    ]),
    definition(EVENT),
    message(EVENT, [t0, EVENT_TIMER, EVENT_TYPE_START]),
    definition(RECORD),
    ...records.map((point) =>
      message(RECORD, [
        at(point.elapsedS),
        semicircles(point.lat),
        semicircles(point.lng),
        altitude(point.ele),
        scaled(point.distanceM, 100),
      ]),
    ),
    ...(coursePoints.length ? [definition(COURSE_POINT)] : []),
    ...coursePoints.map((point) =>
      message(COURSE_POINT, [
        at(point.elapsedS),
        semicircles(point.lat),
        semicircles(point.lng),
        scaled(point.distanceM, 100),
        COURSE_POINT_GENERIC,
        stringField(point.name, FIELD_TYPES.string16.size),
      ]),
    ),
    message(EVENT, [at(last.elapsedS), EVENT_TIMER, EVENT_TYPE_STOP_DISABLE_ALL]),
  ]);

  const file = Buffer.concat([header(body.length), body, Buffer.alloc(2)]);
  file.writeUInt16LE(fitCrc(file.subarray(0, file.length - 2)), file.length - 2);
  return file;
}
