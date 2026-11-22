// Usage: npm run bump 0.2.0
// Sets the app version everywhere it lives, so they can't drift apart.
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Give a version like 0.2.0 (three numbers, no "v" and no suffix).\nExample: npm run bump 0.2.0');
  process.exit(1);
}

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const write = (p, text) => writeFileSync(new URL(p, root), text);

function json(path, change) {
  const data = JSON.parse(read(path));
  change(data);
  write(path, JSON.stringify(data, null, 2) + '\n');
  console.log(`updated ${path}`);
}

json('package.json', (d) => { d.version = version; });
json('src-tauri/tauri.conf.json', (d) => { d.version = version; });
try {
  json('package-lock.json', (d) => { d.version = version; if (d.packages?.['']) d.packages[''].version = version; });
} catch { /* no lock file yet */ }

// Cargo.toml: only the [package] version, not dependency versions.
const cargo = read('src-tauri/Cargo.toml').replace(/(\[package\][^\[]*?\nversion\s*=\s*")[^"]*(")/, `$1${version}$2`);
write('src-tauri/Cargo.toml', cargo);
console.log('updated src-tauri/Cargo.toml');

// Cargo.lock records the app's own version too.
try {
  const lock = read('src-tauri/Cargo.lock').replace(/(name = "ytm-desktop"\nversion = ")[^"]*(")/, `$1${version}$2`);
  write('src-tauri/Cargo.lock', lock);
  console.log('updated src-tauri/Cargo.lock');
} catch { /* no lock file yet */ }

console.log(`\nVersion is now ${version}. Next:\n  git add . && git commit -m "Release v${version}"\n  git tag v${version}\n  git push && git push origin v${version}`);
