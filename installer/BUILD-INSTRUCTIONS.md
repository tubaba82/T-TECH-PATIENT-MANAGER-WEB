# How to Build the Installer

## Prerequisites

1. **Inno Setup 6** — Download free from: https://jrsoftware.org/isdl.php
2. **Node.js portable** — Download from: https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip

## Steps

### Step 1: Get Node.js portable
1. Download: https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip
2. Extract the ZIP
3. Copy the extracted folder contents into: `installer\node\`
   - You should have: `installer\node\node.exe`, `installer\node\npm.cmd`, etc.

### Step 2: Create the logo.ico
1. Convert your `public\logo.png` to `.ico` format
2. Use: https://convertio.co/png-ico/ (free online)
3. Save as: `public\logo.ico`

### Step 3: Install node_modules
Make sure dependencies are installed:
```
cd T-TECH-PATIENT-MANAGER-WEB
npm install
```

### Step 4: Compile the installer
1. Open Inno Setup
2. Open file: `installer\setup.iss`
3. Click Build → Compile (or press Ctrl+F9)
4. Output: `dist\Allahu-Jallah-Clinic-Setup-v1.2.0.exe`

### Step 5: Deliver to client
Copy the `.exe` to a USB drive. Client double-clicks it:
- Install → Next → Next → Finish
- Desktop shortcut appears with clinic logo
- Double-click shortcut → browser opens with the app

## What the installer includes:
- Node.js runtime (no separate install needed)
- All app files + dependencies
- Desktop + Start Menu shortcuts
- Auto-launches after install

## Size estimate: ~35-45 MB
