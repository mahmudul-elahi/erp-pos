import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Phase 14 Director / Owner Treasury (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  let cashAccountId: string;
  let directorId: string;

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

    const prisma = app.get(PrismaService);
    await prisma.directorTransaction.deleteMany({});
    await prisma.director.deleteMany({});

    // 1. Super Admin login
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@erppos.local', password: 'AdminPassword123!' });
    adminToken = adminLogin.body.data.accessToken;

    // 2. Cashier login (lacks directors.manage and directors.transaction)
    const cashierEmail = `cashier_directors_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Cashier Directors',
        roleNames: ['cashier'],
      });

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'CashierPassword123!' });
    cashierToken = cashierLogin.body.data.accessToken;

    // 3. Create a clean dedicated Bank Account for director treasury testing
    const accRes = await request(app.getHttpServer())
      .post('/api/v1/cash-accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `City Bank Treasury Account ${Date.now()}`,
        type: 'BANK',
        accountNumber: `BD-CITY-${Date.now().toString().slice(-6)}`,
        bankName: 'City Bank Ltd',
        initialBalance: 50000,
      });
    cashAccountId = accRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Director Profile & Shareholding Management', () => {
    it('rejects director registration without directors.manage permission', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/directors')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          name: 'Shahriar Hossain',
          phone: '+8801700991122',
          sharePercentage: 50,
        });

      expect(res.status).toBe(403);
    });

    it('registers first company director with 60% equity share', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/directors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Managing Director Tariqul',
          phone: `+88017${Math.floor(10000000 + Math.random() * 90000000)}`,
          nid: `NID-${Date.now()}`,
          email: `tariqul_${Date.now()}@directors.local`,
          sharePercentage: 60,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Managing Director Tariqul');
      expect(Number(res.body.data.sharePercentage)).toBe(60);
      expect(Number(res.body.data.totalDeposited)).toBe(0);
      expect(Number(res.body.data.totalWithdrawn)).toBe(0);

      directorId = res.body.data.id;
    });

    it('rejects director registration if cumulative share percentage exceeds 100%', async () => {
      // 60% is already taken by Director Tariqul. 50% would exceed 100%.
      const res = await request(app.getHttpServer())
        .post('/api/v1/directors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Excess Shareholder',
          phone: `+88017${Math.floor(10000000 + Math.random() * 90000000)}`,
          sharePercentage: 50,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('exceed 100%');
    });

    it('lists directors with pagination and search', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/directors?search=Tariqul')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Director Capital Injection & Drawing Transactions', () => {
    it('processes capital injection deposit, crediting bank account and tracking director equity', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/directors/${directorId}/transactions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          accountId: cashAccountId,
          type: 'CAPITAL_DEPOSIT',
          amount: 500000,
          notes: 'Director initial equity capital injection for business expansion',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.directorTransaction.transactionNumber).toMatch(/^DTX-\d{8}-[A-F0-9]{6}$/);
      expect(Number(res.body.data.director.totalDeposited)).toBe(500000);
      // Account balance: initial 50,000 + 500,000 = 550,000
      expect(Number(res.body.data.account.balance)).toBe(550000);
    });

    it('processes owner drawing withdrawal, debiting bank account and tracking director drawings', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/directors/${directorId}/transactions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          accountId: cashAccountId,
          type: 'DRAWING_WITHDRAWAL',
          amount: 150000,
          notes: 'Personal drawing withdrawal',
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.director.totalWithdrawn)).toBe(150000);
      // Account balance: 550,000 - 150,000 = 400,000
      expect(Number(res.body.data.account.balance)).toBe(400000);
    });

    it('rejects drawing withdrawal if target account has insufficient funds', async () => {
      // Current balance: 400,000. Requesting 900,000 should fail.
      const res = await request(app.getHttpServer())
        .post(`/api/v1/directors/${directorId}/transactions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          accountId: cashAccountId,
          type: 'DRAWING_WITHDRAWAL',
          amount: 900000,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient funds');
    });

    it('retrieves paginated audit ledger of director capital & drawing transactions', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/directors/${directorId}/transactions`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data[0].account).toBeDefined();
    });
  });
});
