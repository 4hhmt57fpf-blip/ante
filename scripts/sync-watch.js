#!/usr/bin/env node
/*
 * Ante auto-sync watcher
 * ----------------------
 * Re-runs `npm run sync:web` automatically whenever a WEB SOURCE file changes,
 * so the iOS bundle (ios/App/App/public) always reflects the latest web layer
 * without anyone running sync by hand.
 *
 * Watches ONLY source inputs: index.html, manifest.json, sw.js, and assets/.
 * It deliberately does NOT watch www/ or ios/ (the sync's OUTPUT) — watching
 * those would create an infinite loop. Zero dependencies (Node's fs.watch).
 *
 * Usage:  npm run sync:watch    (Ctrl-C to stop)
 *
 * Note: this syncs the WEB layer only. If a future feature adds NATIVE iOS code
 * (a Capacitor plugin / Swift changes), that still needs an Xcode rebuild — the
 * watcher keeps the web side current; native code is compiled by Xcode.
 */
'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILES = new Set(['index.html', 'manifest.json', 'sw.js']);
const ASSET_DIR = path.join(ROOT, 'assets');
const DEBOUNCE_MS = 300;

let timer = null;
let running = false;
let pending = false;

function stamp() { return new Date().toLocaleTimeString(); }

function runSync() {
  if (running) { pending = true; return; }   // coalesce: run once more after the current run
  running = true;
  process.stdout.write(`\n[${stamp()}] change detected → syncing…\n`);
  exec('npm run sync:web', { cwd: ROOT }, (err, _stdout, stderr) => {
    running = false;
    if (err) process.stderr.write(`✗ sync failed:\n${(stderr || err.message).trim()}\n`);
    else process.stdout.write(`✓ [${stamp()}] synced to iOS bundle\n`);
    if (pending) { pending = false; schedule(); }
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(runSync, DEBOUNCE_MS);   // debounce bursts of save events
}

// Top-level files: watch the project dir (non-recursive) and react ONLY to the
// real source files. Watching the dir (not each file) survives atomic saves
// where editors replace the file via rename.
fs.watch(ROOT, { persistent: true }, (_event, filename) => {
  if (filename && SOURCE_FILES.has(filename)) schedule();
});

// assets/ — watched recursively. The sync only READS assets/, never writes to
// it, so this can't self-trigger.
if (fs.existsSync(ASSET_DIR)) {
  try {
    fs.watch(ASSET_DIR, { persistent: true, recursive: true }, () => schedule());
  } catch (e) {
    process.stderr.write('⚠ could not watch assets/ recursively: ' + e.message + '\n');
  }
}

process.stdout.write(
  '👀 Ante auto-sync is watching index.html, manifest.json, sw.js, assets/\n' +
  '   Edit & save any of them and it syncs to the iOS bundle automatically.\n' +
  '   (Ctrl-C to stop)\n'
);

// Sync once on startup so the bundle is current the moment the watcher comes up.
runSync();
