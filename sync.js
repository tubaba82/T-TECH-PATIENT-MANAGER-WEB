/**
 * sync.js — Two-way data sync engine
 * 
 * Tracks all INSERT/UPDATE/DELETE operations in a change_log table.
 * Pushes unsynced changes to the remote server periodically.
 * Pulls changes from remote that were made there.
 * 
 * Conflict resolution: Last-write-wins (based on timestamp)
 * 
 * Used by both LOCAL and CLOUD instances.
 */
'use strict';

const https = require('https');
const http = require('http');

class SyncEngine {
  constructor(db, runFn, getFn, allFn, options = {}) {
    this.db = db;
    this.run = runFn;
    this.get = getFn;
    this.all = allFn;
    this.remoteUrl = options.remoteUrl || '';  // URL of the other server
    this.syncKey = options.syncKey || '';      // shared secret for auth
    this.role = options.role || 'local';      // 'local' or 'cloud'
    this.syncInterval = options.syncInterval || 30000; // 30 seconds
    this.timer = null;
    this.syncing = false;
    this.lastSyncAt = '';
    this.online = false;
  }

  init() {
    // Create change_log table
    this.run(`CREATE TABLE IF NOT EXISTS change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      changed_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0,
      source TEXT DEFAULT 'local'
    )`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_changelog_synced ON change_log(synced)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_changelog_time ON change_log(changed_at)`);

    // Get last sync timestamp
    const row = this.get("SELECT value FROM settings WHERE key='last_sync_at'");
    this.lastSyncAt = row ? (row.value || '').replace(/"/g, '') : '';

    console.log(`[SYNC] Engine initialized (role: ${this.role}, remote: ${this.remoteUrl || 'not configured'})`);
  }

  start() {
    if (!this.remoteUrl) {
      console.log('[SYNC] No remote URL configured — sync disabled');
      return;
    }
    // Check if this is first run (no data locally) — do a full sync
    this.initialSync().then(() => {
      this.timer = setInterval(() => this.doSync(), this.syncInterval);
      // First incremental sync after 10 seconds
      setTimeout(() => this.doSync(), 10000);
      console.log(`[SYNC] Started (every ${this.syncInterval / 1000}s)`);
    });
  }

  async initialSync() {
    // Only do full sync if local DB is empty (first time setup)
    const patientCount = this.get("SELECT COUNT(*) as c FROM patients");
    if (patientCount && patientCount.c > 0) return; // already has data
    console.log('[SYNC] First run detected — pulling full data from cloud...');
    try {
      const result = await this.fetchFullData();
      if (result.ok && result.data) {
        const d = result.data;
        // Import all data
        if (d.users) d.users.forEach(u => {
          const exists = this.get("SELECT id FROM users WHERE username=?", [u.username]);
          if (!exists) this.run("INSERT INTO users (username,password_hash,full_name,role,active,created_at) VALUES (?,?,?,?,?,?)", [u.username, u.password_hash, u.full_name||'', u.role||'receptionist', u.active||1, u.created_at||'']);
        });
        if (d.patients) d.patients.forEach(p => {
          const exists = this.get("SELECT id FROM patients WHERE patient_id=?", [p.patient_id]);
          if (!exists) this.run("INSERT INTO patients (patient_id,first_name,last_name,phone,age,gender,address,blood_type,allergies,emergency_contact,file_location,notes,photo,portal_pin,registered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [p.patient_id, p.first_name||'', p.last_name||'', p.phone||'', p.age||0, p.gender||'', p.address||'', p.blood_type||'', p.allergies||'', p.emergency_contact||'', p.file_location||'', p.notes||'', p.photo||'', p.portal_pin||'', p.registered_at||'']);
        });
        if (d.appointments) d.appointments.forEach(a => {
          this.run("INSERT INTO appointments (patient_id,date,time,doctor,reason,status,created_at) VALUES (?,?,?,?,?,?,?)", [a.patient_id, a.date, a.time||'', a.doctor||'', a.reason||'', a.status||'scheduled', a.created_at||'']);
        });
        if (d.prescriptions) d.prescriptions.forEach(r => {
          this.run("INSERT INTO prescriptions (patient_id,drug_name,dosage,duration,quantity,price,paid,prescribed_date) VALUES (?,?,?,?,?,?,?,?)", [r.patient_id, r.drug_name||'', r.dosage||'', r.duration||'', r.quantity||0, r.price||0, r.paid||0, r.prescribed_date||'']);
        });
        if (d.visits) d.visits.forEach(v => {
          this.run("INSERT INTO visits (patient_id,visit_date,diagnosis,doctor,notes) VALUES (?,?,?,?,?)", [v.patient_id, v.visit_date||'', v.diagnosis||'', v.doctor||'', v.notes||'']);
        });
        if (d.labs) d.labs.forEach(l => {
          this.run("INSERT INTO lab_results (patient_id,test_name,test_category,result,reference_range,unit,status,ordered_by,ordered_at) VALUES (?,?,?,?,?,?,?,?,?)", [l.patient_id, l.test_name||'', l.test_category||'', l.result||'', l.reference_range||'', l.unit||'', l.status||'pending', l.ordered_by||'', l.ordered_at||'']);
        });
        console.log(`[SYNC] Full sync complete: ${d.patients?d.patients.length:0} patients, ${d.appointments?d.appointments.length:0} appointments`);
      }
    } catch(e) {
      console.log('[SYNC] Full sync failed (will retry on next start):', e.message);
    }
  }

  async fetchFullData() {
    return new Promise((resolve) => {
      try {
        const url = new URL(this.remoteUrl + `/api/sync/full?syncKey=${encodeURIComponent(this.syncKey)}`);
        const opts = { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname + url.search, method: 'GET', timeout: 30000 };
        const req = (url.protocol === 'https:' ? require('https') : require('http')).request(opts, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({ ok: false }); } });
        });
        req.on('error', () => resolve({ ok: false }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
        req.end();
      } catch(e) { resolve({ ok: false }); }
    });
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // Log a change (called by the app whenever data is modified)
  logChange(tableName, recordId, action, data = {}) {
    this.run("INSERT INTO change_log (table_name, record_id, action, data, source) VALUES (?,?,?,?,?)",
      [tableName, String(recordId), action, JSON.stringify(data), this.role]);
  }

  // Get unsynced changes
  getUnsynced() {
    return this.all("SELECT * FROM change_log WHERE synced=0 AND source=? ORDER BY changed_at ASC LIMIT 100", [this.role]);
  }

  // Mark changes as synced
  markSynced(ids) {
    if (ids.length === 0) return;
    this.run(`UPDATE change_log SET synced=1 WHERE id IN (${ids.join(',')})`);
  }

  // Main sync loop
  async doSync() {
    if (this.syncing || !this.remoteUrl) return;
    this.syncing = true;
    try {
      // 1. PUSH: Send our unsynced changes to remote
      const changes = this.getUnsynced();
      if (changes.length > 0) {
        const result = await this.pushChanges(changes);
        if (result.ok) {
          this.markSynced(changes.map(c => c.id));
          this.online = true;
          console.log(`[SYNC] Pushed ${changes.length} changes`);
        }
      }

      // 2. PULL: Get changes from remote since last sync
      const pulled = await this.pullChanges();
      if (pulled.ok && pulled.changes && pulled.changes.length > 0) {
        this.applyRemoteChanges(pulled.changes);
        console.log(`[SYNC] Pulled ${pulled.changes.length} changes`);
      }

      // Update last sync time
      this.lastSyncAt = new Date().toISOString();
      this.run("INSERT OR REPLACE INTO settings (key,value) VALUES ('last_sync_at',?)", [JSON.stringify(this.lastSyncAt)]);
      this.online = true;
    } catch(e) {
      this.online = false;
      // Silent fail — will retry next interval
    }
    this.syncing = false;
  }

  // Push changes to remote server
  async pushChanges(changes) {
    return new Promise((resolve) => {
      try {
        const url = new URL(this.remoteUrl + '/api/sync/push');
        const postData = JSON.stringify({ changes, syncKey: this.syncKey, source: this.role });
        const opts = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
          timeout: 10000
        };
        const req = (url.protocol === 'https:' ? https : http).request(opts, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({ ok: false }); } });
        });
        req.on('error', () => resolve({ ok: false }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
        req.write(postData);
        req.end();
      } catch(e) { resolve({ ok: false }); }
    });
  }

  // Pull changes from remote server
  async pullChanges() {
    return new Promise((resolve) => {
      try {
        const since = encodeURIComponent(this.lastSyncAt || '2000-01-01');
        const url = new URL(this.remoteUrl + `/api/sync/pull?since=${since}&syncKey=${encodeURIComponent(this.syncKey)}`);
        const opts = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'GET',
          timeout: 10000
        };
        const req = (url.protocol === 'https:' ? https : http).request(opts, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({ ok: false }); } });
        });
        req.on('error', () => resolve({ ok: false }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
        req.end();
      } catch(e) { resolve({ ok: false }); }
    });
  }

  // Apply changes received from remote
  applyRemoteChanges(changes) {
    for (const change of changes) {
      try {
        const data = typeof change.data === 'string' ? JSON.parse(change.data) : change.data;
        const table = change.table_name;
        const id = change.record_id;

        switch(change.action) {
          case 'INSERT':
            this.applyInsert(table, data);
            break;
          case 'UPDATE':
            this.applyUpdate(table, id, data);
            break;
          case 'DELETE':
            this.applyDelete(table, id);
            break;
        }
      } catch(e) {
        console.error('[SYNC] Apply error:', e.message);
      }
    }
  }

  applyInsert(table, data) {
    // Check if record already exists (by primary key or unique field)
    const idField = table === 'patients' ? 'patient_id' : 'id';
    const idValue = data[idField] || data.id;
    if (!idValue) return;
    const exists = this.get(`SELECT ${idField} FROM ${table} WHERE ${idField}=?`, [idValue]);
    if (exists) {
      // Already exists — do update instead
      this.applyUpdate(table, idValue, data);
      return;
    }
    const keys = Object.keys(data).filter(k => k !== 'id');
    const vals = keys.map(k => data[k]);
    if (keys.length === 0) return;
    this.run(`INSERT OR IGNORE INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, vals);
  }

  applyUpdate(table, id, data) {
    const idField = table === 'patients' ? 'patient_id' : 'id';
    const keys = Object.keys(data).filter(k => k !== 'id' && k !== idField);
    if (keys.length === 0) return;
    const sets = keys.map(k => `${k}=?`);
    const vals = keys.map(k => data[k]);
    vals.push(id);
    this.run(`UPDATE ${table} SET ${sets.join(',')} WHERE ${idField}=?`, vals);
  }

  applyDelete(table, id) {
    const idField = table === 'patients' ? 'patient_id' : 'id';
    this.run(`DELETE FROM ${table} WHERE ${idField}=?`, [id]);
  }

  // Status info
  getStatus() {
    const unsynced = this.get("SELECT COUNT(*) as c FROM change_log WHERE synced=0 AND source=?", [this.role]);
    return {
      online: this.online,
      role: this.role,
      remoteUrl: this.remoteUrl || 'Not configured',
      lastSync: this.lastSyncAt || 'Never',
      pendingChanges: unsynced ? unsynced.c : 0
    };
  }
}

module.exports = SyncEngine;
