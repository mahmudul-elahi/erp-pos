import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto.js';
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
export class BrandsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateBrandDto, actorId?: string) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);

    const existing = await this.prisma.brand.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException(`Brand with slug "${slug}" already exists`);
    }

    const brand = await this.prisma.brand.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim(),
        logo: dto.logo,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'brands.create',
      entityType: 'Brand',
      entityId: brand.id,
      newValues: { name: brand.name, slug: brand.slug },
    });

    return brand;
  }

  async findAll(pagination: PaginationDto) {
    const where: Prisma.BrandWhereInput = {
      deletedAt: null,
    };

    if (pagination.search) {
      where.OR = [
        { name: { contains: pagination.search, mode: 'insensitive' } },
        { slug: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { products: true } },
        },
      }),
    ]);

    return {
      data: data.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        description: b.description,
        logo: b.logo,
        isActive: b.isActive,
        productCount: b._count.products,
        createdAt: b.createdAt,
      })),
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async findOne(id: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      description: brand.description,
      logo: brand.logo,
      isActive: brand.isActive,
      productCount: brand._count.products,
      createdAt: brand.createdAt,
    };
  }

  async update(id: string, dto: UpdateBrandDto, actorId?: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    let slug = brand.slug;
    if (dto.slug && dto.slug !== brand.slug) {
      slug = slugify(dto.slug);
      const existing = await this.prisma.brand.findFirst({
        where: { slug, id: { not: id } },
      });
      if (existing) {
        throw new BadRequestException(`Brand with slug "${slug}" already exists`);
      }
    } else if (dto.name && !dto.slug && dto.name !== brand.name) {
      slug = slugify(dto.name);
    }

    const updated = await this.prisma.brand.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        slug,
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.logo !== undefined ? { logo: dto.logo || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'brands.update',
      entityType: 'Brand',
      entityId: id,
      newValues: { name: updated.name, slug: updated.slug },
    });

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    if (brand._count.products > 0) {
      throw new BadRequestException('Cannot delete brand with associated products');
    }

    await this.prisma.brand.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'brands.delete',
      entityType: 'Brand',
      entityId: id,
    });

    return { message: 'Brand deleted successfully' };
  }
}
