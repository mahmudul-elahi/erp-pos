import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 7 E-commerce Orders & State Workflow (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

  let warehouseId: string;
  let productId: string;
  let orderId: string;

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
    const cashierEmail = `cashier_orders_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Orders Cashier',
        roleNames: ['cashier'],
      });

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'CashierPassword123!' });
    cashierToken = cashierLogin.body.data.accessToken;
    expect(cashierToken).toBeDefined();

    // 3. Get Warehouse
    const whRes = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);
    warehouseId = whRes.body.data[0].id;

    // 4. Create Product with initial stock of 10 units
    const catRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Audio Devices ${Date.now()}`,
        slug: `audio-devices-${Date.now()}`,
      });
    const categoryId = catRes.body.data.id;

    const prodRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Bluetooth Speaker ${Date.now()}`,
        slug: `bluetooth-speaker-${Date.now()}`,
        categoryId,
        costPrice: 1800,
        sellingPrice: 3200,
        minStockAlert: 3,
        trackSerial: false,
      });
    productId = prodRes.body.data.id;

    // Add 10 units to warehouse
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        warehouseId,
        reason: 'Opening stock for e-commerce testing',
        confirmImmediately: true,
        items: [{ productId, quantity: 10, type: 'INCREASE' }],
      });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Order Intake', () => {
    it('should create an e-commerce order with PENDING status and calculated totals', async () => {
      // 2 speakers @ 3200 = 6400 + 120 shipping = 6520
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseId,
          customerName: 'Jashim Uddin',
          customerPhone: '+8801755443322',
          customerEmail: 'jashim@example.com',
          shippingAddress: 'House 5, Road 2, Dhanmondi, Dhaka',
          shippingCity: 'Dhaka',
          shippingZone: 'Dhanmondi',
          shippingCost: 120,
          paymentMethod: 'COD',
          source: 'WEBSITE',
          items: [{ productId, quantity: 2 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.orderNumber).toMatch(/^ORD-/);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.paymentStatus).toBe('UNPAID');
      expect(Number(res.body.data.subtotal)).toBe(6400);
      expect(Number(res.body.data.totalAmount)).toBe(6520);
      expect(Number(res.body.data.dueAmount)).toBe(6520);
      expect(res.body.data.isReserved).toBe(false);
      expect(res.body.data.isStockDeducted).toBe(false);

      orderId = res.body.data.id;
    });
  });

  describe('State Machine Transitions & Inventory Lifecycle', () => {
    it('should reject invalid transition (PENDING -> SHIPPED directly)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SHIPPED' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid status transition');
    });

    it('should transition PENDING -> CONFIRMED and reserve stock (2 units reserved)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'CONFIRMED',
          reason: 'Phone verification completed with customer',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.isReserved).toBe(true);

      // Verify inventory balance: onHand = 10, reserved = 2
      const balRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(balRes.body.data.onHand).toBe(10);
      expect(balRes.body.data.reserved).toBe(2);
    });

    it('should record partial advance payment (120 BDT delivery fee via bKash)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 120,
          paymentMethod: 'BKASH',
          transactionId: 'BKASH-ADV-998811',
          notes: 'Advance courier fee received via bKash merchant',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.paymentNumber).toMatch(/^OPAY-/);

      // Verify order payment status
      const ordRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(Number(ordRes.body.data.paidAmount)).toBe(120);
      expect(Number(ordRes.body.data.dueAmount)).toBe(6400);
      expect(ordRes.body.data.paymentStatus).toBe('PARTIAL_PAID');
    });

    it('should transition CONFIRMED -> PROCESSING -> READY_TO_SHIP', async () => {
      // 1. PROCESSING
      const procRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PROCESSING', notes: 'Item picked from shelf A3' });
      expect(procRes.status).toBe(200);
      expect(procRes.body.data.status).toBe('PROCESSING');

      // 2. READY_TO_SHIP
      const rtsRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'READY_TO_SHIP', notes: 'Packaged in bubble wrap' });
      expect(rtsRes.status).toBe(200);
      expect(rtsRes.body.data.status).toBe('READY_TO_SHIP');
    });

    it('should transition READY_TO_SHIP -> SHIPPED: releases reservation and deducts stock', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'SHIPPED',
          courierName: 'Steadfast',
          courierTrackingCode: 'ST-55667788',
          notes: 'Handed over to Steadfast pickup rider',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SHIPPED');
      expect(res.body.data.isReserved).toBe(false);
      expect(res.body.data.isStockDeducted).toBe(true);
      expect(res.body.data.courierName).toBe('Steadfast');

      // Verify inventory balance: reserved = 0, onHand drops from 10 to 8
      const balRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(balRes.body.data.reserved).toBe(0);
      expect(balRes.body.data.onHand).toBe(8);

      // Verify stock movement
      const movRes = await request(app.getHttpServer())
        .get('/api/v1/inventory/movements')
        .query({ warehouseId, productId, type: 'SALE' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(movRes.status).toBe(200);
      expect(movRes.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should transition SHIPPED -> DELIVERED: marks order delivered and settles COD payment', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'DELIVERED',
          notes: 'Steadfast webhook: parcel delivered successfully',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DELIVERED');
      expect(res.body.data.paymentStatus).toBe('PAID');
      expect(Number(res.body.data.dueAmount)).toBe(0);
      expect(Number(res.body.data.paidAmount)).toBe(6520);
    });
  });

  describe('Order Cancellation & Reservation Release', () => {
    it('should place second order, confirm (reserve stock), and release reservation on cancellation', async () => {
      // 1. Create Order
      const ordRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseId,
          customerName: 'Ashiqur Rahman',
          customerPhone: '+8801911223344',
          shippingAddress: 'Mirpur 10, Dhaka',
          items: [{ productId, quantity: 3 }],
        });
      const ord2Id = ordRes.body.data.id;

      // 2. Confirm order -> reserves 3 units (reserved: 0 -> 3)
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${ord2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CONFIRMED' });

      let balRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(balRes.body.data.reserved).toBe(3);

      // 3. Cancel order -> releases reservation (reserved: 3 -> 0)
      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${ord2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CANCELLED', reason: 'Customer changed mind before dispatch' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
      expect(cancelRes.body.data.isReserved).toBe(false);

      balRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/balances/${warehouseId}/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(balRes.body.data.reserved).toBe(0);
      expect(balRes.body.data.onHand).toBe(8); // onHand was untouched
    });
  });
});
