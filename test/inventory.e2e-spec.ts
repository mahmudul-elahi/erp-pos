import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 4 Inventory Engine (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

  let warehouseAId: string;
  let warehouseBId: string;
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
    const cashierEmail = `cashier_inv_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Inventory Cashier',
        roleNames: ['cashier'],
      });

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'CashierPassword123!' });
    cashierToken = cashierLogin.body.data.accessToken;

    // 3. Fetch default Warehouse A (WH-MAIN)
    const whRes = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);
    warehouseAId = whRes.body.data[0].id;

    // 4. Create Warehouse B
    const whBRes = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Dhanmondi Branch Warehouse',
        code: `WH-DHAN-${Date.now()}`,
        location: 'Dhanmondi 27, Dhaka',
      });
    warehouseBId = whBRes.body.data.id;

    // 5. Create a test category and product
    const catRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Charging Gadgets ${Date.now()}`,
        slug: `charging-gadgets-${Date.now()}`,
      });
    const categoryId = catRes.body.data.id;

    const prodRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Anker 65W GaN Charger ${Date.now()}`,
        slug: `anker-65w-gan-${Date.now()}`,
        categoryId,
        costPrice: 2800,
        sellingPrice: 3800,
        minStockAlert: 15,
        trackSerial: false,
      });
    productId = prodRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('RBAC & Permissions', () => {
    it('should reject stock adjustments without inventory.manage permission (cashier)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          warehouseId: warehouseAId,
          reason: 'Unauthorized stock injection attempt',
          items: [{ productId, quantity: 10, type: 'INCREASE' }],
        });

      expect(res.status).toBe(403);
    });
  });

  describe('Stock Adjustments & Balances', () => {
    it('should create and immediately confirm stock adjustment (+20 units)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseId: warehouseAId,
          reason: 'Initial physical stock count',
          confirmImmediately: true,
          items: [
            {
              productId,
              quantity: 20,
              type: 'INCREASE',
              reason: 'Opening audit intake',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.items).toHaveLength(1);
    });

    it('should verify balance is 20 in Warehouse A and movement record exists', async () => {
      const balRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseAId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(balRes.status).toBe(200);
      expect(balRes.body.data.onHand).toBe(20);

      const movRes = await request(app.getHttpServer())
        .get('/api/v1/inventory/movements')
        .query({ warehouseId: warehouseAId, productId })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(movRes.status).toBe(200);
      expect(movRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(movRes.body.data[0].balanceBefore).toBe(0);
      expect(movRes.body.data[0].balanceAfter).toBe(20);
      expect(movRes.body.data[0].type).toBe('ADJUSTMENT_IN');
    });

    it('should reject adjustment that would cause negative stock balance', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseId: warehouseAId,
          reason: 'Overselling reduction attempt',
          confirmImmediately: true,
          items: [
            {
              productId,
              quantity: 35, // Only 20 available!
              type: 'DECREASE',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient stock');
    });
  });

  describe('Stock Transfers Lifecycle', () => {
    let transferId: string;

    it('should reject transfer when source and destination are identical', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceWarehouseId: warehouseAId,
          destinationWarehouseId: warehouseAId,
          items: [{ productId, quantity: 5 }],
        });

      expect(res.status).toBe(400);
    });

    it('should create transfer draft (10 units from A to B)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceWarehouseId: warehouseAId,
          destinationWarehouseId: warehouseBId,
          notes: 'Transfer batch to Dhanmondi outlet',
          items: [{ productId, quantity: 10 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.transferNumber).toMatch(/^TRF-/);
      transferId = res.body.data.id;
    });

    it('should dispatch transfer: source onHand decreases to 10, destination inTransit increases to 10', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inventory/transfers/${transferId}/dispatch`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DISPATCHED');

      // Check source balance
      const sourceBal = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseAId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(sourceBal.body.data.onHand).toBe(10);

      // Check destination balance
      const destBal = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseBId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(destBal.body.data.onHand).toBe(0);
      expect(destBal.body.data.inTransit).toBe(10);
    });

    it('should receive transfer: destination inTransit drops to 0, destination onHand increases to 10', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inventory/transfers/${transferId}/receive`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('RECEIVED');

      const destBal = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseBId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(destBal.body.data.onHand).toBe(10);
      expect(destBal.body.data.inTransit).toBe(0);
    });

    it('should reject cancelling an already received transfer', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inventory/transfers/${transferId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already received');
    });

    it('should cancel dispatched transfer and restore stock back to source warehouse', async () => {
      // 1. Create second transfer (5 units from A to B)
      const trf2Res = await request(app.getHttpServer())
        .post('/api/v1/inventory/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceWarehouseId: warehouseAId,
          destinationWarehouseId: warehouseBId,
          items: [{ productId, quantity: 5 }],
        });
      const trf2Id = trf2Res.body.data.id;

      // 2. Dispatch: A onHand becomes 10 - 5 = 5, B inTransit becomes 5
      await request(app.getHttpServer())
        .post(`/api/v1/inventory/transfers/${trf2Id}/dispatch`)
        .set('Authorization', `Bearer ${adminToken}`);

      let srcBal = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseAId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(srcBal.body.data.onHand).toBe(5);

      // 3. Cancel transfer
      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/inventory/transfers/${trf2Id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(cancelRes.status).toBe(201);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      // 4. Verify A onHand restored to 10 and B inTransit back to 0
      srcBal = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseAId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(srcBal.body.data.onHand).toBe(10);

      const destBal = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseBId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(destBal.body.data.inTransit).toBe(0);
    });
  });

  describe('Damaged Products Write-off', () => {
    it('should write off damaged items, reduce onHand stock and record damage audit', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/damage')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseId: warehouseAId,
          productId,
          quantity: 2,
          reason: 'Packaging damaged by water leakage in warehouse rack',
          actionTaken: 'WRITTEN_OFF',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.damageNumber).toMatch(/^DAM-/);
      expect(res.body.data.quantity).toBe(2);

      // Check onHand decreased from 10 to 8
      const balRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseAId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(balRes.body.data.onHand).toBe(8);

      // Check movement
      const movRes = await request(app.getHttpServer())
        .get('/api/v1/inventory/movements')
        .query({ warehouseId: warehouseAId, productId, type: 'DAMAGED' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(movRes.status).toBe(200);
      expect(movRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(movRes.body.data[0].quantity).toBe(-2);
    });
  });

  describe('Low Stock Alerts', () => {
    it('should flag product in low stock alerts when onHand is at or below minStockAlert', async () => {
      // minStockAlert was set to 15, current onHand in warehouseA is 8
      const res = await request(app.getHttpServer())
        .get('/api/v1/inventory/low-stock')
        .query({ warehouseId: warehouseAId })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const matched = res.body.data.find(
        (item: any) => item.product.id === productId,
      );
      expect(matched).toBeDefined();
      expect(matched.onHand).toBe(8);
      expect(matched.product.minStockAlert).toBe(15);
    });
  });
});
