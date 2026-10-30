import { execFile } from "node:child_process"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { crc32, deflateRawSync, deflateSync } from "node:zlib"
import { promisify } from "node:util"
import esbuild from "esbuild"

const root = dirname(new URL(import.meta.url).pathname)
const dist = join(root, "dist")

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, checksum])
}

function inRoundRect(x, y, left, top, right, bottom, radius) {
  if (x < left || y < top || x > right || y > bottom) return false
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y
  if (cx === x || cy === y) return true
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

function paintIcon(x, y, size) {
  const px = x + 0.5
  const py = y + 0.5
  const margin = size * 0.06
  const radius = size * 0.22
  if (!inRoundRect(px, py, margin, margin, size - margin, size - margin, radius)) return [0, 0, 0, 0]
  let color = [32, 26, 21, 255]
  const top = size * 0.44
  const bottom = size * 0.58
  const left = size * 0.18
  const right = size * 0.82
  if (py >= top && py <= bottom && px >= left && px <= right) {
    color = [236, 228, 214, 255]
    const span = right - left
    const segLeft = left + span * 0.36
    const segRight = left + span * 0.68
    if (px >= segLeft && px <= segRight) color = [0, 184, 92, 255]
  }
  return color
}

function png(size) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paintIcon(x, y, size)
      const offset = y * stride + 1 + x * 4
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      raw[offset + 3] = a
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

async function zipDirectory(source, destination) {
  await rm(destination, { force: true })
  try {
    await promisify(execFile)("zip", ["-r", "-q", destination, "."], { cwd: source })
    return
  } catch {
    // zip(1) is not always installed. Fall back to a raw-deflate archive.
  }
  const { readdir, readFile: read } = await import("node:fs/promises")
  const { createWriteStream } = await import("node:fs")
  const { finished } = await import("node:stream/promises")
  const files = []
  async function walk(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(directory, entry.name)
      const name = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(full, name)
      else files.push({ name, data: await read(full) })
    }
  }
  await walk(source, "")
  const archive = createWriteStream(destination)
  let offset = 0
  const central = []
  for (const file of files) {
    const name = Buffer.from(file.name.replaceAll("\\", "/"))
    const raw = deflateRawSync(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc32(file.data) >>> 0, 14)
    local.writeUInt32LE(raw.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    archive.write(local)
    archive.write(name)
    archive.write(raw)
    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt32LE(crc32(file.data) >>> 0, 16)
    centralHeader.writeUInt32LE(raw.length, 20)
    centralHeader.writeUInt32LE(file.data.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt32LE(offset, 42)
    central.push(Buffer.concat([centralHeader, name]))
    offset += local.length + name.length + raw.length
  }
  const centralBytes = Buffer.concat(central)
  archive.write(centralBytes)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  archive.end(end)
  await finished(archive)
}

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

await esbuild.build({
  entryPoints: {
    "content/content": join(root, "src/content/content.ts"),
    "background/service-worker": join(root, "src/background/service-worker.ts"),
    "popup/popup": join(root, "src/popup/popup.ts"),
    "options/options": join(root, "src/options/options.ts"),
  },
  bundle: true,
  outdir: dist,
  format: "iife",
  target: "chrome114",
  legalComments: "none",
  logLevel: "info",
})

await cp(join(root, "src/manifest.json"), join(dist, "manifest.json"))
await cp(join(root, "src/content/content.css"), join(dist, "content/content.css"))
await cp(join(root, "src/popup/popup.html"), join(dist, "popup/popup.html"))
await cp(join(root, "src/popup/popup.css"), join(dist, "popup/popup.css"))
await cp(join(root, "src/options/options.html"), join(dist, "options/options.html"))
await cp(join(root, "src/options/options.css"), join(dist, "options/options.css"))

const iconDir = join(dist, "icons")
await mkdir(iconDir, { recursive: true })
for (const size of [16, 32, 48, 128]) {
  await writeFile(join(iconDir, `icon${size}.png`), png(size))
}

const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"))
if (manifest.manifest_version !== 3) throw new Error("dist manifest is not version 3")

await zipDirectory(dist, join(root, "skipsmith.zip"))
console.log("Built dist/ and skipsmith.zip")
