import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const locals = [], central = [], files = []; let offset = 0;
for (const name of (await readdir('public')).sort()) {
  const bytes = await readFile(`public/${name}`), path = Buffer.from(name), crc = crc32(bytes);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(path.length, 26); locals.push(local, path, bytes);
  const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
  entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(bytes.length, 20); entry.writeUInt32LE(bytes.length, 24);
  entry.writeUInt16LE(path.length, 28); entry.writeUInt32LE(offset, 42); central.push(entry, path);
  offset += local.length + path.length + bytes.length;
  files.push({ name, bytes: bytes.length, sha256: hash(bytes) });
}
const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, directory, end]);
const meta = JSON.parse(await readFile('public/jp-build.json', 'utf8'));
await mkdir('jp/build', { recursive: true });
const path = `jp/build/sonar-sweep-${meta.version}.zip`; await writeFile(path, zip);
const receipt = { schema: 1, upstream: '7f1e99a9eaeb8c577f0b4f1e88408c171c3888ee',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), ...meta, zip: path, sha256: hash(zip), files };
await writeFile('jp/build/receipt.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ path, sha256: receipt.sha256, files: files.length }));
