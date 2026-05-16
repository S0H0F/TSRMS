# 🚆 RailWay SA — Full Stack System

**Node.js + Express + MySQL + HTML/CSS/JS — AWS Ready**

---

## 📁 Project Structure

```
railway-sa/
├── backend/
│   ├── config/
│   │   ├── database.js          # MySQL connection pool
│   │   └── logger.js            # Winston logger
│   ├── database/
│   │   ├── schema.sql           # Full MySQL schema (8 tables)
│   │   ├── seed.sql             # Sample data
│   │   ├── setup.js             # DB setup script
│   │   └── seed.js              # Seed runner with bcrypt
│   ├── middleware/
│   │   ├── auth.js              # JWT authenticate + requireRole
│   │   ├── validate.js          # express-validator handler
│   │   └── errorHandler.js      # Global error handler
│   ├── routes/
│   │   ├── auth.routes.js       # Login, Nafath, refresh, logout
│   │   ├── schedules.routes.js  # Schedule CRUD + seat map
│   │   ├── bookings.routes.js   # Booking flow + QR generation
│   │   ├── users.routes.js      # User management
│   │   ├── routes.routes.js     # Route/station management
│   │   └── dashboard.routes.js  # Analytics + live occupancy
│   ├── services/
│   │   └── notification.service.js  # Email (Nodemailer) + SMS (Twilio)
│   ├── server.js                # Express app entry point
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── auth.js                  # Role guard (runs before page renders)
│   ├── login.html               # Nafath + email login
│   ├── home-admin.html          # Admin-only home
│   ├── home-staff.html          # Staff-only home
│   ├── home-passenger.html      # Passenger-only home
│   ├── booking.html             # 4-step ticket booking
│   ├── my-bookings.html         # Passenger ticket history + QR
│   ├── admin-bookings.html      # Admin/staff booking management
│   ├── schedules.html           # Schedule CRUD
│   ├── dashboard.html           # Analytics charts
│   ├── occupancy.html           # Live seat maps
│   ├── routes.html              # Route management
│   └── users.html               # User management
├── aws/
│   ├── .ebextensions/           # Elastic Beanstalk config
│   ├── rds-setup.sql            # RDS user setup
│   └── scripts/deploy.sh        # One-command deploy
├── .github/workflows/
│   └── deploy.yml               # CI/CD pipeline
├── .gitignore
└── README.md
```

---

## 🛢️ Database Schema (MySQL)

| Table | Purpose |
|---|---|
| `users` | All user accounts (admin/staff/passenger) |
| `user_permissions` | Per-user feature access flags |
| `refresh_tokens` | JWT refresh token store |
| `stations` | Train stations (RUH, JED, MKK, MED, DMM, JBL) |
| `routes` | Routes with pricing per class |
| `schedules` | Train timetables with seat tracking |
| `bookings` | Reservations with QR codes |
| `notifications` | Email/SMS log |
| `audit_logs` | Admin action history |
| `occupancy_snapshots` | Historical occupancy for analytics |
| `revenue_daily` | Daily revenue materialized view |

---

## 🔌 API Endpoints

### Auth — `/api/auth`
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/login` | Public | Email + password login |
| POST | `/nafath` | Public | Login via National ID (Nafath) |
| POST | `/refresh` | Public | Refresh JWT access token |
| POST | `/logout` | Auth | Invalidate refresh token |
| GET  | `/me` | Auth | Get current user profile |
| PUT  | `/change-password` | Auth | Update password |

### Schedules — `/api/schedules`
| Method | Endpoint | Access |
|---|---|---|
| GET | `/` | Admin, Staff |
| GET | `/:id` | Admin, Staff |
| GET | `/:id/seats` | Admin, Staff |
| POST | `/` | Admin, Staff |
| PUT | `/:id` | Admin, Staff |
| DELETE | `/:id` | Admin only |

### Bookings — `/api/bookings`
| Method | Endpoint | Access |
|---|---|---|
| GET | `/` | Admin/Staff = all · Passenger = own |
| GET | `/:ref` | Auth (own or admin) |
| GET | `/:ref/qr` | Auth (own or admin) |
| POST | `/` | Passenger |
| DELETE | `/:ref` | Auth (cancel) |

### Dashboard — `/api/dashboard`
| Method | Endpoint | Access |
|---|---|---|
| GET | `/overview` | Admin, Staff |
| GET | `/revenue-trend` | Admin |
| GET | `/route-performance` | Admin, Staff |
| GET | `/occupancy-live` | Admin, Staff |
| GET | `/top-stations` | Admin |

---

## ⚙️ Local Setup

### 1. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/railway-sa.git
cd railway-sa
cd backend && npm install
```

### 2. Configure Environment
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your MySQL credentials
```

### 3. Setup Database
```bash
# Create schema
npm run db:setup

# Insert sample data
npm run db:seed
```

### 4. Run Development Server
```bash
npm run dev
# API: http://localhost:5000
# Frontend: Open frontend/login.html with Live Server
```

### Demo Credentials
| Role | Email | Password |
|---|---|---|
| Admin | admin@railwaysa.com | admin123 |
| Staff | staff@railwaysa.com | staff123 |
| Passenger | user@railwaysa.com | pass123 |

---

## ☁️ AWS Deployment

### Required AWS Services
- **Elastic Beanstalk** — Node.js application hosting
- **RDS (MySQL 8.0)** — Managed database
- **S3** — Static assets + deployment packages
- **CloudWatch** — Logs and monitoring
- **ACM** — SSL certificate

### Step-by-Step AWS Setup

#### 1. Create RDS Instance
```
Engine:    MySQL 8.0
Instance:  db.t3.micro (dev) / db.t3.medium (prod)
Storage:   20 GB GP3
Multi-AZ:  Yes (production)
```

#### 2. Configure RDS
```bash
mysql -h YOUR_RDS_ENDPOINT -u admin -p < aws/rds-setup.sql
mysql -h YOUR_RDS_ENDPOINT -u admin -p < backend/database/schema.sql
```

#### 3. Create S3 Bucket
```bash
aws s3 mb s3://railway-sa-deployments --region me-south-1
```

#### 4. Create Elastic Beanstalk App
```bash
eb init railway-sa --platform node.js-18 --region me-south-1
eb create railway-sa-prod
```

#### 5. Set Environment Variables on EB
```bash
eb setenv \
  NODE_ENV=production \
  DB_HOST=YOUR_RDS_ENDPOINT \
  DB_NAME=railway_sa \
  DB_USER=railway_user \
  DB_PASSWORD=YOUR_DB_PASSWORD \
  JWT_SECRET=YOUR_JWT_SECRET \
  SMTP_USER=YOUR_EMAIL \
  SMTP_PASS=YOUR_APP_PASSWORD \
  TWILIO_ACCOUNT_SID=YOUR_SID \
  TWILIO_AUTH_TOKEN=YOUR_TOKEN \
  TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
```

#### 6. Deploy
```bash
chmod +x aws/scripts/deploy.sh
./aws/scripts/deploy.sh
```

---

## 🔐 GitHub Secrets (for CI/CD)

Add these in **GitHub → Settings → Secrets → Actions**:

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | Your AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key |

CI/CD runs automatically on every push to `main`.

---

## 🔒 Security Notes
- JWT access tokens expire in **7 days**, refresh tokens in **30 days**
- Passwords hashed with **bcrypt (cost 12)**
- Rate limiting: **100 req/15min** global, **10 req/15min** on auth routes
- Role guards enforced on **every API route** and **every frontend page**
- All DB queries use **parameterized statements** (no SQL injection)
- HTTPS enforced via AWS ACM on port 443

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (no framework) |
| Backend | Node.js 18, Express 4 |
| Database | MySQL 8.0 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Email | Nodemailer (SMTP / Gmail) |
| SMS | Twilio |
| QR Code | qrcode (server-side PNG) |
| Hosting | AWS Elastic Beanstalk |
| Database Hosting | AWS RDS |
| CI/CD | GitHub Actions |
| Logging | Winston |

---

*RailWay SA — ريلوي السعودية · 2026*
