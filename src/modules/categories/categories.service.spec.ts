import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CategoriesService } from './categories.service.js';

describe('CategoriesService', () => {
  let categoriesService: CategoriesService;
  let prismaMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      category: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    categoriesService = new CategoriesService(prismaMock, auditLogsMock);
  });

  describe('create', () => {
    it('should throw BadRequestException if category slug exists', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ id: 'c-1', slug: 'laptops' });

      await expect(
        categoriesService.create({ name: 'Laptops', slug: 'laptops' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create category with auto-generated slug', async () => {
      prismaMock.category.findUnique.mockResolvedValue(null);
      prismaMock.category.create.mockResolvedValue({
        id: 'c-2',
        name: 'Gaming Laptops',
        slug: 'gaming-laptops',
      });

      const res = await categoriesService.create({ name: 'Gaming Laptops' });
      expect(res.slug).toBe('gaming-laptops');
      expect(auditLogsMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'categories.create' }),
      );
    });
  });

  describe('getTree', () => {
    it('should build hierarchical tree of parent and child categories', async () => {
      prismaMock.category.findMany.mockResolvedValue([
        { id: '1', name: 'Electronics', slug: 'electronics', parentId: null, sortOrder: 0 },
        { id: '2', name: 'Smartphones', slug: 'smartphones', parentId: '1', sortOrder: 1 },
        { id: '3', name: 'Laptops', slug: 'laptops', parentId: '1', sortOrder: 2 },
        { id: '4', name: 'Gaming Phones', slug: 'gaming-phones', parentId: '2', sortOrder: 0 },
      ]);

      const tree = await categoriesService.getTree();

      expect(tree.length).toBe(1);
      expect(tree[0].name).toBe('Electronics');
      expect(tree[0].children.length).toBe(2);
      expect(tree[0].children[0].name).toBe('Smartphones');
      expect(tree[0].children[0].children[0].name).toBe('Gaming Phones');
    });
  });

  describe('remove', () => {
    it('should prevent deleting category that contains products', async () => {
      prismaMock.category.findFirst.mockResolvedValue({
        id: 'c-1',
        name: 'Accessories',
        _count: { products: 10, children: 0 },
      });

      await expect(categoriesService.remove('c-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should prevent deleting category with child subcategories', async () => {
      prismaMock.category.findFirst.mockResolvedValue({
        id: 'c-1',
        name: 'Computers',
        _count: { products: 0, children: 3 },
      });

      await expect(categoriesService.remove('c-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
