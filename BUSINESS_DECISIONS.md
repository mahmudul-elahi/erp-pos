# Business Decisions & Technical Assumptions Log

Last updated: 2026-11-09

This document records architectural, business, and domain decisions to ensure all stakeholders and future tasks stay aligned.

---

## 1. Technical Baseline Decisions

| Topic | Decision | Justification |
|---|---|---|
| **Package Manager** | `npm` | `package-lock.json` is already committed in the repository. Preserves lockfile consistency. |
| **Test Runner** | Vitest 4 + Supertest | Pre-configured in repository and mandated by repository rule in `AGENTS.md` (NestJS 12 ESM baseline). |
| **Module System** | ESM (`"type": "module"`) | NestJS 12 and repository tsconfig use `nodenext` ESM; imports require `.js` extensions. |
| **Database & ORM** | PostgreSQL 17 + Prisma 7.10.x | Production-grade relational schema with migrations and strict foreign keys. |
| **Financial Math** | `Decimal(18,2)` & `Decimal(18,4)` via `decimal.js` | Zero floating-point drift on currency and unit cost calculations. |
| **Object Storage** | MinIO (S3-compatible) SDK | Dedicated private bucket `pos-erp`, presigned upload/download URLs, no public bucket default. |
| **Redis Port** | Host port `6380` (Docker) -> Container `6379` | Host machine already has a system Redis service listening on port 6379. |

---

## 2. Open Business Decisions (to be clarified at their respective phases)

The following items from Section 17 of the specification affect later phase implementations. Work on Phase 1 is **not** blocked by them.

1. **Multi-tenancy vs Single Company**: Default assumption is a single company with multiple branches/warehouses. (If SaaS multi-tenancy is needed in the future, tenant isolation keys would be required).
2. **Serial / IMEI Tracking**: Required for high-value gadget categories (e.g. phones, laptops), optional for general accessories.
3. **Inventory Reservation Status**: Stock is reserved when an order is transitioned to `Confirm` or `Approve`; stock is permanently deducted when dispatched/shipped.
4. **POS Multi-Payment**: Supports split payments across multiple payment methods (e.g. partial cash + partial bKash) for a single sale.
5. **Customer & Supplier Credit**: Credit balances and due payments will be recorded as auditable ledger transactions, not raw balance overwrites.
6. **Returns Policy**: Return items create a credit note or refund record based on manager approval; restockable items return to inventory while damaged items move to a quarantine/damage ledger.
7. **Couriers**: Mock providers with full adapter interface implementation will be built initially; live credentials for Pathao, Steadfast, and REDX can be supplied when available.
