#!/usr/bin/env node
// Keeps index.html's two app.html-derived bits of copy in sync automatically:
//
//   1. The hero's file-size note (`.filesize`), computed from app.html's
//      actual on-disk size.
//   2. The footer's "Page last updated" date, bumped to today.
//
// Run this after patch-app-html.js, any time app.html or index.html changes.
// Safe to run unconditionally — it's a no-op if both are already correct.
//
// Usage: node tools/sample-project/sync-index-meta.js [path-to-app.html] [path-to-index.html]

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const appPath = path.resolve(process.argv[2] || path.join(REPO_ROOT, 'app.html'));
const indexPath = path.resolve(process.argv[3] || path.join(REPO_ROOT, 'index.html'));

let indexSrc = fs.readFileSync(indexPath, 'utf8');
let changed = false;

// --- file size ---
const bytes = fs.statSync(appPath).size;
const mb = (bytes / (1024 * 1024)).toFixed(1);
const filesizeRe = /(<div class="filesize">One file, ~)[\d.]+( MB\. Works the moment it finishes downloading\.<\/div>)/;
const filesizeMatch = indexSrc.match(filesizeRe);
if (!filesizeMatch) {
  throw new Error('Could not find the .filesize hero text in index.html — its copy may have changed.');
}
if (filesizeMatch[0] !== `${filesizeMatch[1]}${mb}${filesizeMatch[2]}`) {
  indexSrc = indexSrc.replace(filesizeRe, `$1${mb}$2`);
  changed = true;
  console.log(`  file size: updated to ~${mb} MB.`);
} else {
  console.log(`  file size: already ~${mb} MB, skipping.`);
}

// --- footer date ---
const today = new Date();
const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const footerRe = /(Page last updated: )[^<.]+\./;
const footerMatch = indexSrc.match(footerRe);
if (!footerMatch) {
  throw new Error('Could not find the "Page last updated" footer text in index.html — its copy may have changed.');
}
if (footerMatch[0] !== `${footerMatch[1]}${dateStr}.`) {
  indexSrc = indexSrc.replace(footerRe, `$1${dateStr}.`);
  changed = true;
  console.log(`  footer date: bumped to ${dateStr}.`);
} else {
  console.log(`  footer date: already ${dateStr}, skipping.`);
}

if (changed) {
  fs.writeFileSync(indexPath, indexSrc);
  console.log(`Updated ${path.relative(process.cwd(), indexPath)}.`);
} else {
  console.log(`${path.relative(process.cwd(), indexPath)} already in sync, no changes.`);
}
