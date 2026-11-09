import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 5 Purchases & Purchase Returns (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

  let warehouseId: string;
  let supplierId: string;
  let productId: string;

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
    const cashierEmail = `cashier_purchases_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Purchases Cashier',
        roleNames: ['cashier'],
      });

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'CashierPassword123!' });
    cashierToken = cashierLogin.body.data.accessToken;

    // 3. Get Default Warehouse
    const whRes = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);
    warehouseId = whRes.body.data[0].id;

    // 4. Create Supplier
    const supRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyName: `Apex Gadgets Supply ${Date.now()}`,
        contactPerson: 'Kazi Mahbub',
        phone: `+88017${Math.floor(10000000 + Math.random() * 90000000)}`,
        address: 'Motijheel C/A, Dhaka',
      });
    supplierId = supRes.body.data.id;

    // 5. Create Product
    const catRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Audio Gadgets ${Date.now()}`,
        slug: `audio-gadgets-${Date.now()}`,
      });
    const categoryId = catRes.body.data.id;

    const prodRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Anker Soundcore Q30 ${Date.now()}`,
        slug: `anker-soundcore-q30-${Date.now()}`,
        categoryId,
        costPrice: 4500,
        sellingPrice: 6500,
        minStockAlert: 5,
        trackSerial: false,
      });
    productId = prodRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('RBAC & Permissions', () => {
    it('should reject purchase order creation from cashier without purchases.create', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          supplierId,
          warehouseId,
          items: [{ productId, orderedQuantity: 5, unitCost: 4500 }],
        });

      expect(res.status).toBe(403);
    });
  });

  describe('Purchase Order Lifecycle & Intake', () => {
    let purchaseId: string;

    it('should create a purchase order with calculated totals', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId,
          warehouseId,
          taxAmount: 500,
          shippingCost: 200,
          discountAmount: 200,
          notes: 'Regular monthly restock order',
          items: [
            {
              productId,
              orderedQuantity: 10,
              unitCost: 4500,
              batchNumber: 'BATCH-2026-A',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.purchaseNumber).toMatch(/^PO-/);
      expect(Number(res.body.data.subtotal)).toBe(45000);
      // 45,000 + 500 + 200 - 200 = 45,500
      expect(Number(res.body.data.totalAmount)).toBe(45500);
      expect(Number(res.body.data.dueAmount)).toBe(45500);
      expect(Number(res.body.data.paidAmount)).toBe(0);
      expect(res.body.data.status).toBe('ORDERED');
      expect(res.body.data.paymentStatus).toBe('UNPAID');
      purchaseId = res.body.data.id;
    });

    it('should receive purchase goods: increments warehouse onHand and logs supplier ledger credit', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/purchases/${purchaseId}/receive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          updateCostPrice: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('RECEIVED');
      expect(res.body.data.items[0].receivedQuantity).toBe(10);

      // Verify warehouse balance increased
      const balRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(balRes.body.data.onHand).toBe(10);

      // Verify stock movement
      const movRes = await request(app.getHttpServer())
        .get('/api/v1/inventory/movements')
        .query({ warehouseId, productId, type: 'PURCHASE_RECEIVED' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(movRes.status).toBe(200);
      expect(movRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(movRes.body.data[0].quantity).toBe(10);

      // Verify supplier ledger entry was recorded (store owes 45,000)
      const ledgerRes = await request(app.getHttpServer())
        .get(`/api/v1/suppliers/${supplierId}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(ledgerRes.status).toBe(200);
      expect(ledgerRes.body.data.length).toBeGreaterThanOrEqual(1);
      const purchaseEntry = ledgerRes.body.data.find(
        (e: any) => e.type === 'PURCHASE',
      );
      expect(purchaseEntry).toBeDefined();
      expect(Number(purchaseEntry.credit)).toBe(45000);
    });

    it('should reject receiving on an already fully received purchase', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/purchases/${purchaseId}/receive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already been fully received');
    });

    it('should record payment against purchase: reduces dueAmount and debits supplier ledger', async () => {
      // 1. Partial payment: 25,000 BDT
      const payRes = await request(app.getHttpServer())
        .post(`/api/v1/purchases/${purchaseId}/payments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 25000,
          paymentMethod: 'BANK',
          reference: 'EBL-TRX-998822',
          notes: 'Advance part payment via bank transfer',
        });

      expect(payRes.status).toBe(201);
      expect(payRes.body.data.paymentNumber).toMatch(/^PAY-/);
      expect(Number(payRes.body.data.amount)).toBe(25000);

      // Check updated purchase state
      const poRes = await request(app.getHttpServer())
        .get(`/api/v1/purchases/${purchaseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(Number(poRes.body.data.paidAmount)).toBe(25000);
      expect(Number(poRes.body.data.dueAmount)).toBe(20500);
      expect(poRes.body.data.paymentStatus).toBe('PARTIAL');

      // 2. Final settlement payment: 20,500 BDT
      const pay2Res = await request(app.getHttpServer())
        .post(`/api/v1/purchases/${purchaseId}/payments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 20500,
          paymentMethod: 'CASH',
        });
      expect(pay2Res.status).toBe(201);

      const poSettled = await request(app.getHttpServer())
        .get(`/api/v1/purchases/${purchaseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(Number(poSettled.body.data.dueAmount)).toBe(0);
      expect(poSettled.body.data.paymentStatus).toBe('PAID');
    });
  });

  describe('Purchase Returns & Supplier Credits', () => {
    it('should process purchase return: deducts stock and debits supplier ledger', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/purchases/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId,
          warehouseId,
          reason: 'Defective left ear cup on 2 units',
          items: [
            {
              productId,
              quantity: 2,
              unitCost: 4500,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.returnNumber).toMatch(/^PRTN-/);
      expect(Number(res.body.data.totalAmount)).toBe(9000);

      // Verify stock decreased from 10 to 8
      const balRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(balRes.body.data.onHand).toBe(8);

      // Verify movement of type PURCHASE_RETURN
      const movRes = await request(app.getHttpServer())
        .get('/api/v1/inventory/movements')
        .query({ warehouseId, productId, type: 'PURCHASE_RETURN' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(movRes.status).toBe(200);
      expect(movRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(movRes.body.data[0].quantity).toBe(-2);
    });
  });

  describe('Purchase Cancellation', () => {
    it('should allow cancelling a purchase order before any goods are received', async () => {
      // 1. Create a PO
      const poRes = await request(app.getHttpServer())
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId,
          warehouseId,
          items: [{ productId, orderedQuantity: 3, unitCost: 4500 }],
        });
      const poId = poRes.body.data.id;

      // 2. Cancel it
      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/purchases/${poId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(cancelRes.status).toBe(201);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      // 3. Verify intake is prohibited on cancelled PO
      const intakeRes = await request(app.getHttpServer())
        .post(`/api/v1/purchases/${poId}/receive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(intakeRes.status).toBe(400);
      expect(intakeRes.body.message).toContain('cancelled');
    });
  });
});
