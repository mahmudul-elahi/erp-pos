import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 13 Partner Network (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  let priceTierId: string;
  let partnerId: string;

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

    // 2. Cashier login (lacks partners.manage permission)
    const cashierEmail = `cashier_partner_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Cashier Partner',
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

  describe('Wholesale Price Tiers', () => {
    it('rejects price tier creation without partners.manage permission', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/partners/price-tiers')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          name: `Platinum Tier ${Date.now()}`,
          discountPercentage: 18,
        });

      expect(res.status).toBe(403);
    });

    it('creates wholesale price tier', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/partners/price-tiers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Authorized Dealer Tier ${Date.now()}`,
          discountPercentage: 15,
          description: '15% wholesale discount for authorized tech dealers',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.discountPercentage)).toBe(15);

      priceTierId = res.body.data.id;
    });

    it('lists all wholesale price tiers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/partners/price-tiers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((t: any) => t.id === priceTierId)).toBe(true);
    });
  });

  describe('Partner Onboarding & Account Management', () => {
    it('onboards new partner with price tier and credit limit', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/partners')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          companyName: `Apex Electronics Ltd ${Date.now()}`,
          contactPerson: 'Monirul Islam',
          phone: `+88018${Math.floor(10000000 + Math.random() * 90000000)}`,
          email: `apex_${Date.now()}@partner.local`,
          address: 'Shop 102, Multiplan Computer City, New Elephant Road',
          city: 'Dhaka',
          type: 'DEALER',
          priceTierId,
          creditLimit: 100000,
          tradeLicense: 'TR-DH-2026-9921',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.partnerNumber).toMatch(/^PTR-\d{8}-[A-F0-9]{6}$/);
      expect(res.body.data.status).toBe('APPROVED');
      expect(Number(res.body.data.creditLimit)).toBe(100000);
      expect(Number(res.body.data.outstandingBalance)).toBe(0);

      partnerId = res.body.data.id;
    });

    it('lists partners with pagination and search', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/partners?type=DEALER&search=Apex')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('calculates wholesale pricing for partner based on tier', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/partners/${partnerId}/wholesale-price?basePrice=20000`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.basePrice).toBe(20000);
      expect(res.body.data.discountPercentage).toBe(15);
      expect(res.body.data.discountAmount).toBe(3000);
      expect(res.body.data.finalPrice).toBe(17000);
    });
  });

  describe('Partner Credit Ledger & Balance Management', () => {
    it('records wholesale invoice and increases partner outstanding balance', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/partners/${partnerId}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'INVOICE',
          amount: 40000,
          referenceType: 'WHOLESALE_ORDER',
          referenceId: 'INV-WH-1001',
          notes: 'Invoice for 5 units of flagship devices',
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.partner.outstandingBalance)).toBe(40000);
      expect(Number(res.body.data.entry.balanceBefore)).toBe(0);
      expect(Number(res.body.data.entry.balanceAfter)).toBe(40000);
    });

    it('rejects invoice when requested amount exceeds credit limit', async () => {
      // Current balance: 40,000. Limit: 100,000. Requesting 70,000 would exceed limit (110,000 > 100,000).
      const res = await request(app.getHttpServer())
        .post(`/api/v1/partners/${partnerId}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'INVOICE',
          amount: 70000,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Credit limit');
    });

    it('records partner payment and decreases outstanding balance', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/partners/${partnerId}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'PAYMENT',
          amount: 25000,
          referenceType: 'BANK_TRANSFER',
          referenceId: 'TXN-EBL-887711',
          notes: 'Partial payment received via Eastern Bank',
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.partner.outstandingBalance)).toBe(15000);
      expect(Number(res.body.data.entry.balanceBefore)).toBe(40000);
      expect(Number(res.body.data.entry.balanceAfter)).toBe(15000);
    });

    it('retrieves paginated transaction ledger entries for partner', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/partners/${partnerId}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });
});
