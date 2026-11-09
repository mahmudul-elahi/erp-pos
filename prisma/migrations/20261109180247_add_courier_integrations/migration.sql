-- CreateEnum
CREATE TYPE "CourierProvider" AS ENUM ('STEADFAST', 'PATHAO', 'REDX', 'MANUAL');

-- CreateEnum
CREATE TYPE "CourierDeliveryStatus" AS ENUM ('PENDING', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "courier_shipments" (
    "id" TEXT NOT NULL,
    "shipment_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "provider" "CourierProvider" NOT NULL,
    "consignment_id" TEXT,
    "tracking_code" TEXT,
    "status" "CourierDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "delivery_fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cod_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "recipient_address" TEXT NOT NULL,
    "recipient_city" TEXT,
    "recipient_zone" TEXT,
    "status_history" JSONB,
    "courier_payload" JSONB,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courier_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courier_shipments_shipment_number_key" ON "courier_shipments"("shipment_number");

-- CreateIndex
CREATE INDEX "courier_shipments_order_id_idx" ON "courier_shipments"("order_id");

-- CreateIndex
CREATE INDEX "courier_shipments_provider_idx" ON "courier_shipments"("provider");

-- CreateIndex
CREATE INDEX "courier_shipments_tracking_code_idx" ON "courier_shipments"("tracking_code");

-- CreateIndex
CREATE INDEX "courier_shipments_consignment_id_idx" ON "courier_shipments"("consignment_id");

-- CreateIndex
CREATE INDEX "courier_shipments_status_idx" ON "courier_shipments"("status");

-- CreateIndex
CREATE INDEX "courier_shipments_created_at_idx" ON "courier_shipments"("created_at");

-- AddForeignKey
ALTER TABLE "courier_shipments" ADD CONSTRAINT "courier_shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_shipments" ADD CONSTRAINT "courier_shipments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
