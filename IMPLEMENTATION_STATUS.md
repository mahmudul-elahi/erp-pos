# Implementation Status Checklist

Last updated: 2026-11-09
Specification: POS + E-commerce + Light ERP Backend (NestJS 12 + Prisma + PostgreSQL)

---

## Phase Checklist

| Phase | Description | Scope / Modules | Status | Notes |
|---|---|---|---|---|
| **Phase 0** | Inspection, Architecture & Baseline | Environment, Docker Compose, baseline tests, architecture docs | 🟢 Completed | Docker Compose, baseline test suite, .env verified |
| **Phase 1** | Foundation & Core Infrastructure | Auth, RBAC, Users, Roles, Permissions, Branches, Warehouses, Audit Logs, MinIO Storage, Swagger | 🟢 Completed | Migration `20261109164704_init_foundation`, seed script, 34 tests passing |
| **Phase 2** | Product Catalog | Categories, Brands, Products, Variants, Attributes, Barcodes, Specifications | 🟢 Completed | Migration `20261109170543_add_product_catalog`, 53 total tests passing |
| **Phase 3** | People & Ledgers | Customers, Suppliers, Contact Info, Auditable Opening Balances, Ledgers | 🟢 Completed | Migration `20261109171513_add_people_and_ledgers`, 68 total tests passing |
| **Phase 4** | Inventory Engine | Inventory balances, immutable movements, adjustments, transfers, damage write-offs | 🟢 Completed | Migration `20261109172946_add_inventory_engine`, 89 total tests passing |
| **Phase 5** | Purchases & Purchase Returns | Supplier purchase orders, stock receiving, purchase returns, supplier refunds/credits | 🟢 Completed | Migration `20261109173826_add_purchases_and_returns`, 105 total tests passing |
| **Phase 6** | POS Sales & Cash Register | Point of sale checkout, register shifts, cash in/out, sales returns & refunds | 🟢 Completed | Migration `20261109174722_add_pos_sales_and_shifts`, 119 total tests passing |
| **Phase 7** | E-commerce Orders & Workflow | Order intake, state machine transitions, snapshot pricing, reservation rules | 🟢 Completed | Migration `20261109175630_add_orders_and_workflow`, 133 total tests passing |
| **Phase 8** | Courier Integrations | Unified courier adapter, Pathao, Steadfast, REDX, webhooks & tracking | 🟢 Completed | Migration `20261109180247_add_courier_integrations`, 141 total tests passing |
| **Phase 9** | Payments, Expenses & Cash Accounts | Multi-method payments, expense tracking, MinIO receipts, ledger entries | ⬜ Pending | |
| **Phase 10** | Marketing & Storefront Admin | Coupons, promotional offers, banners, articles, product reviews, SEO | ⬜ Pending | |
| **Phase 11** | Gadget-Specific Workflows | Used devices, device buyback requests, warranties, IMEI/serial verification, gifts | ⬜ Pending | |
| **Phase 12** | Telesales & Confirmation | Agent assignments, call logs, disposition tracking, callback scheduling | ⬜ Pending | Uses same core order workflow |
| **Phase 13** | Partner Network | Dealers, Retailers, B2B, Franchises, partner tiers & price lists | ⬜ Pending | |
| **Phase 14** | Director / Owner Treasury | Deposits, withdrawals, inter-account transfers, immutable ledger | ⬜ Pending | Zero arbitrary balance mutations |
| **Phase 15** | Reports, Dashboards & Reconciliation | Financial & inventory reports, operational dashboard, balance reconciliation | ⬜ Pending | Excel/PDF export |

---

## Status Legend
- ⬜ **Pending**: Not started
- 🟡 **In Progress**: Currently being designed or implemented
- 🟢 **Completed**: Implemented with tests, migrations, Swagger docs, and verification


---

## Phase 1 Execution Summary

- **Database Migration**: `20261109164704_init_foundation`
  - Tables: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `branches`, `warehouses`, `user_branches`, `audit_logs`, `files`
- **Seed Data**:
  - 24 system permissions across modules
  - Roles: `super_admin`, `branch_manager`, `cashier`
  - Main Branch (`BRANCH-MAIN`) & Central Warehouse (`WH-MAIN`)
  - Super Administrator: `admin@erppos.local`
- **Security & Authorization**:
  - Argon2id password hashing
  - JWT access tokens (15m) + rotating refresh tokens (30d with unique `jti` and theft revocation)
  - RBAC permission guard (`@RequirePermissions`) and branch isolation guard (`@BranchScope`)
  - Rate limiting with `@nestjs/throttler`
  - Helmet security headers and CORS
- **Storage**:
  - MinIO S3-compatible service with automatic bucket initialization (`pos-erp`)
  - Presigned upload (`POST /files/presign`) and download (`GET /files/:id/download-url`)
  - Strict MIME type and extension validation against executable files
- **API Documentation**: Swagger UI at `/api/docs` with Bearer auth
- **Test Results**:
  - Unit tests: 22 passing
  - End-to-End tests: 12 passing
  - Oxlint: 0 warnings, 0 errors
  - Build: cleanly compiled


---

## Phase 2 Execution Summary

- **Database Migration**: `20261109170543_add_product_catalog`
  - Tables: `categories`, `brands`, `attributes`, `attribute_values`, `products`, `product_variants`, `product_variant_attribute_values`, `product_barcodes`, `product_images`, `specification_groups`, `product_specifications`
- **Features Implemented**:
  - Hierarchical categories with self-referential parent/children relations and tree retrieval (`GET /categories/tree`)
  - Brands management with unique slug validation
  - Flexible attribute definitions (`Color`, `Storage`, `RAM`) and discrete values
  - Full product model with Decimal financial prices (`costPrice`, `sellingPrice`, `wholesalePrice`)
  - Multi-variant configuration with attribute value links and price overrides
  - Automatic SKU generation with collision detection
  - Barcode engine generating EAN-13 barcodes with checksum verification and full barcode history (`ProductBarcode`)
  - POS barcode scanner endpoint: `GET /products/by-barcode/:barcode` resolving base products or specific variants with attributes instantly
  - Specification groups and structured key/value specs
  - Product images with primary image designation and MinIO file integration
  - Serial/IMEI tracking flag (`trackSerial`) and configurable warranty fields
- **Test Results**:
  - Unit tests: 33 passing (+11 tests in Phase 2)
  - End-to-End tests: 20 passing (+8 tests in Phase 2)
  - Oxlint: 0 warnings, 0 errors
  - Build: cleanly compiled


---

## Phase 3 Execution Summary

- **Database Migration**: `20261109171513_add_people_and_ledgers`
  - Tables: `customers`, `customer_ledger_entries`, `suppliers`, `supplier_ledger_entries`
- **Features Implemented**:
  - Customer profiles with contact details, address, notes, credit limits, and active status.
  - Supplier profiles with company name, contact person, phone, email, address, TIN/BIN, and trade license.
  - Strict financial integrity: balances are **never** stored as independently editable numbers. Balances are derived dynamically from transaction debits/credits, with balance snapshots recorded on immutable ledger entries.
  - Transactional opening balance setup: positive opening balance records customer due (debit) or store payable (credit); negative balance records customer credit or store advance.
  - Full customer and supplier immutable ledger histories (`GET /customers/:id/ledger`, `GET /suppliers/:id/ledger`).
  - Auditable manual adjustments (`POST /customers/:id/adjustments`, `POST /suppliers/:id/adjustments`) tracking reasons, actors, and updating running balances.
  - Role-based permissions: `customers.manage`, `customers.view`, `suppliers.manage`, `suppliers.view`.
- **Test Results**:
  - Unit tests: 41 passing (+8 tests in Phase 3)
  - End-to-End tests: 27 passing (+7 tests in Phase 3)
  - Oxlint: 0 warnings, 0 errors
  - Build: cleanly compiled


---

## Phase 4 Execution Summary

- **Database Migration**: `20261109172946_add_inventory_engine`
  - Tables: `inventory_balances`, `stock_movements`, `stock_adjustments`, `stock_adjustment_items`, `stock_transfers`, `stock_transfer_items`, `damaged_products`
  - Enums: `StockMovementType`, `AdjustmentStatus`, `AdjustmentType`, `TransferStatus`
- **Features Implemented**:
  - **Non-Negative Stock & Safe Mutation Primitive**:
    - Atomic transaction locking on inventory balance rows
    - Rejection of any operation that would reduce on-hand balance below 0 (`BadRequestException`)
    - Serial/IMEI tracking enforcement on products with `trackSerial = true`
    - Complete, immutable `StockMovement` ledger tracking `quantity`, `balanceBefore`, `balanceAfter`, `type`, `referenceType`, and actor ID
  - **Stock Adjustments**:
    - Draft or immediate confirmation adjustment flows
    - Positive adjustment (`ADJUSTMENT_IN`) and negative adjustment (`ADJUSTMENT_OUT`)
    - Full itemized adjustment history with reasons
  - **Stock Transfers Lifecycle**:
    - `DRAFT`: Transfer creation between distinct source and destination warehouses
    - `DISPATCHED`: Source `onHand` decrements, destination `inTransit` increments; movement `TRANSFER_OUT`
    - `RECEIVED`: Destination `inTransit` decrements, destination `onHand` increments; movement `TRANSFER_IN`
    - `CANCELLED`: If cancelled after dispatch, in-transit stock is reverted and source warehouse stock is restored safely
  - **Damaged Products / Write-offs**:
    - Write-off endpoint deducting physical stock, logging movement `DAMAGED`, and persisting auditable records
  - **Low Stock Alerts & Balance Queries**:
    - Filterable by warehouse, product, variant, and alert thresholds
- **Test Results**:
  - Unit tests: 50 passing (+9 tests in Phase 4)
  - End-to-End tests: 39 passing (+12 tests in Phase 4)
  - Oxlint: 0 warnings, 0 errors
  - Build: cleanly compiled


---

## Phase 5 Execution Summary

- **Database Migration**: `20261109173826_add_purchases_and_returns`
  - Tables: `purchases`, `purchase_items`, `purchase_payments`, `purchase_returns`, `purchase_return_items`
  - Enums: `PurchaseStatus` (`DRAFT`, `ORDERED`, `RECEIVED`, `PARTIALLY_RECEIVED`, `CANCELLED`), `PurchasePaymentStatus` (`UNPAID`, `PARTIAL`, `PAID`), `PurchaseReturnStatus` (`DRAFT`, `COMPLETED`, `CANCELLED`)
- **Features Implemented**:
  - **Supplier Purchase Orders**:
    - Itemized purchase orders with ordered quantities, unit costs, and financial calculations using `Prisma.Decimal` (subtotal, taxes, shipping, discounts, total, due, paid).
    - Status tracking: `ORDERED`, `RECEIVED`, `PARTIALLY_RECEIVED`, `CANCELLED`.
  - **Warehouse Goods Receiving & Inventory Integration**:
    - Transactional goods intake: increments warehouse `onHand` via `InventoryService.adjustStockTx` and creates immutable `StockMovement` of type `PURCHASE_RECEIVED`.
    - Serial/IMEI tracking enforcement for serialized devices.
    - Automatic updates to latest product/variant `costPrice`.
  - **Double-Entry Financial Ledger Integration**:
    - Receiving items creates an auditable `SupplierLedgerEntry` with `type: PURCHASE`, `credit: intakeBatchValue` (store incurs liability to supplier).
    - Recording payments (`POST /purchases/:id/payments`) creates `PurchasePayment` record, decreases `dueAmount`, and creates a `SupplierLedgerEntry` with `type: PAYMENT`, `debit: amount` (reduces store liability).
  - **Purchase Returns**:
    - Stock reduction: deducts physical stock from warehouse `onHand` with movement `PURCHASE_RETURN`.
    - Supplier refund / credit: creates `SupplierLedgerEntry` with `type: RETURN`, `debit: returnTotal` reducing payable liability.
  - **Order Cancellation Guard**:
    - Unreceived purchase orders can be cancelled. Once goods are received, cancellation is prohibited and purchase returns must be used instead.
- **Test Results**:
  - Unit tests: 59 passing (+9 tests in Phase 5)
  - End-to-End tests: 46 passing (+7 tests in Phase 5)
  - Oxlint: 0 warnings, 0 errors
  - Build: cleanly compiled


---

## Phase 6 Execution Summary

- **Database Migration**: `20261109174722_add_pos_sales_and_shifts`
  - Tables: `cash_register_shifts`, `shift_cash_movements`, `sales`, `sale_items`, `sale_payments`, `sale_returns`, `sale_return_items`
  - Enums: `ShiftStatus` (`OPEN`, `CLOSED`), `CashMovementType` (`CASH_IN`, `CASH_OUT`), `SaleStatus` (`COMPLETED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `CANCELLED`), `SaleChannel` (`POS`, `ECOMMERCE`, `DIRECT`), `SaleReturnStatus` (`COMPLETED`, `CANCELLED`)
- **Features Implemented**:
  - **Cash Register Shift Lifecycle**:
    - Opening shift with initial cash float (`POST /sales/shifts/open`).
    - Mid-shift petty cash tracking with `CASH_IN` and `CASH_OUT` movements.
    - End-of-shift cash drawer reconciliation: automatically computes expected drawer cash (`float + cashSales + cashIn - cashOut - cashRefunds`), records actual counted cash, and calculates overage/shortage differences.
  - **POS Checkout & Multi-Payment Tenders**:
    - Split-tender payments: supports combining Cash, Card, bKash, Nagad, etc., on a single transaction.
    - Automatic calculation of subtotal, tax, invoice discounts, paid amount, change returned, and remaining due.
    - Credit sales for registered customers with credit limit enforcement.
    - Safe real-time stock deduction with immutable `SALE` movement and snapshot cost price recording.
    - Warranty expiration dates automatically calculated for products with warranty coverage.
    - Double-entry customer ledger updates for sales and payments.
  - **Sales Returns & Customer Refunds**:
    - Partial or full returns against original invoices.
    - Inventory restoration with `SALE_RETURN` stock movements.
    - Customer ledger credits and cash drawer refund deduction.
- **Test Results**:
  - Unit tests: 66 passing (+7 tests in Phase 6)
  - End-to-End tests: 53 passing (+7 tests in Phase 6)
  - Oxlint: 0 warnings, 0 errors
  - Build: cleanly compiled


---

## Phase 7 Execution Summary

- **Database Migration**: `20261109175630_add_orders_and_workflow`
  - Tables: `orders`, `order_items`, `order_status_history`, `order_payments`
  - Enums: `OrderStatus` (`PENDING`, `CONFIRMED`, `PROCESSING`, `READY_TO_SHIP`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `RETURNED`), `OrderPaymentStatus` (`UNPAID`, `PARTIAL_PAID`, `PAID`, `REFUNDED`), `OrderPaymentMethod` (`COD`, `BKASH`, `NAGAD`, `CARD`, `BANK_TRANSFER`, `OTHER`), `OrderSource` (`WEBSITE`, `APP`, `ADMIN_PANEL`, `TELESALES`, `SOCIAL_COMMERCE`)
- **Features Implemented**:
  - **E-commerce & Omni-channel Order Intake**:
    - Itemized order creation with snapshot pricing (`unitPrice`, `costPriceSnapshot`, discounts, total).
    - Shipping details (customer name, phone, address, city, zone, courier fee, notes).
    - Payment methods including Cash on Delivery (COD) and partial advance payments.
  - **State Machine Transitions & Inventory Lifecycle**:
    - Strict lifecycle validation (disallows illegal state transitions like `PENDING` -> `DELIVERED`).
    - `CONFIRMED`: Triggers inventory reservation on `InventoryBalance.reserved += qty` with available stock checks.
    - `SHIPPED`: Releases inventory reservation (`reserved -= qty`) and deducts physical stock (`onHand -= qty`) with immutable `SALE` movement.
    - `CANCELLED`: Safely releases reservations if pre-dispatch, or restores physical stock if post-dispatch.
    - `RETURNED`: Automatically restores physical warehouse inventory on courier delivery failure.
    - `DELIVERED`: Automatically settles COD invoices and creates payment records.
  - **Order Status History Audit Trail**:
    - Every transition writes an immutable `OrderStatusHistory` record tracking `fromStatus`, `toStatus`, `reason`, `notes`, and user ID.
- **Test Results**:
  - Unit tests: 72 passing (+6 tests in Phase 7)
  - End-to-End tests: 61 passing (+8 tests in Phase 7)
  - Oxlint: 0 warnings, 0 errors
  - Build: cleanly compiled


---

## Phase 8 Execution Summary

- **Database Migration**: `20261109180247_add_courier_integrations`
  - Tables: `courier_shipments`
  - Enums: `CourierProvider` (`STEADFAST`, `PATHAO`, `REDX`, `MANUAL`), `CourierDeliveryStatus` (`PENDING`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `RETURNED`, `CANCELLED`)
- **Features Implemented**:
  - **Unified Courier Adapter Engine**:
    - `CourierAdapter` contract for standardizing shipment dispatch, tracking queries, and webhook parsing across third-party Bangladeshi logistics providers.
    - `SteadfastAdapter`: Supports Steadfast live API or sandbox with consignment & tracking generation, webhook normalization.
    - `PathaoAdapter`: Bearer auth integration with Pathao Courier consignment tracking and status mapping.
    - `RedxAdapter`: REDX tracking, consignment ID mapping, and webhook parser.
    - `ManualCourierAdapter`: In-house delivery riders and direct Dhaka city messenger dispatch.
    - `CourierAdapterFactory`: Dynamic provider resolution with input validation.
  - **Automated Order State Machine Integration**:
    - Dispatching via courier automatically steps orders from `PENDING`/`CONFIRMED`/`PROCESSING`/`READY_TO_SHIP` through the state machine to `SHIPPED`.
    - Automatically updates order `courierName` and `courierTrackingCode`.
  - **Real-Time Tracking & Audit History**:
    - Status history JSON logging all tracking movements, timestamps, and hub locations.
  - **Public Inbound Webhook Processing**:
    - `POST /api/v1/couriers/webhooks/:provider` processes asynchronous status updates from couriers.
    - Webhook updates shipment status and automatically advances order to `DELIVERED` (auto-settles COD invoices into order payments), `RETURNED` (auto-restores physical warehouse stock), or `CANCELLED`.
  - **Role-Based Permissions**:
    - `couriers.manage`, `couriers.view`.
- **Test Results**:
  - Unit tests: 74 passing (+2 tests in Phase 8)
  - End-to-End tests: 67 passing (+6 tests in Phase 8)
  - Oxlint: 0 warnings, 0 errors
  - Build: cleanly compiled
