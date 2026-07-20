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
const LOCK_FILE = path.join(process.env.APPDATA || __dirname, 'Allahu-Jallah-Clinic', '.running');

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
  // Create data dir if needed (use AppData if Program Files is read-only)
  let dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
  // If we can't write to the app directory, use AppData instead
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    // Test write permission
    const testFile = path.join(dataDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch(e) {
    // Fall back to AppData (always writable)
    dataDir = path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming'), 'Allahu-Jallah-Clinic');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    process.env.DATA_DIR = dataDir;
  }

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
