-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('CASH_IN', 'CASH_OUT');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('POS', 'ECOMMERCE', 'DIRECT');

-- CreateEnum
CREATE TYPE "SaleReturnStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "cash_register_shifts" (
    "id" TEXT NOT NULL,
    "shift_number" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "opening_cash_float" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "closing_cash_expected" DECIMAL(18,2),
    "closing_cash_actual" DECIMAL(18,2),
    "cash_difference" DECIMAL(18,2),
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opening_notes" TEXT,
    "closing_notes" TEXT,

    CONSTRAINT "cash_register_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_cash_movements" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "shift_id" TEXT,
    "user_id" TEXT NOT NULL,
    "channel" "SaleChannel" NOT NULL DEFAULT 'POS',
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "paid_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "change_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "due_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "cost_price_snapshot" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(18,2) NOT NULL,
    "serial_numbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warranty_months" INTEGER DEFAULT 0,
    "warranty_expires_at" TIMESTAMP(3),

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "shift_id" TEXT,
    "status" "SaleReturnStatus" NOT NULL DEFAULT 'COMPLETED',
    "total_refund" DECIMAL(18,2) NOT NULL,
    "refund_method" TEXT NOT NULL DEFAULT 'CASH',
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "sale_item_id" TEXT,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "refund_amount" DECIMAL(18,2) NOT NULL,
    "serial_numbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_register_shifts_shift_number_key" ON "cash_register_shifts"("shift_number");

-- CreateIndex
CREATE INDEX "cash_register_shifts_branch_id_idx" ON "cash_register_shifts"("branch_id");

-- CreateIndex
CREATE INDEX "cash_register_shifts_user_id_idx" ON "cash_register_shifts"("user_id");

-- CreateIndex
CREATE INDEX "cash_register_shifts_status_idx" ON "cash_register_shifts"("status");

-- CreateIndex
CREATE INDEX "cash_register_shifts_opened_at_idx" ON "cash_register_shifts"("opened_at");

-- CreateIndex
CREATE INDEX "shift_cash_movements_shift_id_idx" ON "shift_cash_movements"("shift_id");

-- CreateIndex
CREATE INDEX "shift_cash_movements_type_idx" ON "shift_cash_movements"("type");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_number_key" ON "sales"("invoice_number");

-- CreateIndex
CREATE INDEX "sales_branch_id_idx" ON "sales"("branch_id");

-- CreateIndex
CREATE INDEX "sales_warehouse_id_idx" ON "sales"("warehouse_id");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "sales_shift_id_idx" ON "sales"("shift_id");

-- CreateIndex
CREATE INDEX "sales_user_id_idx" ON "sales"("user_id");

-- CreateIndex
CREATE INDEX "sales_status_idx" ON "sales"("status");

-- CreateIndex
CREATE INDEX "sales_channel_idx" ON "sales"("channel");

-- CreateIndex
CREATE INDEX "sales_created_at_idx" ON "sales"("created_at");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");

-- CreateIndex
CREATE INDEX "sale_items_variant_id_idx" ON "sale_items"("variant_id");

-- CreateIndex
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");

-- CreateIndex
CREATE INDEX "sale_payments_method_idx" ON "sale_payments"("method");

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_return_number_key" ON "sale_returns"("return_number");

-- CreateIndex
CREATE INDEX "sale_returns_sale_id_idx" ON "sale_returns"("sale_id");

-- CreateIndex
CREATE INDEX "sale_returns_branch_id_idx" ON "sale_returns"("branch_id");

-- CreateIndex
CREATE INDEX "sale_returns_warehouse_id_idx" ON "sale_returns"("warehouse_id");

-- CreateIndex
CREATE INDEX "sale_returns_customer_id_idx" ON "sale_returns"("customer_id");

-- CreateIndex
CREATE INDEX "sale_returns_shift_id_idx" ON "sale_returns"("shift_id");

-- CreateIndex
CREATE INDEX "sale_returns_created_at_idx" ON "sale_returns"("created_at");

-- CreateIndex
CREATE INDEX "sale_return_items_return_id_idx" ON "sale_return_items"("return_id");

-- CreateIndex
CREATE INDEX "sale_return_items_product_id_idx" ON "sale_return_items"("product_id");

-- CreateIndex
CREATE INDEX "sale_return_items_variant_id_idx" ON "sale_return_items"("variant_id");

-- AddForeignKey
ALTER TABLE "cash_register_shifts" ADD CONSTRAINT "cash_register_shifts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_shifts" ADD CONSTRAINT "cash_register_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_cash_movements" ADD CONSTRAINT "shift_cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cash_register_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_cash_movements" ADD CONSTRAINT "shift_cash_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cash_register_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cash_register_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
