# 🚆 Train Schedule and Reservation Management System
**Course:** Software Engineering 1 (CS 1350) — Section 172
**Instructor:** Prof. Gufran Ahmed Ansari
**University:** Imam Mohammad Ibn Saud Islamic University
**Team Number:** Team no. 6

### 👥 Team Members & Contributions:
* **Sultan Hisham Al-Furaihi (Leader)** - Database Design, Capacity Pre-Check Logic, Notification Engine
* **Marwan Ali Alwadeey** - Real-time Seat Locking, Route Management & UI Optimization
* **Mehdi Karim Alanzi** - Search Interface, Passenger Pricing, Capacity Validation
* **Mohammed Fahed Azzumeea** - History Archive, Operational Audit Logs, Document Integration

---

## 📁 Project Structure

~~~
railway/
├── backend/
│   ├── config/
│   │   ├── database.js          # MySQL connection pool
│   │   └── logger.js            # System activity logger
│   ├── database/
│   │   ├── schema.sql           # Full MySQL schema (Tables for Schedules, Routes, Bookings)
│   │   ├── seed.sql             # Mock data for local system testing
│   │   └── setup.js             # Database migration and initialization script
│   ├── middleware/
│   │   ├── auth.js              # Access tokens and role guards (Admin, Staff, Passenger)
│   │   └── errorHandler.js      # Global application error handler
│   ├── routes/
│   │   ├── auth.routes.js       # Login, Local Identity, and logout paths
│   │   ├── schedules.routes.js  # Schedule CRUD + real-time seat map logic
│   │   ├── bookings.routes.js   # Transaction handling & ticket processing flow
│   │   ├── routes.routes.js     # Route and station tracking management
│   │   └── dashboard.routes.js  # Analytics data for live train occupancy
│   ├── services/
│   │   └── notification.service.js # Auto-generated confirmation receipts
│   └── server.js                # Core system entry point
├── frontend/
│   ├── css/                     # System user interface layout styling
│   ├── js/                      # Local API requests and front-end interface flows
│   └── views/                   # HTML interface screens (Admin dashboard, Ticket booker)
└── README.md                    # Project overview documentation
~~~

---

## 🚀 Key Functional Features

* **Schedule Management (Sprint 1):** Complete administrative suite to safely create, update, and remove active train journeys and track operational changes.
* **Capacity & Pricing Logic (Sprint 1):** Automatic configuration parameters assigning distinct seat spaces to custom train classifications.
* **Transactional Ticket Processing (Sprint 2):** Secure seat availability pre-checks operating right before checking out to eliminate train overbooking risks.
* **Bilingual System Elements:** Built to structurally process dual English and Arabic ticket receipts.
* **Local Identity Integration:** Includes architectural route points matching Saudi National Sign-On (**Nafath**) authentication flows.
* **Live Occupancy Tracking (Sprint 3):** High-level monitoring boards allowing station staff to track train seat volumes before departures.

---

## 🛠️ Technology Stack Used

| Layer | Technology Platform |
|---|---|
| **Frontend UI** | HTML5, CSS3, Vanilla JavaScript (Built without external frameworks) |
| **Backend Core** | Node.js with Express framework / Java API patterns |
| **Database Storage** | MySQL Relational Database Management System |

---

## 💻 Local Installation & Setup Steps

Follow these steps to deploy and run the system locally for inspection or testing:

#### 1. Setup the Relational Database
Open your SQL management console (e.g., MySQL Workbench), connect to your local engine, and execute the structural schema script:
```bash
# Run the schema script to establish core system tables
mysql -u your_username -p < backend/database/schema.sql
