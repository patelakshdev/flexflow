# 🏋️ FlexFlow — Premium Gym Management System

A production-ready, full-stack gym management system with 3 separate portals for **Members**, **Trainers**, and **Admins**.

---

## ✨ Features

### 👤 Member Portal (`/`)
- **Registration** with plan selection (1, 3, 6, 12 months)
- **Dashboard** — streak, check-in, badges, membership status
- **Plan & Fees** — view/change plan, payment history
- **AI Workout Recommend** — analyzes attendance, streak & declared level → beginner/intermediate/advanced
- **Diet Suggestion** — macro calculator with Indian meal plans (veg/non-veg)
- **Progress Tracking** — weight log with chart
- **Membership Expire Reminder** banners
- **30-day & 90-day streak badges** 🏅

### 🏋️ Trainer Portal (`/` — same URL, role-based)
- **My Members** — list, goal, sessions/30 days, weight
- **Progress View** — weight chart per member

### 🔐 Admin Portal (`/admin`)
- **Dashboard** — Revenue, active members, today's check-ins, expiring soon
- **Members** — Add, delete, assign trainer, search/filter
- **Trainers** — Add, delete
- **Payments** — Record, settle pending dues
- **Membership Management** — Plan overview, active/expired lists
- **Attendance** — Daily log, manual check-in

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** v18+ 
- **MySQL / MariaDB** (XAMPP recommended on Windows)
- **XAMPP** (for MySQL on Windows)

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
Copy `.env.example` to `.env` and update values:
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=flexflow
JWT_SECRET=your-super-secret-jwt-key-min-24-chars
ADMIN_EMAIL=admin@flexflow.com
ADMIN_PASSWORD=YourAdminPassword123
# Optional AI coach notes:
ANTHROPIC_API_KEY=
```

### 4. Start MySQL (XAMPP on Windows)
Open XAMPP Control Panel and start **MySQL**, OR run:
```powershell
Start-Job { & "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone }
```

### 5. Create Database & Run Schema
```powershell
# In PowerShell with XAMPP MySQL in PATH
$env:PATH += ";C:\xampp\mysql\bin"
mysql -u root -e "CREATE DATABASE IF NOT EXISTS flexflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
Get-Content "database\schema.sql" -Raw | mysql -u root flexflow
```

Or via phpMyAdmin:
1. Open http://localhost/phpmyadmin
2. Create database `flexflow`
3. Import `database/schema.sql`

### 6. Start the Server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 7. Open the App
| Portal | URL |
|--------|-----|
| Member / Trainer | http://localhost:3000 |
| Admin | http://localhost:3000/admin |

**Default admin credentials:**
- Email: `admin@flexflow.com`  
- Password: `Admin@123456` (change after first login!)

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, Tailwind CSS (CDN), Vanilla JS |
| Charts | Chart.js 4.x |
| Backend | Node.js + Express |
| Database | MySQL / MariaDB |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Security | Helmet, express-rate-limit |
| AI (optional) | Claude API (Anthropic) |

---

## 🗂️ Project Structure

```
flexflow/
├── public/
│   ├── index.html      # Member + Trainer portal
│   ├── app.js          # Member + Trainer frontend JS
│   ├── admin.html      # Admin portal
│   └── admin.js        # Admin frontend JS
├── database/
│   └── schema.sql      # MySQL schema + seed data
├── server.js           # Express API server
├── package.json
├── .env                # Environment config (not committed)
└── .env.example        # Template
```

---

## 🤖 AI Features

The **Workout Recommend** system uses a built-in scoring engine:

| Factor | Weight |
|--------|--------|
| Sessions in last 30 days | 40 pts |
| Time training (tenure) | 25 pts |
| Current streak | 15 pts |
| Self-reported level | 20 pts |

**Score mapping:** 0–29 → Beginner | 30–64 → Intermediate | 65+ → Advanced

**Optional Claude API:** If `ANTHROPIC_API_KEY` is set, a personalized coach note is generated daily per member (stats only — no PII sent).

---

## 🔒 Security Notes

- JWT tokens expire in 7 days
- Passwords hashed with bcrypt (10 rounds)
- Rate limiting on auth endpoints (40 req/15min)
- Helmet CSP headers
- SQL injection protection via parameterized queries
- Role-based access control (member/trainer/admin)

---

## 📱 Responsive Design

- **Desktop** — Sidebar navigation layout
- **Mobile** — Bottom tab navigation, sheet modals
- **PWA-ready** — Theme color, viewport-fit=cover, safe area insets

---

## 🏅 Streak & Badges

| Badge | Requirement |
|-------|-------------|
| 🥇 30-Day Streak | 30 consecutive daily check-ins |
| 🏆 90-Day Streak | 90 consecutive daily check-ins |

Badges are automatically awarded on check-in. Once earned, they are permanent.

---

## 💳 Membership Plans

| Plan | Duration | Price |
|------|----------|-------|
| 1 Month | 1 month | ₹1,500 |
| 3 Months | 3 months | ₹4,000 |
| 6 Months | 6 months | ₹7,000 |
| 12 Months | 12 months | ₹12,000 |

Renewals stack after the current end date.

---

## 📄 License

MIT License — Built for FlexFlow Gym.
