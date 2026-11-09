import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';
import { PaginationDto, buildPaginationMeta } from '../../common/pagination/pagination.dto.js';

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateCategoryDto, actorId?: string) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);

    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException(`Category with slug "${slug}" already exists`);
    }

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.deletedAt) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim(),
        parentId: dto.parentId || null,
        image: dto.image,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'categories.create',
      entityType: 'Category',
      entityId: category.id,
      newValues: { name: category.name, slug: category.slug },
    });

    return category;
  }

  async findAll(pagination: PaginationDto) {
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
    };

    if (pagination.search) {
      where.OR = [
        { name: { contains: pagination.search, mode: 'insensitive' } },
        { slug: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          parent: { select: { id: true, name: true, slug: true } },
          _count: { select: { products: true, children: true } },
        },
      }),
    ]);

    return {
      data: data.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        image: c.image,
        isActive: c.isActive,
        sortOrder: c.sortOrder,
        parent: c.parent,
        productCount: c._count.products,
        subcategoriesCount: c._count.children,
        createdAt: c.createdAt,
      })),
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async getTree() {
    const all = await this.prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        image: true,
        sortOrder: true,
      },
    });

    const categoryMap = new Map<string, any>();
    const roots: any[] = [];

    for (const cat of all) {
      categoryMap.set(cat.id, { ...cat, children: [] });
    }

    for (const cat of all) {
      if (cat.parentId && categoryMap.has(cat.parentId)) {
        categoryMap.get(cat.parentId).children.push(categoryMap.get(cat.id));
      } else {
        roots.push(categoryMap.get(cat.id));
      }
    }

    return roots;
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          where: { deletedAt: null },
          select: { id: true, name: true, slug: true, isActive: true, sortOrder: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, actorId?: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    let slug = category.slug;
    if (dto.slug && dto.slug !== category.slug) {
      slug = slugify(dto.slug);
      const existing = await this.prisma.category.findFirst({
        where: { slug, id: { not: id } },
      });
      if (existing) {
        throw new BadRequestException(`Category with slug "${slug}" already exists`);
      }
    } else if (dto.name && !dto.slug && dto.name !== category.name) {
      slug = slugify(dto.name);
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        slug,
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId || null } : {}),
        ...(dto.image !== undefined ? { image: dto.image || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'categories.update',
      entityType: 'Category',
      entityId: id,
      newValues: { name: updated.name, slug: updated.slug },
    });

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { products: true, children: true } },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category._count.products > 0) {
      throw new BadRequestException('Cannot delete category that contains products');
    }

    if (category._count.children > 0) {
      throw new BadRequestException('Cannot delete category that has subcategories');
    }

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'categories.delete',
      entityType: 'Category',
      entityId: id,
    });

    return { message: 'Category deleted successfully' };
  }
}
