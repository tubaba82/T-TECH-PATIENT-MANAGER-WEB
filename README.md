# Allahu Jallah Spiritual Clinic — Web App v1.1.0

## Patient Management System (Web Version)

Access from any device — PC, phone, tablet — anywhere in the world.

---

## Quick Start (Local)

```bash
cd T-TECH-PATIENT-MANAGER-WEB
npm install
npm start
```

Open: **http://localhost:3000** | Login: **admin** / **admin**

---

## Deploy to Cloud (Access from Anywhere)

### Option A: Render.com (Free, Recommended)

1. Create a GitHub account if you don't have one: https://github.com
2. Create a new repository and push this folder:
   ```bash
   cd T-TECH-PATIENT-MANAGER-WEB
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR-USERNAME/allahu-jallah-clinic.git
   git push -u origin main
   ```
3. Go to https://render.com and sign up (free) with your GitHub account
4. Click **New → Web Service**
5. Connect your GitHub repository
6. Settings:
   - **Name:** allahu-jallah-clinic
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
7. Under **Environment → Add Disk:**
   - **Name:** clinic-data
   - **Mount Path:** /opt/render/project/data
   - **Size:** 1 GB
8. Add Environment Variable:
   - **Key:** `DATA_DIR` → **Value:** `/opt/render/project/data`
   - **Key:** `SESSION_SECRET` → **Value:** (any random string)
9. Click **Create Web Service**
10. Wait 2-3 minutes for deployment
11. Your app is live at: `https://allahu-jallah-clinic.onrender.com`

Share this URL with the client — works on phone, tablet, or PC.

### Option B: Railway.app (Free, Auto-deploys)

1. Push to GitHub (same as above)
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Select your repo → Deploy
4. Add a volume for data persistence
5. Set environment variable: `DATA_DIR=/data`

---

## Features

| Feature | Mobile | Desktop |
|---------|--------|---------|
| Patient Registration | ✅ | ✅ |
| Search Patients | ✅ | ✅ |
| Appointments | ✅ | ✅ |
| Patient Queue | ✅ | ✅ |
| Prescriptions | ✅ | ✅ |
| Billing & Invoices | ✅ | ✅ |
| Lab Results | ✅ | ✅ |
| User Management | ✅ | ✅ |
| Audit Log | ✅ | ✅ |
| Role-Based Access | ✅ | ✅ |
| PWA (Add to Home Screen) | ✅ | — |

---

## Mobile: Add to Home Screen

On your phone browser:
1. Open the URL
2. Tap the browser menu (⋮ on Android, Share on iOS)
3. Tap "Add to Home Screen"
4. Now it opens like a native app — full screen, no browser bar

---

## User Roles

| Role | Access |
|------|--------|
| **Admin** | Everything |
| **Doctor** | Patients, Queue, Appointments, Prescriptions, Lab, Reports, Settings |
| **Receptionist** | Patients, Queue, Appointments, Billing, Prescriptions (view) |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `DATA_DIR` | Database storage path | ./data |
| `SESSION_SECRET` | Session encryption key | Auto-generated |

---

## Data & Backups

- Database is stored in `DATA_DIR/clinic.db`
- On Render.com with a disk, data persists across deploys
- Download the .db file from the server for backup

---

*© T-Tech Solutions 2026*
