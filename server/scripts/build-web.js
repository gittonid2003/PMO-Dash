#!/usr/bin/env node
// Assembles web/dist/ — the actual served frontend — from the source files
// in web/. There's no bundler or minifier here on purpose, matching how
// the rest of this app is built: plain files, no build tooling to break
// or go stale. This script's only job is copying things into one place.
const fs = require('fs');
const path = require('path');

const WEB_DIR = path.join(__dirname, '..', '..', 'web');
const DIST_DIR = path.join(WEB_DIR, 'dist');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((entry) => copyRecursive(path.join(src, entry), path.join(dest, entry)));
  } else {
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

['js', 'css', 'vendor'].forEach((dir) => copyRecursive(path.join(WEB_DIR, dir), path.join(DIST_DIR, dir)));
['index.html', 'store.js', 'auth-ui.js'].forEach((file) => fs.copyFileSync(path.join(WEB_DIR, file), path.join(DIST_DIR, file)));

console.log('Built web/dist/ from source.');
