import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 6 POS Sales & Cash Register Shifts (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

  let branchId: string;
  let warehouseId: string;
  let productId: string;
  let customerId: string;

  let shiftId: string;
  let saleId: string;
  let saleItemId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();

    // 1. Login Super Admin
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@erppos.local', password: 'AdminPassword123!' });
    adminToken = adminLogin.body.data.accessToken;

    // 2. Login Cashier
    const cashierEmail = `cashier_sales_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'POS Cashier',
        roleNames: ['cashier'],
      });

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'CashierPassword123!' });
    cashierToken = cashierLogin.body.data.accessToken;

    // 3. Get Default Branch & Warehouse
    const branchRes = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${adminToken}`);
    branchId = branchRes.body.data[0].id;

    const whRes = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);
    const matchedWarehouse = whRes.body.data.find((w: any) => w.branchId === branchId);
    warehouseId = matchedWarehouse ? matchedWarehouse.id : whRes.body.data[0].id;

    // 4. Create Product with initial stock
    const catRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Wearable Accessories ${Date.now()}`,
        slug: `wearable-accessories-${Date.now()}`,
      });
    const categoryId = catRes.body.data.id;

    const prodRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Smart Watch Band ${Date.now()}`,
        slug: `smart-watch-band-${Date.now()}`,
        categoryId,
        costPrice: 800,
        sellingPrice: 1500,
        minStockAlert: 2,
        trackSerial: false,
      });
    productId = prodRes.body.data.id;

    // Intake 20 units into warehouse via adjustment
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        warehouseId,
        reason: 'Opening stock for POS testing',
        confirmImmediately: true,
        items: [{ productId, quantity: 20, type: 'INCREASE' }],
      });

    // 5. Create Customer
    const custRes = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tanvir Hossain',
        phone: `+88018${Math.floor(10000000 + Math.random() * 90000000)}`,
        creditLimit: 50000,
      });
    customerId = custRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Cash Register Shift Lifecycle', () => {
    it('should allow cashier to open shift with opening cash float', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/shifts/open')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          openingCashFloat: 2000,
          notes: 'Counter 1 Morning Shift',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('OPEN');
      expect(Number(res.body.data.openingCashFloat)).toBe(2000);
      expect(res.body.data.shiftNumber).toMatch(/^SHIFT-/);
      shiftId = res.body.data.id;
    });

    it('should retrieve current open shift for cashier', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sales/shifts/current')
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(shiftId);
      expect(res.body.data.status).toBe('OPEN');
    });

    it('should record CASH_IN petty cash movement during shift', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sales/shifts/${shiftId}/cash-movement`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'CASH_IN',
          amount: 500,
          reason: 'Petty cash addition for customer change',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe('CASH_IN');
      expect(Number(res.body.data.amount)).toBe(500);
    });
  });

  describe('POS Checkout', () => {
    it('should checkout walk-in customer with split payment and deduct stock', async () => {
      // Buying 2 watch bands @ 1500 = 3000 BDT
      // Tender: 1,000 Cash + 2,000 Card
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/checkout')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          warehouseId,
          items: [{ productId, quantity: 2, unitPrice: 1500 }],
          payments: [
            { method: 'CASH', amount: 1000 },
            { method: 'CARD', amount: 2000, reference: 'VISA-5566' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.invoiceNumber).toMatch(/^INV-/);
      expect(Number(res.body.data.totalAmount)).toBe(3000);
      expect(Number(res.body.data.paidAmount)).toBe(3000);
      expect(Number(res.body.data.dueAmount)).toBe(0);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.payments).toHaveLength(2);

      saleId = res.body.data.id;
      saleItemId = res.body.data.items[0].id;

      // Verify stock decreased from 20 to 18
      const balRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(balRes.body.data.onHand).toBe(18);
    });

    it('should allow credit sale for registered customer and log customer ledger entries', async () => {
      // Buying 1 watch band @ 1500 = 1500 BDT
      // Customer pays 500 Cash, 1000 Due
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/checkout')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          warehouseId,
          customerId,
          items: [{ productId, quantity: 1, unitPrice: 1500 }],
          payments: [{ method: 'CASH', amount: 500 }],
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.totalAmount)).toBe(1500);
      expect(Number(res.body.data.paidAmount)).toBe(500);
      expect(Number(res.body.data.dueAmount)).toBe(1000);

      // Verify customer ledger entries
      const ledgerRes = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerId}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(ledgerRes.status).toBe(200);
      // Customer should have SALE (1500 debit) and PAYMENT (500 credit) -> Balance = 1000 due
      const saleEntry = ledgerRes.body.data.find((e: any) => e.type === 'SALE');
      const payEntry = ledgerRes.body.data.find((e: any) => e.type === 'PAYMENT');
      expect(saleEntry).toBeDefined();
      expect(payEntry).toBeDefined();
      expect(Number(saleEntry.debit)).toBe(1500);
      expect(Number(payEntry.credit)).toBe(500);
    });
  });

  describe('Sales Return & Refund', () => {
    it('should process sales return, restore stock, and issue refund', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          saleId,
          reason: 'Customer chose wrong color band',
          refundMethod: 'CASH',
          items: [{ saleItemId, quantity: 1 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.returnNumber).toMatch(/^SRTN-/);
      expect(Number(res.body.data.totalRefund)).toBe(1500);

      // Stock should be restored: from 17 back to 18
      const balRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(balRes.body.data.onHand).toBe(18);
    });
  });

  describe('Closing Cash Register Shift', () => {
    it('should close shift, compute expected cash, and record difference', async () => {
      // Cash calculation:
      // Opening Float: 2,000
      // Cash In: 500
      // Cash Sale 1: 1,000
      // Cash Sale 2: 500
      // Cash Refund: 1,500
      // Expected = 2,000 + 500 + 1,000 + 500 - 1,500 = 2,500 BDT
      // Counted cash = 2,550 BDT -> Difference = +50 BDT
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sales/shifts/${shiftId}/close`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          closingCashActual: 2550,
          notes: 'End of morning shift. Drawer reconciled.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('CLOSED');
      expect(Number(res.body.data.closingCashExpected)).toBe(2500);
      expect(Number(res.body.data.closingCashActual)).toBe(2550);
      expect(Number(res.body.data.cashDifference)).toBe(50);
    });
  });
});
