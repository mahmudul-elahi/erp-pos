import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 3 People & Ledgers (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

  let customerId: string;
  let supplierId: string;

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

    // Login Super Admin
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@erppos.local', password: 'AdminPassword123!' });
    adminToken = adminLogin.body.data.accessToken;

    // Login Cashier
    const cashierEmail = `cashier_people_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'People Cashier',
        roleNames: ['cashier'],
      });

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'CashierPassword123!' });
    cashierToken = cashierLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Customer & Customer Ledger Lifecycle', () => {
    it('POST /api/v1/customers creates customer with auditable opening balance', async () => {
      const phone = `+88017${Date.now().toString().slice(-8)}`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Tariqul Islam',
          phone,
          email: 'tariqul@example.com',
          address: 'Mirpur DOHS, Dhaka',
          creditLimit: 25000,
          openingBalance: 5000, // Due balance
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.currentBalance).toBe(5000);
      expect(res.body.data.totalDebit).toBe(5000);
      expect(res.body.data.totalCredit).toBe(0);

      customerId = res.body.data.id;
    });

    it('GET /api/v1/customers/:id/ledger returns immutable opening balance entry', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerId}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].type).toBe('OPENING_BALANCE');
      expect(res.body.data[0].debit).toBe(5000);
      expect(res.body.data[0].balanceAfter).toBe(5000);
    });

    it('POST /api/v1/customers/:id/adjustments updates customer balance via auditable transaction', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customerId}/adjustments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 1500,
          adjustmentType: 'CREDIT', // Reduces due balance
          reason: 'Discount voucher settlement',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.entry.credit).toBe(1500);
      expect(res.body.data.entry.balanceAfter).toBe(3500);

      // Verify customer details now reflect updated running balance
      const customerRes = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(customerRes.body.data.currentBalance).toBe(3500);
      expect(customerRes.body.data.totalDebit).toBe(5000);
      expect(customerRes.body.data.totalCredit).toBe(1500);
    });
  });

  describe('Supplier & Supplier Ledger Lifecycle', () => {
    it('POST /api/v1/suppliers creates supplier with auditable opening payable balance', async () => {
      const phone = `+88018${Date.now().toString().slice(-8)}`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          companyName: 'Apex Electronics Imports',
          contactPerson: 'Saiful Alam',
          phone,
          email: 'saiful@apeximports.com',
          address: 'Chittagong Port Trade Zone',
          taxNumber: 'BIN-99221100',
          openingBalance: 80000, // Store owes supplier (payable credit)
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.currentPayable).toBe(80000);
      expect(res.body.data.totalPurchasedOrPayable).toBe(80000);
      expect(res.body.data.totalPaidOrDebited).toBe(0);

      supplierId = res.body.data.id;
    });

    it('GET /api/v1/suppliers/:id/ledger returns supplier ledger entries', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/suppliers/${supplierId}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].type).toBe('OPENING_BALANCE');
      expect(res.body.data[0].credit).toBe(80000);
      expect(res.body.data[0].balanceAfter).toBe(80000);
    });

    it('POST /api/v1/suppliers/:id/adjustments updates supplier payable balance', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/suppliers/${supplierId}/adjustments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 5000,
          adjustmentType: 'DEBIT', // Reduces store payable
          reason: 'Vendor volume rebate applied',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.entry.debit).toBe(5000);
      expect(res.body.data.entry.balanceAfter).toBe(75000);

      // Verify supplier details now reflect updated payable balance
      const supplierRes = await request(app.getHttpServer())
        .get(`/api/v1/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(supplierRes.body.data.currentPayable).toBe(75000);
    });
  });

  describe('Authorization Boundary', () => {
    it('Cashier is forbidden from performing manual ledger adjustments (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customerId}/adjustments`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amount: 100,
          adjustmentType: 'CREDIT',
          reason: 'Unauthorized adjustment',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Missing required permissions');
    });
  });
});
