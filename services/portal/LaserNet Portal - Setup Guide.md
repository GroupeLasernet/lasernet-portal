# LaserNet Portal — New Computer Setup Guide

**For Hugo — DSM Design Sur Mesure / LaserNet**
Last updated: April 7, 2026

---

## What You Need to Install

### 1. Node.js (Required)
Node.js is the engine that runs your portal. It includes `npm` (the package manager).

- **Download:** https://nodejs.org
- Click the **LTS** version (green button)
- Run the installer, click "Next" through all steps
- **Verify it works:** Open a terminal and type `node --version` — you should see a version number

### 2. Git (Required)
Git tracks your code changes and connects to GitHub.

- **Download:** https://git-scm.com/downloads
- Run the installer with default settings
- **Verify it works:** Open a terminal and type `git --version`

### 3. GitHub Account (Required)
GitHub stores your code online so it can be deployed.

- **Website:** https://github.com
- Your account: (fill in your username once created)

### 4. Vercel Account (Required for deployment)
Vercel hosts your portal online for free.

- **Website:** https://vercel.com
- Sign up with your GitHub account ("Continue with GitHub")

---

## How to Set Up the Portal on a New Computer

### Step 1: Install Node.js and Git (see above)

### Step 2: Clone your project from GitHub
Open a terminal (Command Prompt on Windows) and run:
```
git clone https://github.com/YOUR_USERNAME/lasernet-portal.git
cd lasernet-portal
```

### Step 3: Install dependencies
```
npm install
```

### Step 4: Create the environment file
Create a file called `.env.local` in the `lasernet-portal` folder with this content:
```
JWT_SECRET=lasernet-super-secret-key-change-me-in-production

QUICKBOOKS_CLIENT_ID=your_client_id_here
QUICKBOOKS_CLIENT_SECRET=your_client_secret_here
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/quickbooks/callback
QUICKBOOKS_ENVIRONMENT=production
```
Replace the QuickBooks values with your real credentials from https://developer.intuit.com

### Step 5: Start the portal
```
npm run dev
```
Then open http://localhost:3000 in your browser.

---

## QuickBooks API Credentials

Your QuickBooks app is managed at: https://developer.intuit.com

- **App name:** Claude AI
- **Workspace:** Sample Workspace
- To find your credentials: Dashboard → Your App → Keys and credentials
- **Redirect URI** (must be set under Settings → Redirect URIs):
  `http://localhost:3000/api/quickbooks/callback`
- For production, change `QUICKBOOKS_ENVIRONMENT` to `production` in `.env.local`

---

## Important Files to Know

| File | What it does |
|------|-------------|
| `.env.local` | Your secret credentials (never share this file!) |
| `package.json` | Lists all the software your portal needs |
| `src/app/admin/` | Admin dashboard pages |
| `src/app/portal/` | Client portal pages |
| `src/app/login/` | Login page |
| `src/lib/auth.ts` | User accounts and login logic |
| `src/lib/quickbooks.ts` | QuickBooks API connection |
| `src/lib/mock-data.ts` | Demo data (replaced by real data when QB is connected) |

---

## Demo Login Accounts (for testing)

| Role   | Email               | Password   |
|--------|---------------------|------------|
| Admin  | admin@lasernet.ca   | admin123   |
| Client | client@example.com  | client123  |
| Client | marie@designco.ca   | client123  |

---

## Common Terminal Commands

| Command | What it does |
|---------|-------------|
| `npm install` | Install all project dependencies (run once after cloning) |
| `npm run dev` | Start the portal locally (http://localhost:3000) |
| `npm run build` | Build for production |
| `Ctrl + C` | Stop the running server |
| `git pull` | Download latest code changes from GitHub |
| `git add .` | Stage all changes for commit |
| `git commit -m "description"` | Save changes locally |
| `git push` | Upload changes to GitHub (Vercel auto-deploys) |

---

## Troubleshooting

**"npm is not recognized"** → Node.js is not installed. Download from https://nodejs.org

**"git is not recognized"** → Git is not installed. Download from https://git-scm.com

**Build error in browser** → Stop server (Ctrl+C), then run `npm run dev` again

**QuickBooks shows demo data** → Make sure `.env.local` has your real credentials and `QUICKBOOKS_ENVIRONMENT=production`

**Forgot credentials** → Go to https://developer.intuit.com → Dashboard → Your App → Keys and credentials

---

## Tech Stack Reference

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | v22+ | JavaScript runtime |
| Next.js | 14.x | Web framework |
| React | 18.x | UI library |
| Tailwind CSS | 3.x | Styling |
| TypeScript | 5.x | Type-safe JavaScript |
| jose | 5.x | JWT authentication |
| intuit-oauth | 4.x | QuickBooks connection |
