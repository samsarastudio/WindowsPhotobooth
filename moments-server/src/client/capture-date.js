// Read TIFF/EXIF DateTimeOriginal without modifying the source image.
export function captureDate(exif) {
  if (!Buffer.isBuffer(exif)) return null;
  try {
    const offset = exif.subarray(0, 6).equals(Buffer.from("Exif\0\0")) ? 6 : 0;
    const b = exif.subarray(offset),
      little = b.toString("ascii", 0, 2) === "II";
    if (!little && b.toString("ascii", 0, 2) !== "MM") return null;
    const u16 = (n) => (little ? b.readUInt16LE(n) : b.readUInt16BE(n));
    const u32 = (n) => (little ? b.readUInt32LE(n) : b.readUInt32BE(n));
    if (u16(2) !== 42) return null;
    const field = (ifd, tag) => {
      const count = Math.min(u16(ifd), 2048);
      for (let i = 0; i < count; i++) {
        const at = ifd + 2 + i * 12;
        if (u16(at) !== tag) continue;
        if (u16(at + 2) === 4) return u32(at + 8);
        if (u16(at + 2) !== 2) return null;
        const len = u32(at + 4),
          start = len <= 4 ? at + 8 : u32(at + 8);
        if (len > 100 || start + len > b.length) return null;
        return b.toString("ascii", start, start + len).replace(/\0.*$/, "");
      }
      return null;
    };
    const primary = u32(4),
      sub = field(primary, 0x8769);
    const raw = sub ? field(sub, 0x9003) || field(sub, 0x9004) : null;
    if (
      typeof raw !== "string" ||
      !/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    )
      return null;
    const iso = raw.slice(0, 10).replaceAll(":", "-") + "T" + raw.slice(11);
    return Number.isFinite(Date.parse(iso + "Z")) ? iso : null;
  } catch {
    return null;
  }
}
