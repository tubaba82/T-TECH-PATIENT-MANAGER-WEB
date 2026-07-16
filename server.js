/**
 * Allahu Jallah Spiritual Clinic — Web App v1.2.0
 * Node.js/Express backend with SQLite (sql.js)
 * Access from any device on the local network via browser.
 * Security: bcrypt passwords, rate limiting, patient PIN verification
 *
 * © T-Tech Solutions 2026
 */
'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_CLOUD = !!process.env.RENDER || !!process.env.RAILWAY_ENVIRONMENT || !!process.env.DYNO;

// ═══════════════════════════════════════════════════════════════
// RATE LIMITING (brute-force protection)
// ═══════════════════════════════════════════════════════════════
const loginAttempts = new Map(); // IP -> { count, lastAttempt, lockedUntil }
const RATE_LIMIT_MAX = 5;       // max attempts before lockout
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 min lockout

function checkRateLimit(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { allowed: false, remaining };
  }
  // Reset if window expired
  if (Date.now() - record.lastAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  if (record.count >= RATE_LIMIT_MAX) {
    record.lockedUntil = Date.now() + RATE_LIMIT_WINDOW;
    return { allowed: false, remaining: Math.ceil(RATE_LIMIT_WINDOW / 1000) };
  }
  return { allowed: true };
}

function recordFailedLogin(ip) {
  const record = loginAttempts.get(ip) || { count: 0, lastAttempt: 0, lockedUntil: 0 };
  record.count++;
  record.lastAttempt = Date.now();
  if (record.count >= RATE_LIMIT_MAX) {
    record.lockedUntil = Date.now() + RATE_LIMIT_WINDOW;
  }
  loginAttempts.set(ip, record);
}

function clearFailedLogin(ip) { loginAttempts.delete(ip); }

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy for HTTPS on cloud (Render, Railway use reverse proxy)
if (IS_CLOUD) app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'AJSC-T-Tech-2026-' + crypto.randomBytes(8).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    secure: false,
    httpOnly: true
  }
}));

// Photo upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ═══════════════════════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════════════════════
let initSqlJs, db = null;
// On cloud (Render), use /opt/render/project/data for persistence
// On local, use ./data folder
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'clinic.db');

async function initDB() {
  initSqlJs = require('sql.js');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log('[DB] Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database');
  }
  createTables();
  saveDB();
  // Auto-save every 5 seconds if dirty
  setInterval(() => saveDB(), 5000);
}

let _dirty = false;
function saveDB() {
  if (!db || !_dirty) return;
  try {
    const d = db.export();
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(d));
    fs.renameSync(tmp, DB_PATH);
    _dirty = false;
  } catch(e) { console.error('[DB] Save error:', e.message); }
}

function run(sql, p = []) {
  if (!db) return null;
  try {
    db.run(sql, p);
    _dirty = true;
    if (sql.trim().toUpperCase().startsWith('INSERT')) {
      const r = db.exec("SELECT last_insert_rowid() as id");
      if (r.length > 0 && r[0].values.length > 0) return r[0].values[0][0];
    }
    return null;
  } catch(e) { console.error('[DB]', e.message); return null; }
}

function get(sql, p = []) {
  if (!db) return null;
  try {
    const s = db.prepare(sql); s.bind(p);
    if (s.step()) { const r = s.getAsObject(); s.free(); return r; }
    s.free();
  } catch(e) {}
  return null;
}

function all(sql, p = []) {
  if (!db) return [];
  try {
    const r = [], s = db.prepare(sql); s.bind(p);
    while (s.step()) r.push(s.getAsObject());
    s.free(); return r;
  } catch(e) { return []; }
}

function hashPassword(pw) {
  // scrypt-based hash with random salt (secure, built-in, no extra dependency)
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(stored, pw) {
  // Support both new scrypt format (salt:hash) and legacy SHA-256
  if (stored.includes(':')) {
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(pw, salt, 64).toString('hex');
    return test === hash;
  }
  // Legacy: plain SHA-256 (auto-migrates on next login)
  return stored === crypto.createHash('sha256').update(pw).digest('hex');
}

function generatePatientId() {
  const row = get("SELECT value FROM settings WHERE key='next_patient_num'");
  const num = row ? parseInt(row.value) || 1 : 1;
  run("UPDATE settings SET value=? WHERE key='next_patient_num'", [String(num + 1)]);
  return `PT-${String(num).padStart(5, '0')}`;
}

function generateInvoiceNo() {
  const row = get("SELECT value FROM settings WHERE key='next_invoice_num'");
  const num = row ? parseInt(row.value) || 1 : 1;
  run("UPDATE settings SET value=? WHERE key='next_invoice_num'", [String(num + 1)]);
  return `INV-${String(num).padStart(5, '0')}`;
}

function auditLog(user, action, entity = '', entityId = '', details = '') {
  run("INSERT INTO audit_log (user,action,entity,entity_id,details) VALUES (?,?,?,?,?)",
    [user || 'system', action, entity, entityId, details]);
}

function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name TEXT DEFAULT '', role TEXT DEFAULT 'receptionist', active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS patients (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT UNIQUE NOT NULL, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', phone TEXT DEFAULT '', age INTEGER DEFAULT 0, gender TEXT DEFAULT '', address TEXT DEFAULT '', blood_type TEXT DEFAULT '', allergies TEXT DEFAULT '', emergency_contact TEXT DEFAULT '', file_location TEXT DEFAULT '', notes TEXT DEFAULT '', photo TEXT DEFAULT '', portal_pin TEXT DEFAULT '', registered_at TEXT DEFAULT (datetime('now')))`);
  // Migration: add portal_pin column if missing (for existing databases)
  try { db.run("ALTER TABLE patients ADD COLUMN portal_pin TEXT DEFAULT ''"); } catch(e) {}  db.run(`CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, visit_date TEXT DEFAULT (datetime('now')), diagnosis TEXT DEFAULT '', doctor TEXT DEFAULT '', notes TEXT DEFAULT '', next_appointment TEXT DEFAULT '', next_appointment_time TEXT DEFAULT '09:00', status TEXT DEFAULT 'completed')`);
  db.run(`CREATE TABLE IF NOT EXISTS prescriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, visit_id INTEGER, drug_name TEXT NOT NULL DEFAULT '', dosage TEXT DEFAULT '', duration TEXT DEFAULT '', quantity INTEGER DEFAULT 0, price REAL DEFAULT 0, paid INTEGER DEFAULT 0, prescribed_date TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, date TEXT NOT NULL, time TEXT DEFAULT '09:00', doctor TEXT DEFAULT '', reason TEXT DEFAULT '', status TEXT DEFAULT 'scheduled', reminder_sent INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_no TEXT UNIQUE NOT NULL, patient_id TEXT NOT NULL, items TEXT DEFAULT '[]', subtotal REAL DEFAULT 0, discount REAL DEFAULT 0, total REAL DEFAULT 0, amount_paid REAL DEFAULT 0, status TEXT DEFAULT 'unpaid', created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, queue_number INTEGER NOT NULL, status TEXT DEFAULT 'waiting', priority TEXT DEFAULT 'normal', reason TEXT DEFAULT '', doctor TEXT DEFAULT '', added_at TEXT DEFAULT (datetime('now')), called_at TEXT DEFAULT '', completed_at TEXT DEFAULT '')`);
  db.run(`CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT DEFAULT '', action TEXT NOT NULL, entity TEXT DEFAULT '', entity_id TEXT DEFAULT '', details TEXT DEFAULT '', timestamp TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS lab_results (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, visit_id INTEGER DEFAULT 0, test_name TEXT NOT NULL DEFAULT '', test_category TEXT DEFAULT '', result TEXT DEFAULT '', reference_range TEXT DEFAULT '', unit TEXT DEFAULT '', status TEXT DEFAULT 'pending', ordered_by TEXT DEFAULT '', ordered_at TEXT DEFAULT (datetime('now')), received_at TEXT DEFAULT '')`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS rx_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '', drugs TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')))`);

  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_patients_pid ON patients(patient_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id)`);

  // Default settings
  const s = get("SELECT value FROM settings WHERE key='next_patient_num'");
  if (!s) run("INSERT INTO settings (key,value) VALUES ('next_patient_num','1')");
  const inv = get("SELECT value FROM settings WHERE key='next_invoice_num'");
  if (!inv) run("INSERT INTO settings (key,value) VALUES ('next_invoice_num','1')");

  // Default admin
  const admin = get("SELECT * FROM users WHERE username='admin'");
  if (!admin) {
    run("INSERT INTO users (username,password_hash,full_name,role) VALUES (?,?,?,?)",
      ['admin', hashPassword('admin'), 'Administrator', 'admin']);
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ ok: false, error: 'Not logged in' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin access required' });
  next();
}
function requireDoctorOrAdmin(req, res, next) {
  if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'doctor')) return res.status(403).json({ ok: false, error: 'Doctor or Admin access required' });
  next();
}

// ═══════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════

// Auth
app.post('/api/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const limit = checkRateLimit(ip);
  if (!limit.allowed) return res.json({ ok: false, error: `Too many attempts. Try again in ${limit.remaining} seconds.` });

  const { username, password } = req.body;
  if (!username || !password) return res.json({ ok: false, error: 'Username and password required' });
  const user = get("SELECT * FROM users WHERE username=? AND active=1", [username]);
  if (!user) { recordFailedLogin(ip); return res.json({ ok: false, error: 'Invalid username or password' }); }
  if (!verifyPassword(user.password_hash, password)) { recordFailedLogin(ip); return res.json({ ok: false, error: 'Invalid username or password' }); }

  // Auto-migrate legacy SHA-256 hash to scrypt on successful login
  if (!user.password_hash.includes(':')) {
    const newHash = hashPassword(password);
    run("UPDATE users SET password_hash=? WHERE id=?", [newHash, user.id]);
  }

  clearFailedLogin(ip);
  req.session.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
  auditLog(username, 'login', 'user', username);
  res.json({ ok: true, user: req.session.user });
});
app.post('/api/logout', (req, res) => {
  if (req.session.user) auditLog(req.session.user.username, 'logout');
  req.session.destroy();
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  res.json(req.session.user || null);
});
app.post('/api/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.json({ ok: false, error: 'Both fields required' });
  if (newPassword.length < 4) return res.json({ ok: false, error: 'Password must be at least 4 characters' });
  const user = get("SELECT * FROM users WHERE id=?", [req.session.user.id]);
  if (!verifyPassword(user.password_hash, oldPassword)) return res.json({ ok: false, error: 'Current password incorrect' });
  run("UPDATE users SET password_hash=? WHERE id=?", [hashPassword(newPassword), req.session.user.id]);
  res.json({ ok: true });
});

// Users
app.get('/api/users', requireAdmin, (req, res) => { res.json(all("SELECT id,username,full_name,role,active,created_at FROM users ORDER BY created_at")); });
app.post('/api/users', requireAdmin, (req, res) => {
  const u = req.body;
  run("INSERT INTO users (username,password_hash,full_name,role) VALUES (?,?,?,?)", [u.username, hashPassword(u.password || 'pass123'), u.full_name || '', u.role || 'receptionist']);
  res.json({ ok: true });
});
app.put('/api/users/:id', requireAdmin, (req, res) => {
  const { full_name, role, password } = req.body;
  if (password) run("UPDATE users SET full_name=?, role=?, password_hash=? WHERE id=?", [full_name, role, hashPassword(password), req.params.id]);
  else run("UPDATE users SET full_name=?, role=? WHERE id=?", [full_name, role, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/users/:id', requireAdmin, (req, res) => { run("UPDATE users SET active=0 WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// Patients
app.get('/api/patients', requireAuth, (req, res) => {
  const q = req.query.search;
  if (q && q.length >= 2) { const s = `%${q}%`; return res.json(all('SELECT * FROM patients WHERE first_name LIKE ? OR last_name LIKE ? OR patient_id LIKE ? OR phone LIKE ? ORDER BY last_name LIMIT 100', [s,s,s,s])); }
  res.json(all('SELECT * FROM patients ORDER BY registered_at DESC LIMIT 200'));
});
app.get('/api/patients/:pid', requireAuth, (req, res) => { res.json(get('SELECT * FROM patients WHERE patient_id=?', [req.params.pid])); });
app.post('/api/patients', requireAuth, (req, res) => {
  const p = req.body; const pid = generatePatientId();
  run("INSERT INTO patients (patient_id,first_name,last_name,phone,age,gender,address,blood_type,allergies,emergency_contact,file_location,notes,photo,portal_pin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [pid, p.first_name||'', p.last_name||'', p.phone||'', p.age||0, p.gender||'', p.address||'', p.blood_type||'', p.allergies||'', p.emergency_contact||'', p.file_location||'', p.notes||'', p.photo||'', p.portal_pin||'']);
  auditLog(req.session.user.username, 'patient_registered', 'patient', pid);
  if (syncEngine) syncEngine.logChange('patients', pid, 'INSERT', { patient_id: pid, ...p });
  _dirty = true; saveDB(); // Force immediate save
  res.json({ ok: true, patient_id: pid });
});
app.put('/api/patients/:pid', requireAuth, (req, res) => {
  const allowed = ['first_name','last_name','phone','age','gender','address','blood_type','allergies','emergency_contact','file_location','notes','photo','portal_pin'];
  const fields = [], values = [];
  for (const [k,v] of Object.entries(req.body)) { if (allowed.includes(k)) { fields.push(`${k}=?`); values.push(v); } }
  if (fields.length === 0) return res.json({ ok: false, error: 'No fields' });
  values.push(req.params.pid);
  run(`UPDATE patients SET ${fields.join(',')} WHERE patient_id=?`, values);
  if (syncEngine) syncEngine.logChange('patients', req.params.pid, 'UPDATE', req.body);
  res.json({ ok: true });
});
app.delete('/api/patients/:pid', requireAdmin, (req, res) => {
  const pid = req.params.pid;
  run('DELETE FROM patients WHERE patient_id=?', [pid]);
  run('DELETE FROM visits WHERE patient_id=?', [pid]);
  run('DELETE FROM prescriptions WHERE patient_id=?', [pid]);
  run('DELETE FROM appointments WHERE patient_id=?', [pid]);
  run('DELETE FROM lab_results WHERE patient_id=?', [pid]);
  auditLog(req.session.user.username, 'patient_deleted', 'patient', pid);
  res.json({ ok: true });
});

// Visits
app.get('/api/visits/:pid', requireAuth, (req, res) => { res.json(all('SELECT * FROM visits WHERE patient_id=? ORDER BY visit_date DESC', [req.params.pid])); });
app.post('/api/visits', requireAuth, (req, res) => {
  const v = req.body;
  run('INSERT INTO visits (patient_id,visit_date,diagnosis,doctor,notes,next_appointment,next_appointment_time) VALUES (?,?,?,?,?,?,?)',
    [v.patient_id, v.visit_date||new Date().toISOString().slice(0,10), v.diagnosis||'', v.doctor||'', v.notes||'', v.next_appointment||'', v.next_appointment_time||'09:00']);
  if (v.next_appointment) run('INSERT INTO appointments (patient_id,date,time,doctor,reason,status) VALUES (?,?,?,?,?,?)', [v.patient_id, v.next_appointment, v.next_appointment_time||'09:00', v.doctor||'', 'Follow-up', 'scheduled']);
  res.json({ ok: true });
});

// Prescriptions
app.get('/api/prescriptions/:pid', requireAuth, (req, res) => { res.json(all('SELECT * FROM prescriptions WHERE patient_id=? ORDER BY prescribed_date DESC', [req.params.pid])); });
app.get('/api/prescriptions-unpaid', requireAuth, (req, res) => { res.json(all("SELECT rx.*, p.first_name, p.last_name, p.patient_id FROM prescriptions rx JOIN patients p ON rx.patient_id=p.patient_id WHERE rx.paid=0 ORDER BY rx.prescribed_date DESC")); });
app.get('/api/prescriptions-all', requireAuth, (req, res) => { res.json(all("SELECT rx.*, p.first_name, p.last_name, p.patient_id FROM prescriptions rx JOIN patients p ON rx.patient_id=p.patient_id ORDER BY rx.prescribed_date DESC LIMIT 200")); });
app.post('/api/prescriptions', requireDoctorOrAdmin, (req, res) => {
  const rx = req.body;
  run('INSERT INTO prescriptions (patient_id,drug_name,dosage,duration,quantity,price,paid) VALUES (?,?,?,?,?,?,?)',
    [rx.patient_id, rx.drug_name||'', rx.dosage||'', rx.duration||'', rx.quantity||0, rx.price||0, rx.paid?1:0]);
  if (syncEngine) syncEngine.logChange('prescriptions', rx.patient_id+':'+rx.drug_name, 'INSERT', rx);
  res.json({ ok: true });
});
app.put('/api/prescriptions/:id', requireDoctorOrAdmin, (req, res) => {
  const allowed = ['drug_name','dosage','duration','quantity','price','paid'];
  const fields = [], values = [];
  for (const [k,v] of Object.entries(req.body)) { if (allowed.includes(k)) { fields.push(`${k}=?`); values.push(v); } }
  values.push(req.params.id);
  run(`UPDATE prescriptions SET ${fields.join(',')} WHERE id=?`, values);
  res.json({ ok: true });
});
app.delete('/api/prescriptions/:id', requireAdmin, (req, res) => { run("DELETE FROM prescriptions WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// Appointments
app.get('/api/appointments', requireAuth, (req, res) => {
  const date = req.query.date;
  if (date) return res.json(all("SELECT a.*,p.first_name,p.last_name,p.phone,p.file_location FROM appointments a JOIN patients p ON a.patient_id=p.patient_id WHERE a.date=? ORDER BY a.time", [date]));
  res.json(all("SELECT a.*,p.first_name,p.last_name,p.phone,p.file_location FROM appointments a JOIN patients p ON a.patient_id=p.patient_id WHERE a.status='scheduled' ORDER BY a.date,a.time LIMIT 50"));
});
app.post('/api/appointments', requireAuth, (req, res) => {
  const a = req.body;
  run('INSERT INTO appointments (patient_id,date,time,doctor,reason,status) VALUES (?,?,?,?,?,?)', [a.patient_id, a.date, a.time||'09:00', a.doctor||'', a.reason||'', 'scheduled']);
  if (syncEngine) syncEngine.logChange('appointments', a.patient_id+':'+a.date, 'INSERT', a);
  res.json({ ok: true });
});
app.put('/api/appointments/:id/done', requireAuth, (req, res) => { run("UPDATE appointments SET status='completed' WHERE id=?", [req.params.id]); res.json({ ok: true }); });
app.put('/api/appointments/:id/noshow', requireAuth, (req, res) => { run("UPDATE appointments SET status='no_show' WHERE id=?", [req.params.id]); res.json({ ok: true }); });
app.delete('/api/appointments/:id', requireAdmin, (req, res) => { run('DELETE FROM appointments WHERE id=?', [req.params.id]); res.json({ ok: true }); });

// Queue
app.get('/api/queue', requireAuth, (req, res) => {
  const today = new Date().toISOString().slice(0,10);
  res.json(all("SELECT q.*, p.first_name, p.last_name, p.phone, p.file_location FROM queue q JOIN patients p ON q.patient_id=p.patient_id WHERE q.added_at LIKE ? ORDER BY CASE q.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, q.queue_number", [today+'%']));
});
app.post('/api/queue', requireAuth, (req, res) => {
  const d = req.body; const today = new Date().toISOString().slice(0,10);
  const last = get("SELECT MAX(queue_number) as n FROM queue WHERE added_at LIKE ?", [today+'%']);
  const num = (last && last.n) ? last.n + 1 : 1;
  run("INSERT INTO queue (patient_id,queue_number,priority,reason,doctor) VALUES (?,?,?,?,?)", [d.patient_id, num, d.priority||'normal', d.reason||'', d.doctor||'']);
  res.json({ ok: true, queue_number: num });
});
app.put('/api/queue/:id/call', requireAuth, (req, res) => { run("UPDATE queue SET status='in_progress', called_at=datetime('now') WHERE id=?", [req.params.id]); res.json({ ok: true }); });
app.put('/api/queue/:id/complete', requireAuth, (req, res) => { run("UPDATE queue SET status='completed', completed_at=datetime('now') WHERE id=?", [req.params.id]); res.json({ ok: true }); });
app.delete('/api/queue/:id', requireAuth, (req, res) => { run("DELETE FROM queue WHERE id=?", [req.params.id]); res.json({ ok: true }); });
app.get('/api/queue/stats', requireAuth, (req, res) => {
  const today = new Date().toISOString().slice(0,10);
  const waiting = get("SELECT COUNT(*) as c FROM queue WHERE added_at LIKE ? AND status='waiting'", [today+'%']);
  const inProgress = get("SELECT COUNT(*) as c FROM queue WHERE added_at LIKE ? AND status='in_progress'", [today+'%']);
  const completed = get("SELECT COUNT(*) as c FROM queue WHERE added_at LIKE ? AND status='completed'", [today+'%']);
  res.json({ waiting: waiting?waiting.c:0, inProgress: inProgress?inProgress.c:0, completed: completed?completed.c:0 });
});
app.post('/api/queue/callnext', requireAuth, (req, res) => {
  const today = new Date().toISOString().slice(0,10);
  const next = get("SELECT q.*, p.first_name, p.last_name FROM queue q JOIN patients p ON q.patient_id=p.patient_id WHERE q.added_at LIKE ? AND q.status='waiting' ORDER BY CASE q.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, q.queue_number LIMIT 1", [today+'%']);
  if (!next) return res.json({ ok: false, error: 'Queue is empty' });
  run("UPDATE queue SET status='in_progress', called_at=datetime('now') WHERE id=?", [next.id]);
  res.json({ ok: true, patient: next });
});

// Billing
app.get('/api/invoices/unpaid', requireAuth, (req, res) => { res.json(all("SELECT i.*, p.first_name, p.last_name FROM invoices i JOIN patients p ON i.patient_id=p.patient_id WHERE i.status IN ('unpaid','partial') ORDER BY i.created_at DESC")); });
app.post('/api/invoices', requireAuth, (req, res) => {
  const d = req.body; const invNo = generateInvoiceNo();
  run("INSERT INTO invoices (invoice_no,patient_id,items,subtotal,discount,total,amount_paid,status,created_by) VALUES (?,?,?,?,?,?,?,?,?)",
    [invNo, d.patient_id, JSON.stringify(d.items||[]), d.subtotal||0, d.discount||0, d.total||0, d.amount_paid||0, d.amount_paid>=d.total?'paid':'unpaid', req.session.user?.username||'']);
  res.json({ ok: true, invoice_no: invNo });
});
app.post('/api/invoices/:no/pay', requireAuth, (req, res) => {
  const inv = get("SELECT * FROM invoices WHERE invoice_no=?", [req.params.no]);
  if (!inv) return res.json({ ok: false, error: 'Not found' });
  const newPaid = (inv.amount_paid||0) + (req.body.amount||0);
  const status = newPaid >= inv.total ? 'paid' : 'partial';
  run("UPDATE invoices SET amount_paid=?, status=? WHERE invoice_no=?", [newPaid, status, req.params.no]);
  res.json({ ok: true, status });
});

// Lab
app.get('/api/lab/pending', requireAuth, (req, res) => { res.json(all("SELECT l.*, p.first_name, p.last_name, p.patient_id AS pid FROM lab_results l JOIN patients p ON l.patient_id=p.patient_id WHERE l.status='pending' ORDER BY l.ordered_at DESC")); });
app.get('/api/lab/:pid', requireAuth, (req, res) => { res.json(all("SELECT * FROM lab_results WHERE patient_id=? ORDER BY ordered_at DESC", [req.params.pid])); });
app.post('/api/lab', requireDoctorOrAdmin, (req, res) => {
  const d = req.body;
  run("INSERT INTO lab_results (patient_id,test_name,test_category,reference_range,unit,status,ordered_by) VALUES (?,?,?,?,?,?,?)",
    [d.patient_id, d.test_name||'', d.test_category||'', d.reference_range||'', d.unit||'', 'pending', req.session.user?.full_name||'']);
  res.json({ ok: true });
});
app.put('/api/lab/:id', requireDoctorOrAdmin, (req, res) => {
  const { result, status } = req.body;
  run("UPDATE lab_results SET result=?, status=?, received_at=datetime('now') WHERE id=?", [result||'', status||'received', req.params.id]);
  res.json({ ok: true });
});

// Dashboard stats
app.get('/api/stats', requireAuth, (req, res) => {
  const today = new Date().toISOString().slice(0,10);
  res.json({
    patients: (get('SELECT COUNT(*) as c FROM patients')||{c:0}).c,
    todayAppointments: (get("SELECT COUNT(*) as c FROM appointments WHERE date=? AND status='scheduled'",[today])||{c:0}).c,
    completedToday: (get("SELECT COUNT(*) as c FROM appointments WHERE date=? AND status='completed'",[today])||{c:0}).c,
    unpaidPrescriptions: (get("SELECT COUNT(*) as c FROM prescriptions WHERE paid=0")||{c:0}).c,
    queueWaiting: (get("SELECT COUNT(*) as c FROM queue WHERE added_at LIKE ? AND status='waiting'",[today+'%'])||{c:0}).c,
    pendingLabs: (get("SELECT COUNT(*) as c FROM lab_results WHERE status='pending'")||{c:0}).c
  });
});

// Audit
app.get('/api/audit', requireAdmin, (req, res) => { res.json(all("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 200")); });

// Templates
app.get('/api/templates', requireAuth, (req, res) => { res.json(all("SELECT * FROM rx_templates ORDER BY name")); });
app.post('/api/templates/apply', requireDoctorOrAdmin, (req, res) => {
  const { template_id, patient_id } = req.body;
  const t = get("SELECT * FROM rx_templates WHERE id=?", [template_id]);
  if (!t) return res.json({ ok: false, error: 'Template not found' });
  const drugs = JSON.parse(t.drugs || '[]');
  for (const drug of drugs) run("INSERT INTO prescriptions (patient_id,drug_name,dosage,duration,quantity,price,paid) VALUES (?,?,?,?,?,?,0)", [patient_id, drug.name||'', drug.dosage||'', drug.duration||'', drug.quantity||1, drug.price||0]);
  res.json({ ok: true, added: drugs.length });
});

// ═══════════════════════════════════════════════════════════════
// PATIENT PORTAL (Public — no login required)
// Patients access: /portal
// ═══════════════════════════════════════════════════════════════
app.get('/portal', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'portal.html')); });

// ═══════════════════════════════════════════════════════════════
// SYNC API (called by the other server instance)
// ═══════════════════════════════════════════════════════════════
const SYNC_KEY = process.env.SYNC_KEY || 'ajsc-sync-2026-ttech';

app.post('/api/sync/push', (req, res) => {
  if (req.body.syncKey !== SYNC_KEY) return res.status(403).json({ ok: false, error: 'Invalid sync key' });
  const changes = req.body.changes || [];
  const source = req.body.source || 'remote';
  for (const change of changes) {
    try {
      const data = typeof change.data === 'string' ? JSON.parse(change.data) : change.data;
      // Apply the change
      if (syncEngine) syncEngine.applyRemoteChanges([change]);
      // Log it as received from remote (won't be pushed back)
      run("INSERT INTO change_log (table_name,record_id,action,data,synced,source) VALUES (?,?,?,?,1,?)",
        [change.table_name, change.record_id, change.action, JSON.stringify(data), source]);
    } catch(e) { /* skip bad records */ }
  }
  res.json({ ok: true, applied: changes.length });
});

app.get('/api/sync/pull', (req, res) => {
  if (req.query.syncKey !== SYNC_KEY) return res.status(403).json({ ok: false, error: 'Invalid sync key' });
  const since = req.query.since || '2000-01-01';
  // Return changes made HERE (by this server's role) since the given time
  const myRole = process.env.SYNC_ROLE || 'cloud';
  const changes = all("SELECT * FROM change_log WHERE source=? AND changed_at>? ORDER BY changed_at ASC LIMIT 200",
    [myRole, since]);
  res.json({ ok: true, changes });
});

// Full data dump for initial sync (first time local connects)
app.get('/api/sync/full', (req, res) => {
  if (req.query.syncKey !== SYNC_KEY) return res.status(403).json({ ok: false, error: 'Invalid sync key' });
  const patients = all("SELECT * FROM patients");
  const appointments = all("SELECT * FROM appointments");
  const prescriptions = all("SELECT * FROM prescriptions");
  const visits = all("SELECT * FROM visits");
  const labs = all("SELECT * FROM lab_results");
  const users = all("SELECT id,username,password_hash,full_name,role,active,created_at FROM users");
  const queue = all("SELECT * FROM queue");
  const invoices = all("SELECT * FROM invoices");
  res.json({ ok: true, data: { patients, appointments, prescriptions, visits, labs, users, queue, invoices } });
});

app.get('/api/sync/status', requireAuth, (req, res) => {
  if (syncEngine) res.json(syncEngine.getStatus());
  else res.json({ online: false, role: 'unknown', remoteUrl: 'Not configured', lastSync: 'Never', pendingChanges: 0 });
});

app.get('/api/portal/lookup', (req, res) => {
  const q = (req.query.q || '').trim();
  const pin = (req.query.pin || '').trim();
  if (!q || q.length < 3) return res.json({ ok: false, error: 'Enter your Patient ID (e.g. PT-00001) or phone number' });
  // Find patient by ID or phone
  const patient = get("SELECT patient_id, first_name, last_name, phone, portal_pin FROM patients WHERE patient_id=? OR phone=?", [q, q]);
  if (!patient) return res.json({ ok: false, error: 'Patient not found. Please check your Patient ID or phone number and try again.' });
  // Verify PIN (if patient has one set)
  if (patient.portal_pin && patient.portal_pin.length > 0) {
    if (!pin) return res.json({ ok: false, needPin: true, error: 'Enter your 4-digit portal PIN' });
    if (pin !== patient.portal_pin) return res.json({ ok: false, error: 'Incorrect PIN. Please try again.' });
  }
  // Get upcoming appointments
  const appointments = all("SELECT date, time, doctor, reason, status FROM appointments WHERE patient_id=? AND date >= date('now') ORDER BY date, time", [patient.patient_id]);
  // Get recent prescriptions (last 10)
  const prescriptions = all("SELECT drug_name, dosage, duration, quantity, price, paid, prescribed_date FROM prescriptions WHERE patient_id=? ORDER BY prescribed_date DESC LIMIT 10", [patient.patient_id]);
  // Get recent lab results
  const labs = all("SELECT test_name, result, status, ordered_at FROM lab_results WHERE patient_id=? ORDER BY ordered_at DESC LIMIT 10", [patient.patient_id]);
  // Get last visit
  const lastVisit = get("SELECT visit_date, diagnosis, doctor, notes FROM visits WHERE patient_id=? ORDER BY visit_date DESC LIMIT 1", [patient.patient_id]);
  // Queue position (if in today's queue)
  const today = new Date().toISOString().slice(0,10);
  const queuePos = get("SELECT queue_number, status FROM queue WHERE patient_id=? AND added_at LIKE ? AND status IN ('waiting','in_progress')", [patient.patient_id, today+'%']);

  res.json({
    ok: true,
    patient: { first_name: patient.first_name, last_name: patient.last_name, patient_id: patient.patient_id },
    appointments,
    prescriptions,
    labs,
    lastVisit,
    queue: queuePos
  });
});

// Catch-all: serve the SPA
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════
const SyncEngine = require('./sync');
let syncEngine = null;

initDB().then(() => {
  // Initialize sync engine
  const syncRole = process.env.SYNC_ROLE || 'cloud';
  const syncRemote = process.env.SYNC_REMOTE_URL || '';
  syncEngine = new SyncEngine(db, run, get, all, {
    remoteUrl: syncRemote,
    syncKey: process.env.SYNC_KEY || 'ajsc-sync-2026-ttech',
    role: syncRole,
    syncInterval: 30000
  });
  syncEngine.init();
  if (syncRemote) syncEngine.start();

  app.listen(PORT, '0.0.0.0', () => {
    const nets = require('os').networkInterfaces();
    let localIP = '127.0.0.1';
    for (const name of Object.keys(nets)) { for (const net of nets[name]) { if (net.family === 'IPv4' && !net.internal) localIP = net.address; } }
    console.log(`\n  ╔══════════════════════════════════════════════════════╗`);
    console.log(`  ║  Allahu Jallah Spiritual Clinic — Web App v1.2.0    ║`);
    console.log(`  ╠══════════════════════════════════════════════════════╣`);
    console.log(`  ║  Local:   http://localhost:${PORT}                   ║`);
    console.log(`  ║  Network: http://${localIP}:${PORT}              ║`);
    console.log(`  ║  Login:   admin / admin                             ║`);
    console.log(`  ║  Sync:    ${syncRemote ? 'ENABLED → ' + syncRemote.slice(0,30) : 'DISABLED (set SYNC_REMOTE_URL)'}  ║`);
    console.log(`  ╚══════════════════════════════════════════════════════╝\n`);
  });
});
