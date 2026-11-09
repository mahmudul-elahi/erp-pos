import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { Prisma } from '@prisma/client';

describe('ProductsService', () => {
  let productsService: ProductsService;
  let prismaMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      category: { findUnique: vi.fn() },
      brand: { findUnique: vi.fn() },
      product: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      productBarcode: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      productVariant: { create: vi.fn() },
      productVariantAttributeValue: { createMany: vi.fn() },
      productSpecification: { create: vi.fn() },
      specificationGroup: { upsert: vi.fn() },
      productImage: { createMany: vi.fn() },
      $transaction: vi.fn().mockImplementation((callback) => callback(prismaMock)),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    productsService = new ProductsService(prismaMock, auditLogsMock);
  });

  describe('create', () => {
    it('should throw NotFoundException if category does not exist', async () => {
      prismaMock.category.findUnique.mockResolvedValue(null);

      await expect(
        productsService.create({
          name: 'Galaxy S24',
          categoryId: 'non-existent',
          costPrice: 80000,
          sellingPrice: 95000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if SKU already exists', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Phones' });
      prismaMock.product.findUnique.mockImplementation(({ where }) => {
        if (where.sku) return Promise.resolve({ id: 'existing-p', sku: 'S24-EXISTS' });
        return Promise.resolve(null);
      });

      await expect(
        productsService.create({
          name: 'Galaxy S24',
          sku: 'S24-EXISTS',
          categoryId: 'cat-1',
          costPrice: 80000,
          sellingPrice: 95000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create product with auto-generated barcode and SKU and log audit', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Phones' });
      prismaMock.product.findUnique.mockResolvedValue(null);
      prismaMock.productBarcode.findUnique.mockResolvedValue(null);

      prismaMock.product.create.mockResolvedValue({
        id: 'p-1',
        name: 'Galaxy S24',
        slug: 'galaxy-s24',
        sku: 'GALAXY-A1B2',
        barcode: '201234567890',
        costPrice: new Prisma.Decimal(80000),
        sellingPrice: new Prisma.Decimal(95000),
      });

      prismaMock.product.findFirst.mockResolvedValue({
        id: 'p-1',
        name: 'Galaxy S24',
        slug: 'galaxy-s24',
        sku: 'GALAXY-A1B2',
        barcode: '201234567890',
        costPrice: new Prisma.Decimal(80000),
        sellingPrice: new Prisma.Decimal(95000),
        category: { id: 'cat-1', name: 'Phones', slug: 'phones' },
        brand: null,
        images: [],
        variants: [],
        specifications: [],
        barcodes: [{ barcode: '201234567890' }],
      });

      const res = await productsService.create(
        {
          name: 'Galaxy S24',
          categoryId: 'cat-1',
          costPrice: 80000,
          sellingPrice: 95000,
        },
        'admin-1',
      );

      expect(res.id).toBe('p-1');
      expect(res.sellingPrice).toBe(95000);
      expect(auditLogsMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'products.create', entityId: 'p-1' }),
      );
    });
  });

  describe('findByBarcode', () => {
    it('should throw NotFoundException if barcode is not registered', async () => {
      prismaMock.productBarcode.findUnique.mockResolvedValue(null);

      await expect(productsService.findByBarcode('000000000000')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return matched product and variant for barcode scanner', async () => {
      prismaMock.productBarcode.findUnique.mockResolvedValue({
        barcode: '890123456789',
        product: {
          id: 'p-1',
          name: 'Pixel 8 Pro',
          sku: 'PIXEL8-PRO',
          costPrice: new Prisma.Decimal(75000),
          sellingPrice: new Prisma.Decimal(89000),
          trackSerial: true,
          deletedAt: null,
          category: { name: 'Phones' },
          brand: { name: 'Google' },
        },
        variant: {
          id: 'v-1',
          name: 'Bay Blue / 128GB',
          sku: 'PIXEL8-BLUE-128',
          costPrice: new Prisma.Decimal(75000),
          sellingPrice: new Prisma.Decimal(89000),
          attributeValues: [
            {
              attributeValue: {
                value: 'Bay Blue',
                attribute: { name: 'Color' },
              },
            },
          ],
        },
      });

      const item = await productsService.findByBarcode('890123456789');

      expect(item.productId).toBe('p-1');
      expect(item.variantId).toBe('v-1');
      expect(item.sku).toBe('PIXEL8-BLUE-128');
      expect(item.sellingPrice).toBe(89000);
      expect(item.trackSerial).toBe(true);
      expect(item.attributes[0].value).toBe('Bay Blue');
    });
  });

  describe('remove', () => {
    it('should soft delete product by archiving and setting deletedAt', async () => {
      prismaMock.product.findFirst.mockResolvedValue({ id: 'p-1', name: 'Old Phone' });
      prismaMock.product.update.mockResolvedValue({});

      const res = await productsService.remove('p-1', 'admin-1');

      expect(res.message).toContain('archived successfully');
      expect(prismaMock.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: expect.objectContaining({ status: 'ARCHIVED' }),
      });
    });
  });
});
