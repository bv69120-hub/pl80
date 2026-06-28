import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDirectory = path.join(root, "apps", "desktop", "build");
const databaseDirectory = path.join(buildDirectory, "database");
const databasePath = path.join(databaseDirectory, "bv-expedition.db");

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return output;
}

function createIconPng() {
  const size = 256;
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const glyphs = {
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  };
  const scale = 15;
  const startX = Math.floor((size - 11 * scale) / 2);
  const startY = Math.floor((size - 7 * scale) / 2);

  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4;
      const insideCircle = (x - 128) ** 2 + (y - 128) ** 2 <= 118 ** 2;
      let color = insideCircle ? [0, 59, 122, 255] : [0, 0, 0, 0];
      for (const [index, letter] of ["B", "V"].entries()) {
        const gx = Math.floor((x - (startX + index * 6 * scale)) / scale);
        const gy = Math.floor((y - startY) / scale);
        if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && glyphs[letter][gy][gx] === "1") {
          color = [255, 212, 0, 255];
        }
      }
      pixels.set(color, offset);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIco(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

await mkdir(databaseDirectory, { recursive: true });
await rm(databasePath, { force: true });
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
const env = { ...process.env, DATABASE_URL: databaseUrl };
run("pnpm", ["--filter", "@bv/database", "exec", "prisma", "migrate", "deploy"], env);
run("pnpm", ["--filter", "@bv/database", "exec", "tsx", "prisma/seed.ts"], env);
const png = createIconPng();
await writeFile(path.join(buildDirectory, "icon.png"), png);
await writeFile(path.join(buildDirectory, "icon.ico"), createIco(png));
