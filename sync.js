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
    this.timer = setInterval(() => this.doSync(), this.syncInterval);
    // First sync after 5 seconds
    setTimeout(() => this.doSync(), 5000);
    console.log(`[SYNC] Started (every ${this.syncInterval / 1000}s)`);
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
