import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 15 Reports, Dashboards & Financial Reconciliation (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

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

    // 2. Cashier login (lacks reports.view and dashboard.view permissions)
    const cashierEmail = `cashier_reports_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Cashier Reports',
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

  describe('Financial Reports & Reconciliation', () => {
    it('rejects access to financial reports without reports.view permission', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/profit-and-loss')
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(res.status).toBe(403);
    });

    it('generates Profit & Loss (P&L) financial statement', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/profit-and-loss')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.revenue).toBeDefined();
      expect(typeof res.body.data.revenue.grossSalesRevenue).toBe('number');
      expect(typeof res.body.data.costOfGoodsSold).toBe('number');
      expect(typeof res.body.data.grossProfit).toBe('number');
      expect(typeof res.body.data.operatingExpenses).toBe('number');
      expect(typeof res.body.data.netProfit).toBe('number');
    });

    it('generates inventory stock valuation report at cost and retail selling prices', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/inventory-valuation')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary).toBeDefined();
      expect(typeof res.body.data.summary.totalItemsOnHand).toBe('number');
      expect(typeof res.body.data.summary.totalCostValuation).toBe('number');
      expect(typeof res.body.data.summary.totalRetailValuation).toBe('number');
      expect(Array.isArray(res.body.data.warehouseBreakdown)).toBe(true);
    });

    it('generates sales breakdown report across POS, E-Commerce, and Telesales channels', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/sales-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.data.totalRevenue).toBe('number');
      expect(typeof res.body.data.totalTransactions).toBe('number');
      expect(res.body.data.channels.pos).toBeDefined();
      expect(res.body.data.channels.ecommerce).toBeDefined();
      expect(res.body.data.channels.telesales).toBeDefined();
    });

    it('generates cash register shift discrepancy audit report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/register-discrepancies')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary).toBeDefined();
      expect(typeof res.body.data.summary.totalShiftsAudited).toBe('number');
      expect(Array.isArray(res.body.data.discrepancies)).toBe(true);
    });
  });

  describe('Executive Operational Dashboard', () => {
    it('rejects access to dashboard metrics without dashboard.view permission', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/metrics')
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(res.status).toBe(403);
    });

    it('retrieves real-time executive dashboard KPI metrics and treasury liquidity', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Today sales and orders
      expect(res.body.data.today).toBeDefined();
      expect(typeof res.body.data.today.totalRevenue).toBe('number');

      // Operations
      expect(res.body.data.operations).toBeDefined();
      expect(typeof res.body.data.operations.pendingOrdersToDispatch).toBe('number');
      expect(typeof res.body.data.operations.lowStockItemsAlertCount).toBe('number');
      expect(typeof res.body.data.operations.activeWarrantyClaimsCount).toBe('number');

      // Treasury liquidity
      expect(res.body.data.treasury).toBeDefined();
      expect(typeof res.body.data.treasury.cashOnHand).toBe('number');
      expect(typeof res.body.data.treasury.bankBalance).toBe('number');
      expect(typeof res.body.data.treasury.totalLiquidity).toBe('number');
    });
  });
});
