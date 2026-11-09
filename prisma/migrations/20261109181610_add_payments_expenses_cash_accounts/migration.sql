-- CreateEnum
CREATE TYPE "CashAccountType" AS ENUM ('CASH', 'BANK', 'MFS');

-- CreateEnum
CREATE TYPE "CashTransactionType" AS ENUM ('OPENING_BALANCE', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'EXPENSE', 'SALE_PAYMENT', 'PURCHASE_PAYMENT', 'DIRECTOR_DEPOSIT', 'DIRECTOR_WITHDRAWAL', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CashAccountType" NOT NULL DEFAULT 'CASH',
    "account_number" TEXT,
    "bank_name" TEXT,
    "branch_name" TEXT,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "branch_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_account_transactions" (
    "id" TEXT NOT NULL,
    "transaction_number" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" "CashTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance_before" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "transfer_account_id" TEXT,
    "description" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_account_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "expense_number" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payee" TEXT,
    "receipt_file_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_accounts_type_idx" ON "cash_accounts"("type");

-- CreateIndex
CREATE INDEX "cash_accounts_branch_id_idx" ON "cash_accounts"("branch_id");

-- CreateIndex
CREATE INDEX "cash_accounts_is_active_idx" ON "cash_accounts"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "cash_account_transactions_transaction_number_key" ON "cash_account_transactions"("transaction_number");

-- CreateIndex
CREATE INDEX "cash_account_transactions_account_id_idx" ON "cash_account_transactions"("account_id");

-- CreateIndex
CREATE INDEX "cash_account_transactions_type_idx" ON "cash_account_transactions"("type");

-- CreateIndex
CREATE INDEX "cash_account_transactions_reference_type_reference_id_idx" ON "cash_account_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "cash_account_transactions_created_at_idx" ON "cash_account_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_code_key" ON "expense_categories"("code");

-- CreateIndex
CREATE INDEX "expense_categories_is_active_idx" ON "expense_categories"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_expense_number_key" ON "expenses"("expense_number");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "expenses_account_id_idx" ON "expenses"("account_id");

-- CreateIndex
CREATE INDEX "expenses_branch_id_idx" ON "expenses"("branch_id");

-- CreateIndex
CREATE INDEX "expenses_expense_date_idx" ON "expenses"("expense_date");

-- AddForeignKey
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_account_transactions" ADD CONSTRAINT "cash_account_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_account_transactions" ADD CONSTRAINT "cash_account_transactions_transfer_account_id_fkey" FOREIGN KEY ("transfer_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_account_transactions" ADD CONSTRAINT "cash_account_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_file_id_fkey" FOREIGN KEY ("receipt_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
