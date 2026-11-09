-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('FACEBOOK', 'WEBSITE', 'WHATSAPP', 'PHONE_CALL', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadDisposition" AS ENUM ('NEW', 'INTERESTED', 'CONFIRMED', 'CALLBACK_REQUESTED', 'UNREACHABLE', 'CANCELLED', 'WRONG_NUMBER');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('DEALER', 'RETAILER', 'B2B', 'FRANCHISE');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartnerLedgerType" AS ENUM ('INVOICE', 'PAYMENT', 'COMMISSION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "DirectorTxType" AS ENUM ('CAPITAL_DEPOSIT', 'DRAWING_WITHDRAWAL', 'PROFIT_SHARE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "partner_id" TEXT;

-- CreateTable
CREATE TABLE "telesales_leads" (
    "id" TEXT NOT NULL,
    "lead_number" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alternate_phone" TEXT,
    "email" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'WEBSITE',
    "disposition" "LeadDisposition" NOT NULL DEFAULT 'NEW',
    "address" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "callback_at" TIMESTAMP(3),
    "assigned_agent_id" TEXT,
    "converted_order_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telesales_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telesales_call_logs" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "disposition" "LeadDisposition" NOT NULL,
    "call_duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "callback_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telesales_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_price_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discount_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "partner_number" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_person" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "type" "PartnerType" NOT NULL DEFAULT 'RETAILER',
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "price_tier_id" TEXT,
    "credit_limit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "outstanding_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "trade_license" TEXT,
    "bin_number" TEXT,
    "nid_number" TEXT,
    "branch_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_ledger_entries" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "type" "PartnerLedgerType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance_before" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "nid" TEXT,
    "email" TEXT,
    "share_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total_deposited" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_withdrawn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "directors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "director_transactions" (
    "id" TEXT NOT NULL,
    "transaction_number" TEXT NOT NULL,
    "director_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" "DirectorTxType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "director_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telesales_leads_lead_number_key" ON "telesales_leads"("lead_number");

-- CreateIndex
CREATE INDEX "telesales_leads_phone_idx" ON "telesales_leads"("phone");

-- CreateIndex
CREATE INDEX "telesales_leads_disposition_idx" ON "telesales_leads"("disposition");

-- CreateIndex
CREATE INDEX "telesales_leads_assigned_agent_id_idx" ON "telesales_leads"("assigned_agent_id");

-- CreateIndex
CREATE INDEX "telesales_leads_created_at_idx" ON "telesales_leads"("created_at");

-- CreateIndex
CREATE INDEX "telesales_call_logs_lead_id_idx" ON "telesales_call_logs"("lead_id");

-- CreateIndex
CREATE INDEX "telesales_call_logs_agent_id_idx" ON "telesales_call_logs"("agent_id");

-- CreateIndex
CREATE INDEX "telesales_call_logs_created_at_idx" ON "telesales_call_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "partner_price_tiers_name_key" ON "partner_price_tiers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "partners_partner_number_key" ON "partners"("partner_number");

-- CreateIndex
CREATE UNIQUE INDEX "partners_phone_key" ON "partners"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "partners_email_key" ON "partners"("email");

-- CreateIndex
CREATE INDEX "partners_phone_idx" ON "partners"("phone");

-- CreateIndex
CREATE INDEX "partners_type_idx" ON "partners"("type");

-- CreateIndex
CREATE INDEX "partners_status_idx" ON "partners"("status");

-- CreateIndex
CREATE INDEX "partner_ledger_entries_partner_id_idx" ON "partner_ledger_entries"("partner_id");

-- CreateIndex
CREATE INDEX "partner_ledger_entries_type_idx" ON "partner_ledger_entries"("type");

-- CreateIndex
CREATE INDEX "partner_ledger_entries_created_at_idx" ON "partner_ledger_entries"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "directors_phone_key" ON "directors"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "directors_nid_key" ON "directors"("nid");

-- CreateIndex
CREATE UNIQUE INDEX "director_transactions_transaction_number_key" ON "director_transactions"("transaction_number");

-- CreateIndex
CREATE INDEX "director_transactions_director_id_idx" ON "director_transactions"("director_id");

-- CreateIndex
CREATE INDEX "director_transactions_account_id_idx" ON "director_transactions"("account_id");

-- CreateIndex
CREATE INDEX "director_transactions_type_idx" ON "director_transactions"("type");

-- CreateIndex
CREATE INDEX "director_transactions_created_at_idx" ON "director_transactions"("created_at");

-- CreateIndex
CREATE INDEX "orders_partner_id_idx" ON "orders"("partner_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telesales_leads" ADD CONSTRAINT "telesales_leads_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telesales_leads" ADD CONSTRAINT "telesales_leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telesales_leads" ADD CONSTRAINT "telesales_leads_converted_order_id_fkey" FOREIGN KEY ("converted_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telesales_call_logs" ADD CONSTRAINT "telesales_call_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "telesales_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telesales_call_logs" ADD CONSTRAINT "telesales_call_logs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_price_tier_id_fkey" FOREIGN KEY ("price_tier_id") REFERENCES "partner_price_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_ledger_entries" ADD CONSTRAINT "partner_ledger_entries_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_ledger_entries" ADD CONSTRAINT "partner_ledger_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "director_transactions" ADD CONSTRAINT "director_transactions_director_id_fkey" FOREIGN KEY ("director_id") REFERENCES "directors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "director_transactions" ADD CONSTRAINT "director_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "director_transactions" ADD CONSTRAINT "director_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
