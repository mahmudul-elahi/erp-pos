import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 11 Gadget-Specific Workflows (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

  let warehouseId: string;
  let branchId: string;
  let primaryProductId: string;
  let giftProductId: string;
  let buybackId: string;
  let warrantyClaimId: string;
  const testSerial = `SN-GDG-${Date.now()}`;

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

    // 2. Cashier login
    const cashierEmail = `cashier_gadgets_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Gadget Cashier',
        roleNames: ['cashier'],
      });

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'CashierPassword123!' });
    cashierToken = cashierLogin.body.data.accessToken;

    // 3. Get Warehouse and Branch
    const whRes = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);
    warehouseId = whRes.body.data[0].id;

    const brRes = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${adminToken}`);
    branchId = brRes.body.data[0].id;

    // 4. Create Category & Products
    const catRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Flagships ${Date.now()}`,
        slug: `flagships-${Date.now()}`,
      });
    const categoryId = catRes.body.data.id;

    // Serialized primary gadget with 12 months warranty
    const p1Res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Pixel 9 Pro ${Date.now()}`,
        slug: `pixel-9-pro-${Date.now()}`,
        categoryId,
        costPrice: 75000,
        sellingPrice: 95000,
        trackSerial: true,
        warrantyMonths: 12,
        warrantyPolicy: '1 Year Full Official Replacement Warranty',
      });
    primaryProductId = p1Res.body.data.id;

    // Free gift product
    const p2Res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Original 30W Power Adapter ${Date.now()}`,
        slug: `original-30w-adapter-${Date.now()}`,
        categoryId,
        costPrice: 800,
        sellingPrice: 1500,
        trackSerial: false,
      });
    giftProductId = p2Res.body.data.id;

    // Stock in primary product
    const adjRes = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        warehouseId,
        reason: 'Opening stock for gadget testing',
        confirmImmediately: true,
        items: [
          {
            productId: primaryProductId,
            quantity: 1,
            type: 'INCREASE',
            serialNumbers: [testSerial],
          },
        ],
      });
    if (adjRes.status !== 201) {
      console.error('Adjustment error body:', JSON.stringify(adjRes.body));
    }
    expect(adjRes.status).toBe(201);

    // Process a POS sale of this serialized gadget
    // First open register shift
    await request(app.getHttpServer())
      .post('/api/v1/sales/shifts/open')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ branchId, openingCashFloat: 5000 });

    const saleRes = await request(app.getHttpServer())
      .post('/api/v1/sales/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        branchId,
        warehouseId,
        items: [
          {
            productId: primaryProductId,
            quantity: 1,
            unitPrice: 95000,
            serialNumbers: [testSerial],
          },
        ],
        payments: [{ method: 'CASH', amount: 95000 }],
      });
    expect(saleRes.status).toBe(201);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Device Buybacks & Used Devices Intake', () => {
    it('creates public device buyback request with PENDING status', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/gadgets/buybacks')
        .send({
          customerName: 'Shakib Al Hasan',
          customerPhone: '+8801799887766',
          deviceBrand: 'Apple',
          deviceModel: 'iPhone 13 128GB Blue',
          imei: '358991122334455',
          condition: 'GOOD',
          batteryHealth: 88,
          hasBox: true,
          hasCharger: true,
          expectedPrice: 52000,
          notes: 'Minor micro-scratches on side frame, screen spotless',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.requestNumber).toMatch(/^BBK-/);
      expect(res.body.data.status).toBe('PENDING');
      buybackId = res.body.data.id;
    });

    it('rejects buyback status update without gadgets.buyback_manage permission', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/gadgets/buybacks/${buybackId}/status`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          status: 'ACCEPTED',
          offeredPrice: 49000,
        });

      expect(res.status).toBe(403);
    });

    it('updates buyback status, condition, and offers store purchase price', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/gadgets/buybacks/${buybackId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'ACCEPTED',
          condition: 'GOOD',
          offeredPrice: 49000,
          notes: 'Inspected by lab technician. Display and FaceID genuine.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACCEPTED');
      expect(Number(res.body.data.offeredPrice)).toBe(49000);
      expect(res.body.data.inspectedBy).toBeDefined();
    });

    it('lists buyback requests with filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/gadgets/buybacks')
        .query({ status: 'ACCEPTED' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((b: any) => b.id === buybackId);
      expect(found).toBeDefined();
    });
  });

  describe('Device Verification & IMEI Lookup', () => {
    it('verifies genuine device origin, purchase invoice, and active warranty status by serial/IMEI', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/gadgets/verification/${testSerial}`);

      expect(res.status).toBe(200);
      expect(res.body.data.verified).toBe(true);
      expect(res.body.data.isSoldByStore).toBe(true);
      expect(res.body.data.deviceIdentifier).toBe(testSerial);
      expect(res.body.data.warranty.status).toBe('ACTIVE');
      expect(res.body.data.warranty.isWarrantyActive).toBe(true);
      expect(res.body.data.purchaseInfo.invoiceNumber).toMatch(/^INV-/);
    });

    it('returns unverified for unknown or unregistered serial number', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/gadgets/verification/FAKE-SERIAL-000000');

      expect(res.status).toBe(200);
      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.isSoldByStore).toBe(false);
    });
  });

  describe('Warranty Claims Lifecycle', () => {
    it('creates warranty ticket, automatically resolving sold gadget and invoice', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/gadgets/warranty-claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Shakib Al Hasan',
          customerPhone: '+8801799887766',
          serialNumber: testSerial,
          problemSummary: 'Bottom speaker volume output is very low and distorted',
          notes: 'Customer brought device to Dhanmondi showroom',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.claimNumber).toMatch(/^WCLM-/);
      expect(res.body.data.status).toBe('RECEIVED');
      expect(res.body.data.product).toBeDefined();
      expect(res.body.data.sale).toBeDefined();
      warrantyClaimId = res.body.data.id;
    });

    it('updates warranty claim to REPAIRED with technician notes and repair cost', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/gadgets/warranty-claims/${warrantyClaimId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'REPAIRED',
          technicianNotes: 'Speaker mesh cleaned and speaker acoustic module replaced',
          repairCost: 1200,
          completedDate: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REPAIRED');
      expect(Number(res.body.data.repairCost)).toBe(1200);
      expect(res.body.data.technicianNotes).toContain('Speaker');
    });

    it('queries warranty claim details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/gadgets/warranty-claims/${warrantyClaimId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(warrantyClaimId);
      expect(res.body.data.serialNumber).toBe(testSerial);
    });
  });

  describe('Gift Bundles', () => {
    it('creates and lists promotional gadget gift bundles', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/gadgets/gift-bundles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Pixel 9 Pro Free 30W Charger Bundle',
          description: 'Get an original 30W charger adapter completely free with Pixel 9 Pro',
          items: [
            {
              primaryProductId,
              giftProductId,
              giftQuantity: 1,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toContain('Pixel 9 Pro');
      expect(res.body.data.items.length).toBe(1);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/gadgets/gift-bundles');

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.data.length).toBeGreaterThan(0);
    });
  });
});
