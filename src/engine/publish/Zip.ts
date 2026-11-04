/**
 * Tiny, dependency-free ZIP writer.
 *
 * The publisher only ever stores files (no compression), which keeps the code
 * small and makes the output readable by every unzip implementation. The
 * archive is assembled in memory and returned as a Blob for `downloadBlob`.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export class ZipWriter {
  private entries: ZipEntry[] = [];
  private encoder = new TextEncoder();

  addText(path: string, text: string): this {
    return this.add(path, this.encoder.encode(text));
  }

  addJson(path: string, value: unknown): this {
    return this.addText(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  add(path: string, data: Uint8Array | string): this {
    const name = path.replace(/\\/g, '/').replace(/^\/+/, '');
    const bytes = typeof data === 'string' ? this.encoder.encode(data) : data;
    this.entries.push({ name, data: bytes });
    return this;
  }

  get fileCount(): number {
    return this.entries.length;
  }

  get byteLength(): number {
    return this.entries.reduce((sum, entry) => sum + entry.data.length, 0);
  }

  build(): Blob {
    const now = dosDateTime(new Date());
    const chunks: BlobPart[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const entry of this.entries) {
      const name = this.encoder.encode(entry.name);
      const crc = crc32(entry.data);
      const local = new Uint8Array(30 + name.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true); // version needed
      view.setUint16(6, 0x0800, true); // UTF-8 names
      view.setUint16(8, 0, true); // stored
      view.setUint16(10, now.time, true);
      view.setUint16(12, now.date, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, entry.data.length, true);
      view.setUint32(22, entry.data.length, true);
      view.setUint16(26, name.length, true);
      view.setUint16(28, 0, true);
      local.set(name, 30);
      chunks.push(local as unknown as BlobPart, entry.data as unknown as BlobPart);

      const dir = new Uint8Array(46 + name.length);
      const dirView = new DataView(dir.buffer);
      dirView.setUint32(0, 0x02014b50, true);
      dirView.setUint16(4, 20, true); // version made by
      dirView.setUint16(6, 20, true); // version needed
      dirView.setUint16(8, 0x0800, true);
      dirView.setUint16(10, 0, true);
      dirView.setUint16(12, now.time, true);
      dirView.setUint16(14, now.date, true);
      dirView.setUint32(16, crc, true);
      dirView.setUint32(20, entry.data.length, true);
      dirView.setUint32(24, entry.data.length, true);
      dirView.setUint16(28, name.length, true);
      dirView.setUint16(30, 0, true);
      dirView.setUint16(32, 0, true);
      dirView.setUint16(34, 0, true);
      dirView.setUint16(36, 0, true);
      dirView.setUint32(38, 0, true);
      dirView.setUint32(42, offset, true);
      dir.set(name, 46);
      central.push(dir);

      offset += local.length + entry.data.length;
    }

    let centralSize = 0;
    for (const dir of central) {
      chunks.push(dir as unknown as BlobPart);
      centralSize += dir.length;
    }

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, this.entries.length, true);
    endView.setUint16(10, this.entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    chunks.push(end as unknown as BlobPart);

    return new Blob(chunks, { type: 'application/zip' });
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
}

export function slugify(value: string, fallback = 'voxelforge-project'): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}
