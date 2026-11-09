import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 10 Marketing & Storefront Admin (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

  let productId: string;
  let reviewId: string;

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
    const cashierEmail = `cashier_marketing_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Marketing Cashier',
        roleNames: ['cashier'],
      });

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: cashierEmail, password: 'CashierPassword123!' });
    cashierToken = cashierLogin.body.data.accessToken;

    // 3. Create Product for Review tests
    const catRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Wearables ${Date.now()}`,
        slug: `wearables-${Date.now()}`,
      });
    const categoryId = catRes.body.data.id;

    const prodRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Smartwatch Ultra ${Date.now()}`,
        slug: `smartwatch-ultra-${Date.now()}`,
        categoryId,
        costPrice: 2500,
        sellingPrice: 4500,
        trackSerial: false,
      });
    productId = prodRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Coupons Management', () => {
    it('rejects coupon creation without marketing.manage permission', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/marketing/coupons')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          code: 'FORBIDDEN10',
          value: 10,
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-12-31T00:00:00Z',
        });

      expect(res.status).toBe(403);
    });

    it('creates a percentage coupon with min spend and max discount cap', async () => {
      const couponCode = `EID${Date.now().toString().slice(-4)}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/marketing/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: couponCode,
          type: 'PERCENTAGE',
          value: 20,
          minOrderAmount: 1500,
          maxDiscountAmount: 600,
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-12-31T23:59:59Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe(couponCode);
      expect(Number(res.body.data.value)).toBe(20);

      // Validate: Subtotal 2000 -> 20% = 400
      const validRes1 = await request(app.getHttpServer())
        .post('/api/v1/marketing/coupons/validate')
        .send({
          code: couponCode,
          orderSubtotal: 2000,
        });

      expect(validRes1.status).toBe(200);
      expect(validRes1.body.data.valid).toBe(true);
      expect(validRes1.body.data.discountAmount).toBe(400);

      // Validate: Subtotal 5000 -> 20% = 1000, but capped at 600
      const validRes2 = await request(app.getHttpServer())
        .post('/api/v1/marketing/coupons/validate')
        .send({
          code: couponCode,
          orderSubtotal: 5000,
        });

      expect(validRes2.status).toBe(200);
      expect(validRes2.body.data.discountAmount).toBe(600);

      // Validate: Subtotal 1000 -> below 1500 minimum
      const invalidRes = await request(app.getHttpServer())
        .post('/api/v1/marketing/coupons/validate')
        .send({
          code: couponCode,
          orderSubtotal: 1000,
        });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.message).toContain('Minimum order amount');
    });

    it('lists coupons with pagination and metrics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/marketing/coupons')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Promotions & Offers', () => {
    it('creates and retrieves a promotional campaign offer', async () => {
      const slug = `gadget-fest-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/marketing/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Gadget Fest 2026',
          slug,
          description: 'Flat 12% off on top audio and smart wearables',
          discountPercentage: 12,
          startDate: '2026-11-01T00:00:00Z',
          endDate: '2026-11-30T23:59:59Z',
          productIds: [productId],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.slug).toBe(slug);

      // Public endpoint check
      const pubRes = await request(app.getHttpServer())
        .get(`/api/v1/marketing/promotions/${slug}`);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.title).toBe('Gadget Fest 2026');
    });
  });

  describe('Product Reviews & Moderation', () => {
    it('allows customer to submit review, starts unapproved, then gets approved by moderator', async () => {
      // 1. Customer submits review
      const reviewRes = await request(app.getHttpServer())
        .post('/api/v1/marketing/reviews')
        .send({
          productId,
          reviewerName: 'Shakil Ahmed',
          rating: 5,
          title: 'Amazing build quality and battery life',
          comment: 'Using it for a week, battery lasts over 4 days. Highly recommended!',
        });

      expect(reviewRes.status).toBe(201);
      expect(reviewRes.body.data.id).toBeDefined();
      expect(reviewRes.body.data.isApproved).toBe(false);
      reviewId = reviewRes.body.data.id;

      // 2. Public review query: unapproved review should NOT appear
      const publicBefore = await request(app.getHttpServer())
        .get(`/api/v1/marketing/products/${productId}/reviews`);

      expect(publicBefore.status).toBe(200);
      const foundBefore = publicBefore.body.data.find((r: any) => r.id === reviewId);
      expect(foundBefore).toBeUndefined();

      // 3. Moderator approves review
      const modRes = await request(app.getHttpServer())
        .patch(`/api/v1/marketing/reviews/${reviewId}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isApproved: true });

      expect(modRes.status).toBe(200);
      expect(modRes.body.data.isApproved).toBe(true);

      // 4. Public review query: now it appears!
      const publicAfter = await request(app.getHttpServer())
        .get(`/api/v1/marketing/products/${productId}/reviews`);

      expect(publicAfter.status).toBe(200);
      const foundAfter = publicAfter.body.data.find((r: any) => r.id === reviewId);
      expect(foundAfter).toBeDefined();
      expect(foundAfter.rating).toBe(5);
    });
  });
});
