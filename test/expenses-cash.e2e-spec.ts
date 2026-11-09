import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 9 Payments, Expenses & Cash Accounts (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

  let cashAccountId: string;
  let bankAccountId: string;
  let categoryId: string;
  let expenseId: string;

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

    // 1. Super Admin login
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@erppos.local', password: 'AdminPassword123!' });
    adminToken = adminLogin.body.data.accessToken;

    // 2. Cashier login (no cash_accounts.manage / expenses.manage)
    const cashierEmail = `cashier_expenses_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Expense Cashier',
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

  describe('Cash Accounts Treasury Management', () => {
    it('rejects account creation without cash_accounts.manage permission', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cash-accounts')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          name: 'Forbidden Account',
          type: 'CASH',
        });

      expect(res.status).toBe(403);
    });

    it('creates cash drawer account with initial opening balance', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cash-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Cash Counter ${Date.now()}`,
          type: 'CASH',
          initialBalance: 15000,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(Number(res.body.data.balance)).toBe(15000);
      cashAccountId = res.body.data.id;
    });

    it('creates bank account with initial opening balance', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cash-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Bank Current A/C ${Date.now()}`,
          type: 'BANK',
          bankName: 'City Bank Ltd',
          accountNumber: '11099228833',
          initialBalance: 50000,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(Number(res.body.data.balance)).toBe(50000);
      bankAccountId = res.body.data.id;
    });

    it('processes manual cash deposit', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cash-accounts/${cashAccountId}/deposit`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 5000,
          description: 'Owner cash float addition',
        });

      expect(res.status).toBe(200);
      expect(Number(res.body.data.balance)).toBe(20000);
    });

    it('processes manual cash withdrawal', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cash-accounts/${cashAccountId}/withdraw`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 2000,
          description: 'Emergency petty expense advance',
        });

      expect(res.status).toBe(200);
      expect(Number(res.body.data.balance)).toBe(18000);
    });

    it('executes atomic transfer from Cash to Bank account', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cash-accounts/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fromAccountId: cashAccountId,
          toAccountId: bankAccountId,
          amount: 10000,
          notes: 'Daily counter cash deposit to bank',
        });

      expect(res.status).toBe(200);
      expect(Number(res.body.data.fromAccount.balance)).toBe(8000);
      expect(Number(res.body.data.toAccount.balance)).toBe(60000);
    });

    it('retrieves immutable transaction ledger for account', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cash-accounts/${cashAccountId}/transactions`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Expenses & Categories', () => {
    it('creates an expense category', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Store Utilities ${Date.now()}`,
          code: `UTIL_${Date.now().toString().slice(-4)}`,
          description: 'Electricity, Water, and Internet bills',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBeDefined();
      categoryId = res.body.data.id;
    });

    it('rejects expense if account balance is insufficient', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId,
          accountId: cashAccountId, // current balance: 8000
          amount: 999999,
          payee: 'Mega Vendor',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient balance');
    });

    it('records store expense and deducts cash account balance with ledger entry', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId,
          accountId: bankAccountId, // current balance: 60000
          amount: 3500,
          payee: 'DESCO Electricity',
          notes: 'Showroom November electricity bill',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.expenseNumber).toMatch(/^EXP-/);
      expect(Number(res.body.data.amount)).toBe(3500);
      expenseId = res.body.data.id;

      // Verify bank account was decremented from 60000 to 56500
      const bankCheck = await request(app.getHttpServer())
        .get(`/api/v1/cash-accounts/${bankAccountId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(Number(bankCheck.body.data.balance)).toBe(56500);
    });

    it('lists expenses with filters and queries single expense voucher', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/expenses')
        .query({ accountId: bankAccountId })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);
      const found = listRes.body.data.find((e: any) => e.id === expenseId);
      expect(found).toBeDefined();

      const singleRes = await request(app.getHttpServer())
        .get(`/api/v1/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(singleRes.status).toBe(200);
      expect(singleRes.body.data.id).toBe(expenseId);
      expect(singleRes.body.data.category).toBeDefined();
    });
  });
});
