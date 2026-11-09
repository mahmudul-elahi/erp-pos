-- CreateEnum
CREATE TYPE "DeviceCondition" AS ENUM ('MINT', 'GOOD', 'FAIR', 'POOR');

-- CreateEnum
CREATE TYPE "BuybackStatus" AS ENUM ('PENDING', 'INSPECTED', 'ACCEPTED', 'REJECTED', 'PURCHASED');

-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('RECEIVED', 'DIAGNOSING', 'SENT_TO_SERVICE_CENTER', 'REPAIRED', 'REPLACED', 'REJECTED', 'DELIVERED_TO_CUSTOMER');

-- CreateTable
CREATE TABLE "device_buyback_requests" (
    "id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "device_brand" TEXT NOT NULL,
    "device_model" TEXT NOT NULL,
    "imei" TEXT,
    "serial_number" TEXT,
    "condition" "DeviceCondition" NOT NULL DEFAULT 'GOOD',
    "battery_health" INTEGER,
    "has_box" BOOLEAN NOT NULL DEFAULT false,
    "has_charger" BOOLEAN NOT NULL DEFAULT false,
    "has_original_bill" BOOLEAN NOT NULL DEFAULT false,
    "expected_price" DECIMAL(18,2),
    "offered_price" DECIMAL(18,2),
    "status" "BuybackStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "inspected_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_buyback_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_claims" (
    "id" TEXT NOT NULL,
    "claim_number" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "product_id" TEXT,
    "sale_id" TEXT,
    "problem_summary" TEXT NOT NULL,
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'RECEIVED',
    "repair_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "received_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimated_date" TIMESTAMP(3),
    "completed_date" TIMESTAMP(3),
    "technician_notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_bundles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_bundle_items" (
    "id" TEXT NOT NULL,
    "bundle_id" TEXT NOT NULL,
    "primary_product_id" TEXT NOT NULL,
    "gift_product_id" TEXT NOT NULL,
    "gift_quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "gift_bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_buyback_requests_request_number_key" ON "device_buyback_requests"("request_number");

-- CreateIndex
CREATE INDEX "device_buyback_requests_customer_phone_idx" ON "device_buyback_requests"("customer_phone");

-- CreateIndex
CREATE INDEX "device_buyback_requests_imei_idx" ON "device_buyback_requests"("imei");

-- CreateIndex
CREATE INDEX "device_buyback_requests_serial_number_idx" ON "device_buyback_requests"("serial_number");

-- CreateIndex
CREATE INDEX "device_buyback_requests_status_idx" ON "device_buyback_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_claims_claim_number_key" ON "warranty_claims"("claim_number");

-- CreateIndex
CREATE INDEX "warranty_claims_customer_phone_idx" ON "warranty_claims"("customer_phone");

-- CreateIndex
CREATE INDEX "warranty_claims_serial_number_idx" ON "warranty_claims"("serial_number");

-- CreateIndex
CREATE INDEX "warranty_claims_status_idx" ON "warranty_claims"("status");

-- CreateIndex
CREATE UNIQUE INDEX "gift_bundle_items_bundle_id_primary_product_id_gift_product_key" ON "gift_bundle_items"("bundle_id", "primary_product_id", "gift_product_id");

-- AddForeignKey
ALTER TABLE "device_buyback_requests" ADD CONSTRAINT "device_buyback_requests_inspected_by_id_fkey" FOREIGN KEY ("inspected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_buyback_requests" ADD CONSTRAINT "device_buyback_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_bundle_items" ADD CONSTRAINT "gift_bundle_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "gift_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_bundle_items" ADD CONSTRAINT "gift_bundle_items_primary_product_id_fkey" FOREIGN KEY ("primary_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_bundle_items" ADD CONSTRAINT "gift_bundle_items_gift_product_id_fkey" FOREIGN KEY ("gift_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
