/**
 * Launcher — Click-and-play for the clinic app
 * Starts the server and opens the browser ONE TIME.
 */
const { exec, spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 3000;
const URL = `http://localhost:${PORT}`;
const LOCK_FILE = path.join(__dirname, 'data', '.running');

// Prevent multiple launches
if (fs.existsSync(LOCK_FILE)) {
  // Check if actually running
  const req = http.get(URL, () => {
    // Already running — just open browser and exit
    openBrowser();
    process.exit(0);
  });
  req.on('error', () => {
    // Lock file exists but server not running — stale lock, remove and continue
    fs.unlinkSync(LOCK_FILE);
    startApp();
  });
  req.setTimeout(2000, () => { req.destroy(); fs.unlinkSync(LOCK_FILE); startApp(); });
} else {
  startApp();
}

function startApp() {
  // Create data dir if needed
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // Write lock file
  fs.writeFileSync(LOCK_FILE, String(process.pid));

  // Set env
  process.env.SYNC_ROLE = 'local';
  process.env.SYNC_REMOTE_URL = 'https://t-tech-patient-manager-web.onrender.com';
  process.env.SYNC_KEY = 'ajsc-sync-2026-ttech';
  process.env.PORT = String(PORT);
  process.env.DATA_DIR = path.join(__dirname, 'data');

  // Start server
  require('./server.js');

  // Wait for server ready, then open browser ONCE
  let opened = false;
  const check = setInterval(() => {
    if (opened) { clearInterval(check); return; }
    const req = http.get(URL, () => {
      if (!opened) { opened = true; clearInterval(check); openBrowser(); }
    });
    req.on('error', () => {});
    req.setTimeout(1000, () => req.destroy());
  }, 1000);

  // Cleanup lock on exit
  process.on('exit', () => { try { fs.unlinkSync(LOCK_FILE); } catch(e) {} });
  process.on('SIGINT', () => { try { fs.unlinkSync(LOCK_FILE); } catch(e) {} process.exit(); });
}

function openBrowser() {
  exec('cmd /c start http://localhost:3000');
}
