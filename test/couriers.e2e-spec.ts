import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 8 Courier Integrations (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

  let warehouseId: string;
  let productId: string;
  let orderId: string;
  let shipmentId: string;
  let consignmentId: string;
  let trackingCode: string;

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

    // 2. Login Cashier (has no couriers.manage permission)
    const cashierEmail = `cashier_couriers_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Courier Cashier',
        roleNames: ['cashier'],
      });

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'CashierPassword123!' });
    cashierToken = cashierLogin.body.data.accessToken;

    // 3. Get Warehouse
    const whRes = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);
    warehouseId = whRes.body.data[0].id;

    // 4. Create Category, Product & Add Stock
    const catRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Chargers ${Date.now()}`,
        slug: `chargers-${Date.now()}`,
      });
    const categoryId = catRes.body.data.id;

    const prodRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Fast Charger 65W ${Date.now()}`,
        slug: `fast-charger-65w-${Date.now()}`,
        categoryId,
        costPrice: 400,
        sellingPrice: 850,
        trackSerial: false,
      });
    productId = prodRes.body.data.id;

    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        warehouseId,
        reason: 'Courier Test Stock In',
        confirmImmediately: true,
        items: [{ productId, quantity: 20, type: 'INCREASE' }],
      });

    // 5. Create Order
    const ordRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        warehouseId,
        customerName: 'Tanvir Ahmed',
        customerPhone: '+8801755112233',
        shippingAddress: 'Mirpur 10, Dhaka',
        shippingCity: 'Dhaka',
        paymentMethod: 'COD',
        items: [{ productId, quantity: 1, unitPrice: 850 }],
      });
    orderId = ordRes.body.data.id;

    // Confirm order (reserves inventory)
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CONFIRMED', reason: 'Confirmed by agent' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects dispatch without couriers.manage permission', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/couriers/shipments')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        orderId,
        provider: 'STEADFAST',
      });

    expect(res.status).toBe(403);
  });

  it('successfully creates and dispatches shipment via Steadfast adapter', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/couriers/shipments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId,
        provider: 'STEADFAST',
        recipientCity: 'Dhaka',
        deliveryFee: 70,
        notes: 'Handle fragile packaging',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.provider).toBe('STEADFAST');
    expect(res.body.data.shipmentNumber).toMatch(/^SHIP-/);
    expect(res.body.data.consignmentId).toBeDefined();
    expect(res.body.data.trackingCode).toBeDefined();
    expect(Number(res.body.data.deliveryFee)).toBe(70);

    shipmentId = res.body.data.id;
    consignmentId = res.body.data.consignmentId;
    trackingCode = res.body.data.trackingCode;

    // Verify order was transitioned to SHIPPED
    const ordCheck = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(ordCheck.body.data.status).toBe('SHIPPED');
    expect(ordCheck.body.data.courierName).toBe('STEADFAST');
    expect(ordCheck.body.data.courierTrackingCode).toBe(trackingCode);
  });

  it('lists courier shipments with filters', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/couriers/shipments')
      .query({ provider: 'STEADFAST' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const found = res.body.data.find((s: any) => s.id === shipmentId);
    expect(found).toBeDefined();
  });

  it('retrieves single shipment by ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/couriers/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(shipmentId);
    expect(res.body.data.order).toBeDefined();
  });

  it('tracks shipment in real-time', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/couriers/shipments/${shipmentId}/track`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.shipmentId).toBe(shipmentId);
    expect(res.body.data.status).toBeDefined();
  });

  it('processes inbound webhook and transitions order to DELIVERED with automatic COD settlement', async () => {
    const webhookRes = await request(app.getHttpServer())
      .post('/api/v1/couriers/webhooks/STEADFAST')
      .send({
        consignment_id: consignmentId,
        tracking_code: trackingCode,
        status: 'delivered',
      });

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.data.success).toBe(true);
    expect(webhookRes.body.data.newStatus).toBe('DELIVERED');

    // Verify order is DELIVERED and COD payment was automatically processed
    const ordCheck = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(ordCheck.body.data.status).toBe('DELIVERED');
    expect(ordCheck.body.data.paymentStatus).toBe('PAID');
    expect(Number(ordCheck.body.data.dueAmount)).toBe(0);
    expect(ordCheck.body.data.payments.length).toBeGreaterThan(0);
  });
});
