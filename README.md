# 🏋️ FlexFlow — Premium Gym Management System

A production-ready, full-stack gym management system with 3 separate portals for **Members**, **Trainers**, and **Admins**. Supports both **PostgreSQL** (Render, Neon, Supabase) and **MySQL/MariaDB**, optimized for instant **Vercel** serverless deployment.

---

## ✨ Features

### 👤 Member Portal (`/`)
- **Registration & Sign-in** with plan selection (1, 3, 6, 12 months)
- **Dashboard** — Current streak, daily check-in, badges, active membership banner
- **Plan & Fees** — View active plan, renew memberships, payment history with receipts
- **AI Workout Recommendations** — Analyzes attendance, streak & level → Beginner / Intermediate / Advanced
- **Diet Suggestion** — Dynamic macro calculator with Indian meal plans (veg / non-veg)
- **Progress Tracking** — Weight log with interactive Chart.js graphs
- **Expiry Reminder** — Visual alerts 7 days before expiry
- **Badges System** — 30-day and 90-day streak achievements 🏅

### 🏋️ Trainer Portal (`/` — role-based access)
- **My Members** — List of assigned clients, fitness goals, attendance stats
- **Progress View** — Weight trend chart for each client

### 🔐 Admin Portal (`/admin`)
- **Dashboard** — Real-time revenue, active members, daily check-ins, expiring memberships
- **Member Management** — Add new members, assign trainers, delete accounts
- **Trainer Management** — Add trainers, assign specializations
- **Payments & Billing** — Record offline/manual payments, settle pending dues
- **Attendance Tracking** — View daily attendance logs, manual check-in

---

## ☁️ Deployment Guide

### Option A: Render PostgreSQL + Vercel (Recommended)

#### Step 1: Deploy PostgreSQL Database on Render
1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** > **PostgreSQL**.
2. Set the details:
   - **Name**: `flexflow-db`
   - **Database**: `flexflow`
   - **User**: `flexflow_user`
   - **Region**: Choose the closest region (e.g. Oregon, Frankfurt, Singapore)
   - **Plan**: **Free**
3. Click **Create Database**.
4. Once created, scroll down to the **Connections** section and copy the **External Database URL**:
   ```
   postgresql://flexflow_user:PASSWORD@dpg-xxxxx.render.com/flexflow
   ```
   *(Note: Schema, tables, and default plans will be initialized automatically on the first serverless request! You can also optionally run `database/schema.postgres.sql` in Render's "Connect" > "PSQL Command")*

---

#### Step 2: Deploy Web App on Vercel
1. Push your latest code to GitHub:
   ```bash
   git add .
   git commit -m "feat: postgresql support and vercel config"
   git push origin main
   ```
2. Go to [Vercel Dashboard](https://vercel.com/) and click **Add New...** > **Project**.
3. Import your GitHub repository (`flexflow`).
4. In the **Environment Variables** section, add:
   | Key | Value | Description |
   |-----|-------|-------------|
   | `DATABASE_URL` | `postgresql://...` | Render External Database URL |
   | `JWT_SECRET` | `your-secure-random-string-min-24-chars` | Auth secret key |
   | `ADMIN_EMAIL` | `admin@flexflow.com` | First admin email |
   | `ADMIN_PASSWORD` | `Admin@123456` | First admin password |
   | `ANTHROPIC_API_KEY` | *(Optional)* | For AI coach recommendations |
5. Click **Deploy**.
6. When the deployment completes, visit your Vercel URL:
   - **Member & Trainer Portal**: `https://your-app.vercel.app/`
   - **Admin Portal**: `https://your-app.vercel.app/admin`

---

### Option B: Deploy Everything on Render (Web Service + DB Blueprint)

1. Fork or push this repository to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** > **Blueprint**.
3. Connect your repository. Render will automatically read `render.yaml`, provision the Free PostgreSQL database, and build the Node.js web service with all environment variables pre-configured.

---

## 💻 Local Development

### Prerequisites
- Node.js v18+
- PostgreSQL or MySQL (XAMPP on Windows)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` for your local database:
```env
PORT=3000
# For PostgreSQL:
DATABASE_URL=postgresql://postgres:password@localhost:5432/flexflow

# OR for MySQL:
# DB_HOST=localhost
# DB_USER=root
# DB_PASSWORD=
# DB_NAME=flexflow

JWT_SECRET=super-secret-jwt-key-min-24-characters
ADMIN_EMAIL=admin@flexflow.com
ADMIN_PASSWORD=Admin@123456
```

### 3. Start the Server
```bash
# Auto-reloads on file changes:
npm run dev

# Or standard start:
npm start
```

Open [http://localhost:3000](http://localhost:3000) for the member app, or [http://localhost:3000/admin](http://localhost:3000/admin) for admin login.

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, Tailwind CSS, Vanilla JS, Chart.js 4.x |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (Render / Neon / Supabase) & MySQL 8.0+ |
| DB Drivers | `pg` (node-postgres), `mysql2` |
| Auth & Security | JWT, bcryptjs, Helmet, express-rate-limit |
| Cloud Hosting | Vercel (Serverless Functions) / Render |
| AI Integration | Anthropic Claude API (optional) |

---

## 🗂️ Project Structure

```
flexflow/
├── api/
│   └── index.js             # Vercel serverless entrypoint
├── database/
│   ├── schema.postgres.sql  # PostgreSQL schema (Render / Supabase / Neon)
│   └── schema.sql           # MySQL schema
├── public/
│   ├── index.html           # Member + Trainer SPA root
│   ├── app.js               # Member + Trainer client application
│   ├── admin.html           # Admin portal SPA root
│   └── admin.js             # Admin client application
├── db.js                    # Universal DB adapter (PostgreSQL + MySQL)
├── server.js                # Express API application & endpoints
├── render.yaml              # Render blueprint deployment spec
├── vercel.json              # Vercel build & route rules
├── package.json
├── .env.example
└── README.md
```

---

## 📄 Default Credentials

- **Admin Portal**: `/admin`
- **Email**: `admin@flexflow.com`
- **Password**: `Admin@123456`

---

## 📄 License

MIT License — Built for FlexFlow Gym.
