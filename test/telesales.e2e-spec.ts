import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 12 Telesales & Order Confirmation (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let agentToken: string;
  let agentId: string;
  let warehouseId: string;
  let productId: string;
  let leadId: string;
  let convertedOrderId: string;

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

    // 2. Create and login Telesales Agent user
    const agentEmail = `agent_telesales_${Date.now()}@erppos.local`;
    const userRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: agentEmail,
        password: 'AgentPassword123!',
        name: 'Telesales Executive',
        roleNames: ['branch_manager'],
      });
    agentId = userRes.body.data.id;

    const agentLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: agentEmail, password: 'AgentPassword123!' });
    agentToken = agentLogin.body.data.accessToken;

    // 3. Get Warehouse
    const whRes = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);
    warehouseId = whRes.body.data[0].id;

    // 4. Create Category and Product for order conversion
    const catRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Audio & Sound ${Date.now()}`,
        slug: `audio-sound-${Date.now()}`,
      });
    const categoryId = catRes.body.data.id;

    const prodRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Wireless Earbuds ANC ${Date.now()}`,
        slug: `wireless-earbuds-anc-${Date.now()}`,
        categoryId,
        costPrice: 2000,
        sellingPrice: 3500,
        trackSerial: false,
      });
    productId = prodRes.body.data.id;

    // Stock in products
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        warehouseId,
        reason: 'Opening stock for telesales testing',
        confirmImmediately: true,
        items: [
          {
            productId,
            quantity: 50,
            type: 'INCREASE',
          },
        ],
      });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Telesales Leads Management', () => {
    it('rejects lead creation without authorization token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/telesales/leads')
        .send({
          customerName: 'Nasir Hossain',
          phone: '+8801722334455',
        });

      expect(res.status).toBe(401);
    });

    it('creates a new telesales customer inquiry lead', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/telesales/leads')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          customerName: 'Nasir Hossain',
          phone: '+8801722334455',
          email: 'nasir.hossain@example.com',
          source: 'FACEBOOK',
          address: 'House 45, Road 11, Banani',
          city: 'Dhaka',
          notes: 'Customer interested in buying wireless earbuds with active noise cancellation',
          assignedAgentId: agentId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.leadNumber).toMatch(/^LEAD-\d{8}-[A-F0-9]{6}$/);
      expect(res.body.data.customerName).toBe('Nasir Hossain');
      expect(res.body.data.disposition).toBe('NEW');
      expect(res.body.data.assignedAgentId).toBe(agentId);

      leadId = res.body.data.id;
    });

    it('lists telesales leads with search and disposition filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/telesales/leads?disposition=NEW&search=Nasir')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].customerName).toBe('Nasir Hossain');
    });

    it('retrieves detailed single lead by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/telesales/leads/${leadId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(leadId);
      expect(res.body.data.phone).toBe('+8801722334455');
      expect(Array.isArray(res.body.data.callLogs)).toBe(true);
    });

    it('updates lead information and reassigns disposition', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/telesales/leads/${leadId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          notes: 'Customer confirmed they need 2 units for family members',
          disposition: 'INTERESTED',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.disposition).toBe('INTERESTED');
      expect(res.body.data.notes).toContain('2 units');
    });
  });

  describe('Call Logging & Customer Interaction Tracking', () => {
    it('logs an outbound call and schedules follow-up callback', async () => {
      const callbackTime = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/telesales/leads/${leadId}/calls`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          disposition: 'CALLBACK_REQUESTED',
          callDurationSeconds: 185,
          notes: 'Customer was driving, asked to call back tomorrow afternoon',
          callbackAt: callbackTime,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.callLog.disposition).toBe('CALLBACK_REQUESTED');
      expect(res.body.data.callLog.callDurationSeconds).toBe(185);
      expect(res.body.data.lead.disposition).toBe('CALLBACK_REQUESTED');
    });
  });

  describe('Lead to Fulfillment Order Conversion', () => {
    it('converts confirmed telesales lead directly into fulfillment order', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/telesales/leads/${leadId}/convert-to-order`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          warehouseId,
          shippingCost: 80,
          discountAmount: 200,
          paymentMethod: 'COD',
          items: [
            {
              productId,
              quantity: 2,
              unitPrice: 3500,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lead.disposition).toBe('CONFIRMED');
      expect(res.body.data.lead.convertedOrderId).toBeTruthy();

      const order = res.body.data.order;
      expect(order.source).toBe('TELESALES');
      expect(order.customerName).toBe('Nasir Hossain');
      expect(order.customerPhone).toBe('+8801722334455');
      expect(order.status).toBe('PENDING');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].quantity).toBe(2);

      convertedOrderId = order.id;
    });

    it('rejects duplicate order conversion for an already converted lead', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/telesales/leads/${leadId}/convert-to-order`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          warehouseId,
          items: [{ productId, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already been converted');
    });

    it('verifies converted order is accessible through order endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${convertedOrderId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(convertedOrderId);
      expect(res.body.data.source).toBe('TELESALES');
    });
  });
});
