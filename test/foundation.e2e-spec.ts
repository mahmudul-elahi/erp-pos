import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 1 Foundation (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminRefreshToken: string;
  let cashierToken: string;
  let createdBranchId: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('GET /api/v1/health should report healthy services', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.info.database.status).toBe('up');
      expect(res.body.data.info.redis.status).toBe('up');
    });
  });

  describe('Authentication Flow', () => {
    it('POST /api/v1/auth/login with valid super admin credentials returns token pair', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@erppos.local',
          password: 'AdminPassword123!',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe('admin@erppos.local');
      expect(res.body.data.user.isSuperAdmin).toBe(true);

      adminToken = res.body.data.accessToken;
      adminRefreshToken = res.body.data.refreshToken;
    });

    it('GET /api/v1/auth/me returns authenticated super admin profile and permissions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('admin@erppos.local');
      expect(res.body.data.isSuperAdmin).toBe(true);
      expect(res.body.data.permissions.length).toBeGreaterThan(0);
      expect(res.body.data.roles).toContain('super_admin');
    });

    it('POST /api/v1/auth/refresh rotates the refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: adminRefreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(adminRefreshToken);

      // Update tokens
      adminToken = res.body.data.accessToken;
      adminRefreshToken = res.body.data.refreshToken;
    });
  });

  describe('Branches & Warehouses Management', () => {
    it('POST /api/v1/branches creates a new branch', async () => {
      const branchCode = `BR-TEST-${Date.now().toString().slice(-4)}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Gulshan Branch',
          code: branchCode,
          address: 'Gulshan Avenue, Dhaka',
          phone: '+8801700112233',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe(branchCode);
      createdBranchId = res.body.data.id;
    });

    it('GET /api/v1/branches returns paginated branch list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/v1/warehouses creates warehouse linked to the branch', async () => {
      const whCode = `WH-TEST-${Date.now().toString().slice(-4)}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Gulshan Stock Room',
          code: whCode,
          branchId: createdBranchId,
          location: '2nd Floor Storage',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe(whCode);
      expect(res.body.data.branchId).toBe(createdBranchId);
    });
  });

  describe('Users & RBAC Authorization Boundary', () => {
    const cashierEmail = `cashier_${Date.now()}@erppos.local`;
    const cashierPassword = 'CashierPassword123!';

    it('POST /api/v1/users creates cashier user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: cashierEmail,
          password: cashierPassword,
          name: 'Staff Cashier',
          roleNames: ['cashier'],
          branchIds: [createdBranchId],
          defaultBranchId: createdBranchId,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(cashierEmail);
    });

    it('Cashier logs in and receives token with cashier permissions', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: cashierEmail,
          password: cashierPassword,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      cashierToken = res.body.data.accessToken;
      expect(cashierToken).toBeDefined();
    });

    it('Cashier is forbidden from creating branches (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          name: 'Unauthorized Branch',
          code: 'BR-UNAUTHORIZED',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Missing required permissions');
    });
  });

  describe('File Storage Presigning', () => {
    it('POST /api/v1/files/presign returns presigned upload URL for valid document', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/files/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fileName: 'gadget-invoice.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1048576,
          module: 'orders',
          entityId: 'order-101',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.uploadUrl).toBeDefined();
      expect(res.body.data.objectKey).toContain('orders/order-101/');
      expect(res.body.data.bucket).toBe('pos-erp');
    });
  });

  describe('Audit Trail Verification', () => {
    it('GET /api/v1/audit-logs records actions executed in previous steps', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const actions = res.body.data.map((l: any) => l.action);
      expect(actions).toContain('auth.login');
      expect(actions).toContain('branches.create');
      expect(actions).toContain('warehouses.create');
      expect(actions).toContain('users.create');
    });
  });
});
