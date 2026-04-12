# LaserNet Client & Admin Portal

A Next.js web application with role-based access for LaserNet's clients and administrators.

## Features

### Admin Portal (`/admin`)
- **Dashboard** — Overview of clients, revenue, invoices, and quotes
- **Client Management** — Add, edit, and view client info including addresses, phone, email
- **File Management** — Upload and manage documents and videos shared with clients

### Client Portal (`/portal`)
- **Dashboard** — Quick overview of videos, files, invoices, and balance due
- **Videos** — Watch embedded YouTube/Vimeo tutorials and training videos
- **Files** — Download documents shared by LaserNet
- **Invoices & Quotes** — View detailed invoices and quotes (from QuickBooks)

### Authentication
- Email/password login
- JWT-based session tokens (8-hour expiry)
- Role-based routing (admins → `/admin`, clients → `/portal`)
- Protected routes with middleware

---

## Quick Start

### 1. Install Dependencies
```bash
cd lasernet-portal
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Open in Browser
Go to **http://localhost:3000**

### Demo Accounts
| Role   | Email               | Password   |
|--------|---------------------|------------|
| Admin  | admin@lasernet.ca   | admin123   |
| Client | client@example.com  | client123  |
| Client | marie@designco.ca   | client123  |

---

## Project Structure

```
lasernet-portal/
├── src/
│   ├── app/
│   │   ├── login/           # Login page
│   │   ├── admin/           # Admin dashboard, clients, files
│   │   ├── portal/          # Client dashboard, videos, files, invoices
│   │   ├── api/auth/        # Login/logout/session API routes
│   │   ├── layout.tsx       # Root layout
│   │   └── globals.css      # Tailwind CSS + custom styles
│   ├── components/          # Shared components (Sidebar, DashboardShell)
│   ├── lib/
│   │   ├── auth.ts          # Authentication logic + mock user database
│   │   └── mock-data.ts     # Demo data (videos, files, invoices, quotes)
│   └── middleware.ts        # Route protection middleware
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Next Steps for Production

### 1. Database Setup
Replace the mock data in `src/lib/auth.ts` and `src/lib/mock-data.ts` with a real database. Recommended options:
- **PostgreSQL** with Prisma ORM (best for structured data like clients, invoices)
- **MongoDB** with Mongoose (flexible document storage)
- **Supabase** (PostgreSQL with built-in auth — easiest to set up)

### 2. QuickBooks Integration
To pull real invoices and quotes from QuickBooks:
1. Register your app at https://developer.intuit.com
2. Get your Client ID and Client Secret
3. Add them to `.env.local`
4. Use the QuickBooks Online API to fetch invoices/estimates

### 3. Deployment
Deploy to **Vercel** (recommended for Next.js):
1. Push code to GitHub
2. Go to https://vercel.com and import the repo
3. Add environment variables
4. Deploy — your site will be live in minutes!

### 4. Custom Domain
Point your domain (e.g., portal.lasernet.ca) to Vercel in your DNS settings.
