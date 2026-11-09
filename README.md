# POS + E-commerce + Light ERP Backend

A production-ready, modular monolithic backend for multi-branch POS, e-commerce order management, inventory control, and light ERP tailored for electronics/gadget retail in Bangladesh.

Built with **NestJS 12 (TypeScript ESM)**, **PostgreSQL 17**, **Prisma ORM**, **Redis 7**, **MinIO (S3-compatible)**, and **Vitest**.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: LTS (`>= 20.19.0`, verified on `v24.22.1`)
- **Docker & Docker Compose**
- **npm** (or pnpm)

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure database, Redis, and MinIO credentials match your local configuration.

### 3. Start Local Infrastructure
Start PostgreSQL, Redis, and MinIO in the background:
```bash
docker compose up -d
```
Service ports:
- **PostgreSQL**: `localhost:5432` (`pos_erp`)
- **Redis**: `localhost:6380` (mapped from 6379 to avoid host Redis conflicts)
- **MinIO S3**: `localhost:9000` (Console: `http://localhost:9001`)

### 4. Database Setup & Seeding
Run migrations and load the foundational seed data:
```bash
npm run prisma:migrate
npm run db:seed
```

Default seeded credentials:
- **Super Administrator**: `admin@erppos.local`
- **Password**: `AdminPassword123!`
- **Main Branch**: `BRANCH-MAIN`
- **Central Warehouse**: `WH-MAIN`

### 5. Start the Application
```bash
# Development mode with watch
npm run start:dev

# Production build & run
npm run build
npm run start:prod
```

API Base URL: `http://localhost:3000/api/v1`  
Swagger Documentation: `http://localhost:3000/api/docs`

---

## 🧪 Testing & Verification

```bash
# Unit tests
npm test

# End-to-End integration tests
npm run test:e2e

# Code style and linting
npm run lint
```

---

## 🏛 Architecture & Status

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Architectural decisions, layer rules, and data integrity constraints.
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md): Real-time implementation checklist across all 15 build phases.
- [BUSINESS_DECISIONS.md](BUSINESS_DECISIONS.md): Business assumptions and open decision tracker.
