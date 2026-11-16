/**
 * A minimal FIT reader for the tests of the course writer, written from the
 * protocol rather than from the writer: it reads any definition it meets
 * (either byte order, any field size and base type), so a file the writer
 * gets wrong in its own definitions reads wrong here too. Compressed-timestamp
 * headers and developer fields are refused, since a course file has neither.
 */

/** One data message: its global number and each field's value by field number. */
export interface FitMessage {
  global: number;
  fields: Map<number, number | string>;
}

export interface FitFile {
  headerSize: number;
  protocolVersion: number;
  profileVersion: number;
  dataSize: number;
  signature: string;
  messages: FitMessage[];
}

interface FieldDef {
  num: number;
  size: number;
  base: number;
}

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01,
  0x8801, 0x4400,
];

/** The FIT CRC-16, as the SDK documents it, computed independently of the writer's. */
export function referenceFitCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf];
  }
  return crc;
}

function readValue(file: Buffer, at: number, field: FieldDef, littleEndian: boolean): number | string {
  const baseNumber = field.base & 0x1f;
  if (baseNumber === 0x07) {
    const raw = file.subarray(at, at + field.size);
    const end = raw.indexOf(0);
    return raw.subarray(0, end < 0 ? raw.length : end).toString('utf8');
  }
  const le = littleEndian;
  switch (field.base) {
    case 0x00: // enum
    case 0x02: // uint8
    case 0x0a: // uint8z
      return file.readUInt8(at);
    case 0x01: // sint8
      return file.readInt8(at);
    case 0x83:
      return le ? file.readInt16LE(at) : file.readInt16BE(at);
    case 0x84:
    case 0x8b:
      return le ? file.readUInt16LE(at) : file.readUInt16BE(at);
    case 0x85:
      return le ? file.readInt32LE(at) : file.readInt32BE(at);
    case 0x86:
    case 0x8c:
      return le ? file.readUInt32LE(at) : file.readUInt32BE(at);
    default:
      throw new Error(`base type 0x${field.base.toString(16)} not read by this decoder`);
  }
}

/** The file's header and data messages. Throws on anything a valid course file would not hold. */
export function decodeFit(file: Buffer): FitFile {
  const headerSize = file.readUInt8(0);
  const dataSize = file.readUInt32LE(4);
  if (file.length !== headerSize + dataSize + 2) throw new Error('file length does not match the header');
  const defs = new Map<number, { global: number; littleEndian: boolean; fields: FieldDef[] }>();
  const messages: FitMessage[] = [];
  let at = headerSize;
  const end = headerSize + dataSize;
  while (at < end) {
    const recordHeader = file.readUInt8(at++);
    if (recordHeader & 0x80) throw new Error('compressed timestamp header');
    const local = recordHeader & 0x0f;
    if (recordHeader & 0x40) {
      if (recordHeader & 0x20) throw new Error('developer data');
      const littleEndian = file.readUInt8(at + 1) === 0;
      const global = littleEndian ? file.readUInt16LE(at + 2) : file.readUInt16BE(at + 2);
      const count = file.readUInt8(at + 4);
      const fields: FieldDef[] = [];
      for (let i = 0; i < count; i++) {
        const offset = at + 5 + i * 3;
        fields.push({
          num: file.readUInt8(offset),
          size: file.readUInt8(offset + 1),
          base: file.readUInt8(offset + 2),
        });
      }
      defs.set(local, { global, littleEndian, fields });
      at += 5 + count * 3;
      continue;
    }
    const def = defs.get(local);
    if (!def) throw new Error(`data message for undefined local message ${local}`);
    const fields = new Map<number, number | string>();
    for (const field of def.fields) {
      fields.set(field.num, readValue(file, at, field, def.littleEndian));
      at += field.size;
    }
    messages.push({ global: def.global, fields });
  }
  if (at !== end) throw new Error('messages overrun the data size');
  return {
    headerSize,
    protocolVersion: file.readUInt8(1),
    profileVersion: file.readUInt16LE(2),
    dataSize,
    signature: file.toString('ascii', 8, 12),
    messages,
  };
}

/** FIT semicircles back to degrees. */
export function fromSemicircles(value: number): number {
  return (value * 180) / 2 ** 31;
}

/** The messages of one global number, e.g. 20 for the records. */
export function messagesOf(fit: FitFile, global: number): FitMessage[] {
  return fit.messages.filter((message) => message.global === global);
}

/** A field's numeric value; fails the test when it is missing or text. */
export function num(message: FitMessage, field: number): number {
  const value = message.fields.get(field);
  if (typeof value !== 'number') throw new Error(`field ${field} of message ${message.global} is not a number`);
  return value;
}
