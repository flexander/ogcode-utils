// OGcode Utils — minimal dependency-free ZIP writer (STORE method only, no
// compression). PNG bytes are already entropy-coded, so re-compressing them
// with DEFLATE buys little; storing them raw keeps this to a small, fully
// self-contained file with no vendored library, matching how the rest of
// this extension avoids third-party dependencies.
//
// Format reference: the local file header / central directory / end-of-
// central-directory layout is the standard ZIP structure understood by
// every unzip tool (Explorer, Finder, `unzip`, 7-Zip, ...).

const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function zipCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = ZIP_CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// DOS date/time packing, used by both the local file header and the central
// directory record. Resolution is 2 seconds — plenty for a file timestamp.
function zipDosDateTime(date) {
  const dosTime = ((date.getHours() & 0x1f) << 11)
    | ((date.getMinutes() & 0x3f) << 5)
    | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9)
    | (((date.getMonth() + 1) & 0xf) << 5)
    | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function zipStringToBytes(str) {
  // Filenames here are always plain ASCII (we control them), so this is a
  // straightforward byte-per-char conversion — no UTF-8 flag needed.
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

function zipWriteUint32LE(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

// entries: [{ name: string, data: Uint8Array }]
// Returns a Blob (type 'application/zip').
function buildZip(entries) {
  const now = new Date();
  const { dosTime, dosDate } = zipDosDateTime(now);
  const chunks = [];
  const centralRecords = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = zipStringToBytes(name);
    const crc = zipCrc32(data);
    const localHeader = new ArrayBuffer(30);
    const lv = new DataView(localHeader);
    zipWriteUint32LE(lv, 0, 0x04034b50);
    lv.setUint16(4, 20, true);           // version needed to extract
    lv.setUint16(6, 0, true);            // flags
    lv.setUint16(8, 0, true);            // compression method: 0 = STORE
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    zipWriteUint32LE(lv, 14, crc);
    zipWriteUint32LE(lv, 18, data.length); // compressed size == uncompressed (STORE)
    zipWriteUint32LE(lv, 22, data.length);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // extra field length

    chunks.push(new Uint8Array(localHeader), nameBytes, data);
    centralRecords.push({ nameBytes, crc, size: data.length, offset, dosTime, dosDate });
    offset += 30 + nameBytes.length + data.length;
  }

  const centralDirStart = offset;
  for (const rec of centralRecords) {
    const central = new ArrayBuffer(46);
    const cv = new DataView(central);
    zipWriteUint32LE(cv, 0, 0x02014b50);
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed to extract
    cv.setUint16(8, 0, true);            // flags
    cv.setUint16(10, 0, true);           // compression method: STORE
    cv.setUint16(12, rec.dosTime, true);
    cv.setUint16(14, rec.dosDate, true);
    zipWriteUint32LE(cv, 16, rec.crc);
    zipWriteUint32LE(cv, 20, rec.size);
    zipWriteUint32LE(cv, 24, rec.size);
    cv.setUint16(28, rec.nameBytes.length, true);
    cv.setUint16(30, 0, true);           // extra field length
    cv.setUint16(32, 0, true);           // comment length
    cv.setUint16(34, 0, true);           // disk number start
    cv.setUint16(36, 0, true);           // internal file attributes
    zipWriteUint32LE(cv, 38, 0);         // external file attributes
    zipWriteUint32LE(cv, 42, rec.offset);

    chunks.push(new Uint8Array(central), rec.nameBytes);
    offset += 46 + rec.nameBytes.length;
  }
  const centralDirSize = offset - centralDirStart;

  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  zipWriteUint32LE(ev, 0, 0x06054b50);
  ev.setUint16(4, 0, true);              // disk number
  ev.setUint16(6, 0, true);              // disk with central directory
  ev.setUint16(8, centralRecords.length, true);
  ev.setUint16(10, centralRecords.length, true);
  zipWriteUint32LE(ev, 12, centralDirSize);
  zipWriteUint32LE(ev, 16, centralDirStart);
  ev.setUint16(20, 0, true);             // comment length
  chunks.push(new Uint8Array(eocd));

  return new Blob(chunks, { type: 'application/zip' });
}
