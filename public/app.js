'use strict';
const App = { page: 'dashboard', user: null };
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const esc = s => s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// API helper
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  return r.json();
}

function toast(msg, type = 'info') {
  const c = $('#toast-container'), el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  c.appendChild(el); setTimeout(() => el.remove(), 4000);
}
function showModal(title, body, footer = '') {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = body;
  $('#modal-footer').innerHTML = footer;
  $('#modal-overlay').classList.remove('hidden');
}
function closeModal() { $('#modal-overlay').classList.add('hidden'); }

// ═══════════ AUTH ═══════════
async function doLogin() {
  const u = $('#login-user').value.trim(), p = $('#login-pass').value;
  if (!u || !p) { toast('Enter username and password', 'error'); return; }
  const r = await api('POST', '/api/login', { username: u, password: p });
  if (r.ok) { App.user = r.user; showApp(); }
  else toast(r.error || 'Login failed', 'error');
}
async function doLogout() {
  await api('POST', '/api/logout');
  App.user = null; location.reload();
}
function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user-display').textContent = App.user.full_name || App.user.username;
  buildNav();
  navigateTo('dashboard');
}

// ═══════════ NAV ═══════════
const NAV_ITEMS = [
  { page: 'dashboard', icon: '📊', label: 'Dashboard', roles: ['admin','doctor','receptionist'] },
  { page: 'patients', icon: '👤', label: 'Patients', roles: ['admin','doctor','receptionist'] },
  { page: 'queue', icon: '🪑', label: 'Queue', roles: ['admin','doctor','receptionist'] },
  { page: 'appointments', icon: '📅', label: 'Appointments', roles: ['admin','doctor','receptionist'] },
  { page: 'billing', icon: '💰', label: 'Billing', roles: ['admin','receptionist'] },
  { page: 'prescriptions', icon: '💊', label: 'Prescriptions', roles: ['admin','doctor','receptionist'] },
  { page: 'lab', icon: '🧪', label: 'Lab Results', roles: ['admin','doctor'] },
  { page: 'reports', icon: '📈', label: 'Reports', roles: ['admin','doctor'] },
  { page: 'audit', icon: '📋', label: 'Audit Log', roles: ['admin'] },
  { page: 'users', icon: '👥', label: 'Users', roles: ['admin'] },
  { page: 'settings', icon: '⚙️', label: 'Settings', roles: ['admin','doctor','receptionist'] },
];

function buildNav() {
  const role = App.user?.role || 'receptionist';
  $('#nav').innerHTML = NAV_ITEMS.filter(n => n.roles.includes(role))
    .map(n => `<div class="nav-item${n.page===App.page?' active':''}" data-page="${n.page}"><span class="nav-icon">${n.icon}</span><span>${n.label}</span></div>`).join('');
  $$('.nav-item').forEach(el => el.addEventListener('click', () => { navigateTo(el.dataset.page); closeSidebar(); }));
}
function navigateTo(page) { App.page = page; buildNav(); renderPage(page); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebar-overlay').classList.remove('show'); }

async function renderPage(page) {
  const c = $('#page-container');
  c.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading...</p></div>';
  switch(page) {
    case 'dashboard': await renderDashboard(c); break;
    case 'patients': await renderPatients(c); break;
    case 'appointments': await renderAppointments(c); break;
    case 'prescriptions': await renderPrescriptions(c); break;
    case 'queue': await renderQueue(c); break;
    case 'billing': await renderBilling(c); break;
    case 'lab': await renderLab(c); break;
    case 'audit': await renderAudit(c); break;
    case 'users': await renderUsers(c); break;
    case 'settings': await renderSettings(c); break;
    case 'reports': await renderReports(c); break;
    default: c.innerHTML = '<div class="empty"><p>Page not found</p></div>';
  }
}

// ═══════════ DASHBOARD ═══════════
async function renderDashboard(c) {
  const stats = await api('GET', '/api/stats');
  c.innerHTML = `<h2 style="font-size:18px;margin-bottom:16px">Dashboard</h2>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon blue">👤</div><div class="stat-info"><h4>${stats.patients}</h4><p>Total Patients</p></div></div>
    <div class="stat-card"><div class="stat-icon green">📅</div><div class="stat-info"><h4>${stats.todayAppointments}</h4><p>Today's Appts</p></div></div>
    <div class="stat-card"><div class="stat-icon purple">✅</div><div class="stat-info"><h4>${stats.completedToday}</h4><p>Seen Today</p></div></div>
    <div class="stat-card"><div class="stat-icon orange">💊</div><div class="stat-info"><h4>${stats.unpaidPrescriptions}</h4><p>Unpaid Rx</p></div></div>
    <div class="stat-card"><div class="stat-icon blue">🪑</div><div class="stat-info"><h4>${stats.queueWaiting}</h4><p>Queue</p></div></div>
    <div class="stat-card"><div class="stat-icon purple">🧪</div><div class="stat-info"><h4>${stats.pendingLabs}</h4><p>Pending Labs</p></div></div>
  </div>`;
}

// ═══════════ PATIENTS ═══════════
async function renderPatients(c) {
  const patients = await api('GET', '/api/patients');
  c.innerHTML = `<div class="toolbar"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" onclick="showAddPatient()">+ Register</button><input type="text" id="patient-search" placeholder="🔍 Search..." oninput="searchPatients(this.value)" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;width:200px"><label style="font-size:11px;color:var(--dim);display:flex;align-items:center;gap:4px"><input type="checkbox" id="show-inactive" onchange="toggleInactive(this.checked)"> Show Inactive</label></div><span style="font-size:12px;color:var(--dim)">${patients.length} patients</span></div>
  <div class="panel"><div class="panel-body" style="padding:0;overflow-x:auto"><table><thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Age</th><th>File</th><th>Actions</th></tr></thead><tbody id="patients-tbody">
  ${patients.length===0?'<tr><td colspan="6"><div class="empty"><p>No patients</p></div></td></tr>':patients.map(p=>`<tr onclick="openPatient('${esc(p.patient_id)}')" style="cursor:pointer${p.active===0?';opacity:0.5':''}"><td><span class="badge badge-info">${esc(p.patient_id)}</span></td><td><strong>${esc(p.first_name)} ${esc(p.last_name)}</strong>${p.active===0?' <span class="badge badge-danger">Inactive</span>':''}</td><td>${esc(p.phone)||'—'}</td><td>${p.age?p.age+'yrs':'—'}${p.gender?' · '+p.gender:''}</td><td>${esc(p.file_location)||'—'}</td><td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editPatient('${esc(p.patient_id)}')">Edit</button>${p.active===0?`<button class="btn btn-sm btn-success" onclick="event.stopPropagation();reactivatePatient('${esc(p.patient_id)}')">Activate</button>`:''}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}
async function toggleInactive(show) {
  const patients = await api('GET', `/api/patients?inactive=${show?'1':'0'}`);
  const tbody = $('#patients-tbody'); if (!tbody) return;
  tbody.innerHTML = patients.map(p=>`<tr onclick="openPatient('${esc(p.patient_id)}')" style="cursor:pointer${p.active===0?';opacity:0.5':''}"><td><span class="badge badge-info">${esc(p.patient_id)}</span></td><td><strong>${esc(p.first_name)} ${esc(p.last_name)}</strong>${p.active===0?' <span class="badge badge-danger">Inactive</span>':''}</td><td>${esc(p.phone)||'—'}</td><td>${p.age?p.age+'yrs':'—'}${p.gender?' · '+p.gender:''}</td><td>${esc(p.file_location)||'—'}</td><td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editPatient('${esc(p.patient_id)}')">Edit</button>${p.active===0?`<button class="btn btn-sm btn-success" onclick="event.stopPropagation();reactivatePatient('${esc(p.patient_id)}')">Activate</button>`:''}</td></tr>`).join('');
}
async function reactivatePatient(pid) {
  await api('PUT', `/api/patients/${pid}/reactivate`);
  toast('Patient reactivated', 'success');
  renderPage('patients');
}
async function searchPatients(q) {
  if (q.length < 2) { renderPatients($('#page-container')); return; }
  const patients = await api('GET', `/api/patients?search=${encodeURIComponent(q)}`);
  const tbody = $('#patients-tbody'); if (!tbody) return;
  tbody.innerHTML = patients.map(p => `<tr onclick="openPatient('${esc(p.patient_id)}')" style="cursor:pointer"><td><span class="badge badge-info">${esc(p.patient_id)}</span></td><td><strong>${esc(p.first_name)} ${esc(p.last_name)}</strong></td><td>${esc(p.phone)||'—'}</td><td>${p.age?p.age+'yrs':'—'}${p.gender?' · '+p.gender:''}</td><td>${esc(p.file_location)||'—'}</td><td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editPatient('${esc(p.patient_id)}')">Edit</button></td></tr>`).join('');
}

function showAddPatient() {
  showModal('Register New Patient', `<div class="form-row"><div class="form-group"><label>First Name</label><input id="p-fname"></div><div class="form-group"><label>Last Name</label><input id="p-lname"></div></div><div class="form-row-3"><div class="form-group"><label>Phone</label><input id="p-phone"></div><div class="form-group"><label>Age</label><input id="p-age" type="number"></div><div class="form-group"><label>Gender</label><select id="p-gender"><option value="">—</option><option>Male</option><option>Female</option></select></div></div><div class="form-group"><label>Address</label><input id="p-address"></div><div class="form-row"><div class="form-group"><label>Blood Type</label><select id="p-blood"><option value="">—</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select></div><div class="form-group"><label>Allergies</label><input id="p-allergies"></div></div><div class="form-row"><div class="form-group"><label>File Location</label><input id="p-file" placeholder="Shelf 3, Row B"></div><div class="form-group"><label>Portal PIN (4 digits)</label><input id="p-pin" maxlength="4" placeholder="1234" inputmode="numeric"></div></div><div class="form-group"><label>Emergency Contact</label><input id="p-emergency"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveNewPatient()">Register</button>`);
}
async function saveNewPatient() {
  const p = { first_name:$('#p-fname').value.trim(), last_name:$('#p-lname').value.trim(), phone:$('#p-phone').value.trim(), age:parseInt($('#p-age').value)||0, gender:$('#p-gender').value, address:$('#p-address').value.trim(), blood_type:$('#p-blood').value, allergies:$('#p-allergies').value.trim(), file_location:$('#p-file').value.trim(), emergency_contact:$('#p-emergency').value.trim(), portal_pin:$('#p-pin').value.trim() };
  if (!p.first_name) { toast('First name required','error'); return; }
  const r = await api('POST', '/api/patients', p);
  if (r.ok) { closeModal(); toast(`Registered: ${r.patient_id}`,'success'); renderPage('patients'); }
  else toast(r.error||'Failed','error');
}
async function openPatient(pid) {
  const p = await api('GET', `/api/patients/${pid}`);
  if (!p) return;
  const visits = await api('GET', `/api/visits/${pid}`);
  showModal(`${esc(p.first_name)} ${esc(p.last_name)}`, `<div style="margin-bottom:12px"><span class="badge badge-info">${esc(pid)}</span> <span class="badge badge-purple">📁 ${esc(p.file_location)||'—'}</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:12px"><div><strong>Phone:</strong> ${esc(p.phone)||'—'}</div><div><strong>Age:</strong> ${p.age||'—'} / ${esc(p.gender)||'—'}</div><div><strong>Blood:</strong> ${esc(p.blood_type)||'—'}</div><div><strong>Allergies:</strong> ${esc(p.allergies)||'None'}</div></div><h4 style="font-size:12px;color:var(--dim)">Recent Visits (${visits.length})</h4>${visits.slice(0,3).map(v=>`<div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--border)">${v.visit_date?v.visit_date.split(' ')[0]:''} — ${esc(v.diagnosis)||'—'}</div>`).join('')||'<p style="color:var(--dim);font-size:11px">No visits</p>'}`,
    `<button class="btn btn-secondary" onclick="closeModal()">Close</button><button class="btn btn-primary" onclick="closeModal();addVisitFor('${esc(pid)}')">+ Visit</button><button class="btn btn-success" onclick="closeModal();addRxFor('${esc(pid)}')">+ Rx</button><button class="btn btn-secondary" onclick="closeModal();addApptFor('${esc(pid)}')">+ Appt</button><button class="btn btn-secondary" onclick="closeModal();addToQueue('${esc(pid)}')">🪑</button>`);
}
async function editPatient(pid) {
  const p = await api('GET', `/api/patients/${pid}`);
  if (!p) return;
  showModal('Edit Patient', `<div class="form-row"><div class="form-group"><label>First Name</label><input id="p-fname" value="${esc(p.first_name||'')}"></div><div class="form-group"><label>Last Name</label><input id="p-lname" value="${esc(p.last_name||'')}"></div></div><div class="form-row"><div class="form-group"><label>Phone</label><input id="p-phone" value="${esc(p.phone||'')}"></div><div class="form-group"><label>Age</label><input id="p-age" type="number" value="${p.age||''}"></div></div><div class="form-group"><label>File Location</label><input id="p-file" value="${esc(p.file_location||'')}"></div><div class="form-group"><label>Allergies</label><input id="p-allergies" value="${esc(p.allergies||'')}"></div><div class="form-group"><label>Portal PIN</label><input id="p-pin" value="${esc(p.portal_pin||'')}" maxlength="4" placeholder="1234"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="deactivatePatient('${esc(pid)}')">Deactivate</button><button class="btn btn-primary" onclick="saveEditPatient('${esc(pid)}')">Save</button>`);
}
async function deactivatePatient(pid) {
  if (!confirm('Deactivate this patient? They will be hidden from the active list but records are preserved.')) return;
  await api('DELETE', `/api/patients/${pid}`);
  closeModal(); toast('Patient deactivated', 'success'); renderPage('patients');
}
async function saveEditPatient(pid) {
  const p = { first_name:$('#p-fname').value.trim(), last_name:$('#p-lname').value.trim(), phone:$('#p-phone').value.trim(), age:parseInt($('#p-age').value)||0, file_location:$('#p-file').value.trim(), allergies:$('#p-allergies').value.trim(), portal_pin:$('#p-pin').value.trim() };
  await api('PUT', `/api/patients/${pid}`, p); closeModal(); toast('Updated','success'); renderPage('patients');
}

// ═══════════ VISITS, RX, APPOINTMENTS (modals) ═══════════
function addVisitFor(pid) { showModal('Add Visit', `<div class="form-group"><label>Diagnosis</label><textarea id="v-diag" rows="3"></textarea></div><div class="form-group"><label>Doctor</label><input id="v-doc"></div><div class="form-group"><label>Notes</label><textarea id="v-notes" rows="2"></textarea></div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveVisit('${esc(pid)}')">Save</button>`); }
async function saveVisit(pid) { await api('POST', '/api/visits', { patient_id:pid, diagnosis:$('#v-diag').value.trim(), doctor:$('#v-doc').value.trim(), notes:$('#v-notes').value.trim() }); closeModal(); toast('Visit recorded','success'); }

function addRxFor(pid) { showModal('Add Prescription', `<div class="form-group"><label>Drug Name</label><input id="rx-drug"></div><div class="form-row"><div class="form-group"><label>Dosage</label><input id="rx-dose"></div><div class="form-group"><label>Duration</label><input id="rx-dur"></div></div><div class="form-row"><div class="form-group"><label>Qty</label><input id="rx-qty" type="number" value="1"></div><div class="form-group"><label>Price (₦)</label><input id="rx-price" type="number" value="0"></div></div><div class="form-group"><label><input type="checkbox" id="rx-paid"> Paid</label></div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveRx('${esc(pid)}')">Save</button>`); }
async function saveRx(pid) { const rx={patient_id:pid,drug_name:$('#rx-drug').value.trim(),dosage:$('#rx-dose').value.trim(),duration:$('#rx-dur').value.trim(),quantity:parseInt($('#rx-qty').value)||1,price:parseFloat($('#rx-price').value)||0,paid:$('#rx-paid').checked}; if(!rx.drug_name){toast('Drug required','error');return;} await api('POST','/api/prescriptions',rx); closeModal(); toast('Saved','success'); }

function addApptFor(pid) { const tmr=new Date(Date.now()+86400000).toISOString().slice(0,10); showModal('Book Appointment', `<div class="form-row"><div class="form-group"><label>Date</label><input id="a-date" type="date" value="${tmr}"></div><div class="form-group"><label>Time</label><input id="a-time" type="time" value="09:00"></div></div><div class="form-group"><label>Doctor</label><input id="a-doc"></div><div class="form-group"><label>Reason</label><input id="a-reason"></div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveAppt('${esc(pid)}')">Book</button>`); }
async function saveAppt(pid) { await api('POST','/api/appointments',{patient_id:pid,date:$('#a-date').value,time:$('#a-time').value,doctor:$('#a-doc').value.trim(),reason:$('#a-reason').value.trim()}); closeModal(); toast('Booked','success'); }

function addToQueue(pid) { showModal('Add to Queue', `<div class="form-group"><label>Priority</label><select id="q-pri"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div><div class="form-group"><label>Reason</label><input id="q-reason"></div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveQueue('${esc(pid)}')">Add</button>`); }
async function saveQueue(pid) { const r=await api('POST','/api/queue',{patient_id:pid,priority:$('#q-pri').value,reason:$('#q-reason').value.trim()}); if(r.ok){closeModal();toast(`Queue #${r.queue_number}`,'success');}else toast(r.error,'error'); }

// ═══════════ APPOINTMENTS PAGE ═══════════
async function renderAppointments(c) {
  const today = new Date().toISOString().slice(0,10);
  const appts = await api('GET', `/api/appointments?date=${today}`);
  c.innerHTML = `<div class="toolbar"><h3 style="font-size:16px">📅 Appointments</h3><input type="date" id="appt-date" value="${today}" onchange="loadAppts(this.value)" style="padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px"></div>
  <div class="panel"><div class="panel-body" style="padding:12px" id="appts-list">${renderApptList(appts)}</div></div>`;
}
function renderApptList(appts) {
  if (!appts||appts.length===0) return '<div class="empty"><p>No appointments</p></div>';
  return appts.map(a=>`<div class="appt-card"><div class="appt-time">${esc(a.time)}</div><div class="appt-info"><div class="name">${esc(a.first_name)} ${esc(a.last_name)}</div><div class="detail">📁 ${esc(a.file_location)||'—'} · ${esc(a.reason)||'—'}</div></div><div class="appt-actions"><span class="badge badge-${a.status==='completed'?'success':a.status==='no_show'?'danger':'info'}">${a.status}</span>${a.status==='scheduled'?`<button class="btn btn-sm btn-success" onclick="markDone(${a.id})">✓</button><button class="btn btn-sm btn-danger" onclick="markNoShow(${a.id})">✗</button>`:''}</div></div>`).join('');
}
async function loadAppts(date) { const appts=await api('GET',`/api/appointments?date=${date}`); const el=$('#appts-list'); if(el)el.innerHTML=renderApptList(appts); }
async function markDone(id) { await api('PUT',`/api/appointments/${id}/done`); renderPage('appointments'); toast('Done','success'); }
async function markNoShow(id) { await api('PUT',`/api/appointments/${id}/noshow`); renderPage('appointments'); toast('No-show','warning'); }

// ═══════════ PRESCRIPTIONS ═══════════
async function renderPrescriptions(c) {
  const unpaid = await api('GET','/api/prescriptions-unpaid');
  c.innerHTML = `<div class="toolbar"><h3>💊 Prescriptions</h3><select onchange="loadRx(this.value)" style="padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px"><option value="unpaid">Unpaid (${unpaid.length})</option><option value="all">All</option></select></div>
  <div class="panel"><div class="panel-body" style="padding:0;overflow-x:auto"><table><thead><tr><th>Patient</th><th>Drug</th><th>Price</th><th>Status</th><th>Action</th></tr></thead><tbody id="rx-tbody">${renderRxRows(unpaid)}</tbody></table></div></div>`;
}
function renderRxRows(list) { if(!list||!list.length) return '<tr><td colspan="5"><div class="empty">No prescriptions</div></td></tr>'; return list.map(r=>`<tr><td><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong></td><td>${esc(r.drug_name)}<br><span style="font-size:10px;color:var(--dim)">${esc(r.dosage)||''}</span></td><td>₦${r.price}</td><td><span class="badge ${r.paid?'badge-success':'badge-danger'}">${r.paid?'Paid':'Unpaid'}</span></td><td>${r.paid?'':`<button class="btn btn-sm btn-success" onclick="markPaid(${r.id})">✓</button>`}</td></tr>`).join(''); }
async function loadRx(filter) { const list=await api('GET',filter==='all'?'/api/prescriptions-all':'/api/prescriptions-unpaid'); const tbody=$('#rx-tbody'); if(tbody)tbody.innerHTML=renderRxRows(list); }
async function markPaid(id) { await api('PUT',`/api/prescriptions/${id}`,{paid:1}); toast('Paid','success'); renderPage('prescriptions'); }

// ═══════════ QUEUE ═══════════
async function renderQueue(c) {
  const queue = await api('GET','/api/queue');
  const stats = await api('GET','/api/queue/stats');
  const waiting=queue.filter(q=>q.status==='waiting'), inProg=queue.filter(q=>q.status==='in_progress');
  c.innerHTML = `<div class="toolbar"><h3>🪑 Queue</h3><button class="btn btn-primary" onclick="callNext()">📢 Call Next</button></div>
  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)"><div class="stat-card"><div class="stat-icon orange">⏳</div><div class="stat-info"><h4>${stats.waiting}</h4><p>Waiting</p></div></div><div class="stat-card"><div class="stat-icon blue">🔄</div><div class="stat-info"><h4>${stats.inProgress}</h4><p>In Progress</p></div></div><div class="stat-card"><div class="stat-icon green">✅</div><div class="stat-info"><h4>${stats.completed}</h4><p>Done</p></div></div></div>
  ${inProg.length?`<div class="panel"><div class="panel-header"><h3>Currently Seeing</h3></div><div class="panel-body">${inProg.map(q=>`<div class="appt-card"><div class="appt-time">#${q.queue_number}</div><div class="appt-info"><div class="name">${esc(q.first_name)} ${esc(q.last_name)}</div></div><button class="btn btn-sm btn-success" onclick="completeQueue(${q.id})">✓ Done</button></div>`).join('')}</div></div>`:''}
  <div class="panel"><div class="panel-header"><h3>Waiting (${waiting.length})</h3></div><div class="panel-body">${waiting.length===0?'<div class="empty">Queue empty</div>':waiting.map(q=>`<div class="appt-card"><div class="appt-time">#${q.queue_number}</div><div class="appt-info"><div class="name">${esc(q.first_name)} ${esc(q.last_name)} <span class="badge ${q.priority==='urgent'?'badge-danger':'badge-info'}">${q.priority}</span></div><div class="detail">${esc(q.reason)||'—'}</div></div></div>`).join('')}</div></div>`;
}
async function callNext() { const r=await api('POST','/api/queue/callnext'); if(r.ok){toast(`Calling: ${r.patient.first_name} #${r.patient.queue_number}`,'success');renderPage('queue');}else toast(r.error,'warning'); }
async function completeQueue(id) { await api('PUT',`/api/queue/${id}/complete`); toast('Done','success'); renderPage('queue'); }

// ═══════════ BILLING ═══════════
async function renderBilling(c) {
  const invoices = await api('GET','/api/invoices/unpaid');
  c.innerHTML = `<div class="toolbar"><h3>💰 Billing</h3><button class="btn btn-primary" onclick="showCreateInvoice()">+ Invoice</button></div>
  <div class="panel"><div class="panel-body" style="padding:0;overflow-x:auto"><table><thead><tr><th>Invoice</th><th>Patient</th><th>Total</th><th>Paid</th><th>Status</th><th>Action</th></tr></thead><tbody>${invoices.length===0?'<tr><td colspan="6"><div class="empty">No unpaid invoices</div></td></tr>':invoices.map(i=>`<tr><td>${esc(i.invoice_no)}</td><td>${esc(i.first_name)} ${esc(i.last_name)}</td><td>₦${Number(i.total).toLocaleString()}</td><td>₦${Number(i.amount_paid).toLocaleString()}</td><td><span class="badge badge-warning">${i.status}</span></td><td><button class="btn btn-sm btn-success" onclick="payInvoice('${esc(i.invoice_no)}',${i.total-i.amount_paid})">Pay</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
function showCreateInvoice() { showModal('Create Invoice', `<div class="form-group"><label>Patient ID</label><input id="inv-pid" placeholder="PT-00001"></div><div class="form-group"><label>Item</label><input id="inv-item"></div><div class="form-group"><label>Amount (₦)</label><input id="inv-amt" type="number" value="0"></div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveInvoice()">Create</button>`); }
async function saveInvoice() { const pid=$('#inv-pid').value.trim(),item=$('#inv-item').value.trim(),amt=parseFloat($('#inv-amt').value)||0; if(!pid){toast('Patient ID required','error');return;} const r=await api('POST','/api/invoices',{patient_id:pid,items:[{name:item,amount:amt}],subtotal:amt,discount:0,total:amt,amount_paid:0}); if(r.ok){closeModal();toast(`Invoice: ${r.invoice_no}`,'success');renderPage('billing');}else toast(r.error,'error'); }
async function payInvoice(no,bal) { showModal('Pay Invoice', `<div class="form-group"><label>Balance: ₦${bal.toLocaleString()}</label><input id="pay-amt" type="number" value="${bal}"></div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="confirmPay('${no}')">Pay</button>`); }
async function confirmPay(no) { const amt=parseFloat($('#pay-amt').value)||0; const r=await api('POST',`/api/invoices/${no}/pay`,{amount:amt}); if(r.ok){closeModal();toast('Payment recorded','success');renderPage('billing');}else toast(r.error,'error'); }

// ═══════════ LAB ═══════════
async function renderLab(c) {
  const pending = await api('GET','/api/lab/pending');
  c.innerHTML = `<div class="toolbar"><h3>🧪 Lab Results</h3><span class="badge badge-warning">${pending.length} pending</span></div>
  <div class="panel"><div class="panel-body" style="padding:0;overflow-x:auto"><table><thead><tr><th>Patient</th><th>Test</th><th>Date</th><th>Action</th></tr></thead><tbody>${pending.length===0?'<tr><td colspan="4"><div class="empty">No pending labs</div></td></tr>':pending.map(l=>`<tr><td>${esc(l.first_name)} ${esc(l.last_name)}</td><td>${esc(l.test_name)}</td><td style="font-size:11px">${l.ordered_at?l.ordered_at.split(' ')[0]:''}</td><td><button class="btn btn-sm btn-primary" onclick="enterLabResult(${l.id})">Enter</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
function enterLabResult(id) { showModal('Enter Result', `<div class="form-group"><label>Result</label><textarea id="lab-res" rows="3"></textarea></div><div class="form-group"><label>Status</label><select id="lab-st"><option value="received">Normal</option><option value="abnormal">Abnormal</option></select></div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveLabResult(${id})">Save</button>`); }
async function saveLabResult(id) { await api('PUT',`/api/lab/${id}`,{result:$('#lab-res').value.trim(),status:$('#lab-st').value}); closeModal(); toast('Saved','success'); renderPage('lab'); }

// ═══════════ AUDIT, USERS, SETTINGS, REPORTS ═══════════
async function renderAudit(c) { const logs=await api('GET','/api/audit'); c.innerHTML=`<h3 style="margin-bottom:16px">📋 Audit Log</h3><div class="panel"><div class="panel-body" style="padding:0;overflow-x:auto"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>${logs.map(l=>`<tr><td style="font-size:10px">${l.timestamp||''}</td><td>${esc(l.user)}</td><td><span class="badge badge-info">${esc(l.action)}</span></td><td>${esc(l.entity)} ${esc(l.entity_id)}</td><td style="font-size:11px;color:var(--dim)">${esc(l.details)}</td></tr>`).join('')}</tbody></table></div></div>`; }

async function renderUsers(c) { const users=await api('GET','/api/users'); c.innerHTML=`<div class="toolbar"><h3>👥 Users</h3><button class="btn btn-primary" onclick="showAddUser()">+ Add</button></div><div class="panel"><div class="panel-body" style="padding:0;overflow-x:auto"><table><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th></tr></thead><tbody>${users.map(u=>`<tr><td><strong>${esc(u.username)}</strong></td><td>${esc(u.full_name)}</td><td><span class="badge badge-info">${u.role}</span></td><td>${u.active?'<span class="badge badge-success">Active</span>':'<span class="badge badge-danger">Inactive</span>'}</td></tr>`).join('')}</tbody></table></div></div>`; }
function showAddUser() { showModal('Add User', `<div class="form-group"><label>Username</label><input id="u-name"></div><div class="form-group"><label>Full Name</label><input id="u-full"></div><div class="form-group"><label>Password</label><input id="u-pass" type="password" value="pass123"></div><div class="form-group"><label>Role</label><select id="u-role"><option value="receptionist">Receptionist</option><option value="doctor">Doctor</option><option value="admin">Admin</option></select></div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveUser()">Create</button>`); }
async function saveUser() { await api('POST','/api/users',{username:$('#u-name').value.trim(),full_name:$('#u-full').value.trim(),password:$('#u-pass').value,role:$('#u-role').value}); closeModal(); toast('User created','success'); renderPage('users'); }

async function renderSettings(c) { 
  const syncStatus = await api('GET', '/api/sync/status');
  c.innerHTML=`<div class="panel" style="max-width:400px"><div class="panel-header"><h3>⚙️ Settings</h3></div><div class="panel-body"><div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:16px"><h4 style="font-size:12px;color:var(--dim);margin-bottom:8px">🔄 Sync Status</h4><div style="font-size:12px"><span class="badge ${syncStatus.online?'badge-success':'badge-danger'}">${syncStatus.online?'Online':'Offline'}</span> · Role: ${syncStatus.role} · Pending: ${syncStatus.pendingChanges}<br><span style="font-size:10px;color:var(--dim)">Last sync: ${syncStatus.lastSync||'Never'}</span></div><button class="btn btn-sm btn-primary" style="margin-top:8px" onclick="pushAllToCloud()">⬆ Push All to Cloud</button></div><h4 style="font-size:13px;margin-bottom:10px">Change Password</h4><div class="form-group"><label>Current Password</label><input id="s-old" type="password"></div><div class="form-group"><label>New Password</label><input id="s-new" type="password"></div><button class="btn btn-primary" onclick="changePw()">Update</button></div></div>`; }
async function changePw() { const r=await api('POST','/api/change-password',{oldPassword:$('#s-old').value,newPassword:$('#s-new').value}); if(r.ok)toast('Password changed','success'); else toast(r.error,'error'); }
async function pushAllToCloud() {
  toast('Pushing all data to cloud...','info');
  const r = await api('POST', '/api/sync/push-all');
  if (r.ok) toast(`Pushed ${r.pushed} records to cloud`,'success');
  else toast(r.error || 'Push failed','error');
}

async function renderReports(c) { c.innerHTML=`<div class="panel"><div class="panel-header"><h3>📈 Reports</h3></div><div class="panel-body"><p style="color:var(--dim)">Reports are available on the desktop version. Use the backup feature to sync data.</p></div></div>`; }

// ═══════════ INIT ═══════════
document.addEventListener('DOMContentLoaded', async () => {
  const user = await api('GET', '/api/me');
  if (user) { App.user = user; showApp(); }
  else { $('#login-screen').classList.remove('hidden'); }

  $('#login-btn').addEventListener('click', doLogin);
  $('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#logout-btn').addEventListener('click', doLogout);
  $('#menu-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
    $('#sidebar-overlay').classList.toggle('show');
  });
  $('#sidebar-overlay').addEventListener('click', closeSidebar);
  $('#modal-overlay').addEventListener('click', e => { if (e.target === $('#modal-overlay')) closeModal(); });
});
