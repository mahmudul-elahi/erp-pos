import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Phase 2 Product Catalog (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;

  let rootCategoryId: string;
  let subCategoryId: string;
  let brandId: string;
  let colorAttrId: string;
  let colorValId1: string;
  let colorValId2: string;
  let storageAttrId: string;
  let storageValId1: string;
  let storageValId2: string;

  let createdProductId: string;
  let variant1Barcode: string;

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

    // Login as Super Admin
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@erppos.local', password: 'AdminPassword123!' });
    adminToken = adminLogin.body.data.accessToken;

    // Create and login as Cashier
    const cashierEmail = `cashier_catalog_${Date.now()}@erppos.local`;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: cashierEmail,
        password: 'CashierPassword123!',
        name: 'Catalog Cashier',
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

  describe('Categories & Nested Tree', () => {
    it('POST /api/v1/categories creates root category and subcategory', async () => {
      // 1. Root Category
      const rootRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Electronics ${Date.now()}`,
          description: 'Electronic gadgets and devices',
        })
        .expect(201);

      expect(rootRes.body.success).toBe(true);
      rootCategoryId = rootRes.body.data.id;

      // 2. Subcategory
      const subRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Flagship Phones ${Date.now()}`,
          parentId: rootCategoryId,
        })
        .expect(201);

      expect(subRes.body.success).toBe(true);
      expect(subRes.body.data.parentId).toBe(rootCategoryId);
      subCategoryId = subRes.body.data.id;
    });

    it('GET /api/v1/categories/tree returns hierarchical category tree', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories/tree')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const foundRoot = res.body.data.find((c: any) => c.id === rootCategoryId);
      expect(foundRoot).toBeDefined();
      expect(foundRoot.children.some((child: any) => child.id === subCategoryId)).toBe(true);
    });
  });

  describe('Brands Management', () => {
    it('POST /api/v1/brands creates brand', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Apple Inc ${Date.now()}`,
          description: 'Premium electronics brand',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      brandId = res.body.data.id;
      expect(brandId).toBeDefined();
    });
  });

  describe('Attributes & Attribute Values', () => {
    it('creates Color and Storage attributes with discrete values', async () => {
      // Color
      const colorRes = await request(app.getHttpServer())
        .post('/api/v1/attributes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Color_${Date.now()}` })
        .expect(201);
      colorAttrId = colorRes.body.data.id;

      const cVal1 = await request(app.getHttpServer())
        .post(`/api/v1/attributes/${colorAttrId}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Titanium Gray', code: '#5C5B57' })
        .expect(201);
      colorValId1 = cVal1.body.data.id;

      const cVal2 = await request(app.getHttpServer())
        .post(`/api/v1/attributes/${colorAttrId}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Natural Titanium', code: '#E3DFD5' })
        .expect(201);
      colorValId2 = cVal2.body.data.id;

      // Storage
      const storageRes = await request(app.getHttpServer())
        .post('/api/v1/attributes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Storage_${Date.now()}` })
        .expect(201);
      storageAttrId = storageRes.body.data.id;

      const sVal1 = await request(app.getHttpServer())
        .post(`/api/v1/attributes/${storageAttrId}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: '256GB' })
        .expect(201);
      storageValId1 = sVal1.body.data.id;

      const sVal2 = await request(app.getHttpServer())
        .post(`/api/v1/attributes/${storageAttrId}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: '512GB' })
        .expect(201);
      storageValId2 = sVal2.body.data.id;
    });
  });

  describe('Product Creation & Full Catalog Flow', () => {
    it('POST /api/v1/products creates product with variants, specs, barcodes & images', async () => {
      variant1Barcode = `890${Date.now().toString().slice(-9)}`;
      const variant2Barcode = `891${Date.now().toString().slice(-9)}`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `iPhone 15 Pro ${Date.now()}`,
          categoryId: subCategoryId,
          brandId,
          costPrice: 115000,
          sellingPrice: 139000,
          wholesalePrice: 132000,
          trackSerial: true,
          minStockAlert: 5,
          warrantyMonths: 12,
          warrantyPolicy: '1-Year Official Warranty',
          variants: [
            {
              name: 'Titanium Gray / 256GB',
              sku: `IP15P-GRY-256-${Date.now().toString().slice(-4)}`,
              barcode: variant1Barcode,
              costPrice: 115000,
              sellingPrice: 139000,
              attributeValueIds: [colorValId1, storageValId1],
            },
            {
              name: 'Natural Titanium / 512GB',
              sku: `IP15P-NAT-512-${Date.now().toString().slice(-4)}`,
              barcode: variant2Barcode,
              costPrice: 135000,
              sellingPrice: 159000,
              attributeValueIds: [colorValId2, storageValId2],
            },
          ],
          specifications: [
            { groupName: 'Display', key: 'Screen Size', value: '6.1 inches Super Retina XDR' },
            { groupName: 'Processor', key: 'Chipset', value: 'Apple A17 Pro (3nm)' },
          ],
          images: [
            { url: 'https://minio.local/pos-erp/products/iphone15pro-front.webp', isPrimary: true },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.trackSerial).toBe(true);
      expect(res.body.data.variants.length).toBe(2);
      expect(res.body.data.specifications.length).toBe(2);
      expect(res.body.data.images.length).toBe(1);

      createdProductId = res.body.data.id;
    });

    it('GET /api/v1/products returns paginated products with prices and primary image', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();

      const found = res.body.data.find((p: any) => p.id === createdProductId);
      expect(found).toBeDefined();
      expect(found.sellingPrice).toBe(139000);
      expect(found.variantsCount).toBe(2);
      expect(found.primaryImage).toBe('https://minio.local/pos-erp/products/iphone15pro-front.webp');
    });

    it('GET /api/v1/products/by-barcode/:barcode simulates instant barcode scanner lookup', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/by-barcode/${variant1Barcode}`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.productId).toBe(createdProductId);
      expect(res.body.data.variantName).toBe('Titanium Gray / 256GB');
      expect(res.body.data.sellingPrice).toBe(139000);
      expect(res.body.data.trackSerial).toBe(true);
      expect(res.body.data.attributes.length).toBe(2);
    });

    it('Cashier can view products but is forbidden from creating products (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          name: 'Unauthorized Product',
          categoryId: subCategoryId,
          costPrice: 100,
          sellingPrice: 200,
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Missing required permissions');
    });
  });
});
