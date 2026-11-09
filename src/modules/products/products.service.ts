import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto.js';
import { PaginationDto, buildPaginationMeta } from '../../common/pagination/pagination.dto.js';
import { generateEan13Barcode, generateSku, slugify } from './utils/sku-barcode.util.js';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateProductDto, actorId?: string) {
    // 1. Verify Category & Brand
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category || category.deletedAt) {
      throw new NotFoundException('Category not found');
    }

    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({
        where: { id: dto.brandId },
      });
      if (!brand || brand.deletedAt) {
        throw new NotFoundException('Brand not found');
      }
    }

    // 2. Slug, SKU & Barcode resolution
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    const existingSlug = await this.prisma.product.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new BadRequestException(`Product with slug "${slug}" already exists`);
    }

    const sku = dto.sku ? dto.sku.toUpperCase().trim() : generateSku(dto.name);
    const existingSku = await this.prisma.product.findUnique({ where: { sku } });
    if (existingSku) {
      throw new BadRequestException(`Product with SKU "${sku}" already exists`);
    }

    let barcode = dto.barcode?.trim();
    if (!barcode) {
      barcode = generateEan13Barcode();
    }
    const existingBarcode = await this.prisma.productBarcode.findUnique({
      where: { barcode },
    });
    if (existingBarcode) {
      throw new BadRequestException(`Barcode "${barcode}" is already registered`);
    }

    const hasVariants = Boolean(dto.variants && dto.variants.length > 0);

    // 3. Perform transactional creation
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: dto.name.trim(),
          slug,
          description: dto.description?.trim(),
          categoryId: dto.categoryId,
          brandId: dto.brandId || null,
          sku,
          barcode,
          type: dto.type || 'PHYSICAL',
          status: dto.status || 'DRAFT',
          costPrice: new Prisma.Decimal(dto.costPrice),
          sellingPrice: new Prisma.Decimal(dto.sellingPrice),
          wholesalePrice: dto.wholesalePrice ? new Prisma.Decimal(dto.wholesalePrice) : null,
          minStockAlert: dto.minStockAlert ?? 5,
          trackSerial: dto.trackSerial ?? false,
          hasVariants,
          warrantyMonths: dto.warrantyMonths ?? 0,
          warrantyPolicy: dto.warrantyPolicy?.trim(),
        },
      });

      // Primary Barcode Record
      await tx.productBarcode.create({
        data: {
          productId: created.id,
          barcode,
          isPrimary: true,
          type: 'CODE128',
        },
      });

      // Variants
      if (dto.variants && dto.variants.length > 0) {
        for (const vDto of dto.variants) {
          const vSku = vDto.sku
            ? vDto.sku.toUpperCase().trim()
            : generateSku(dto.name, vDto.name);
          const vBarcode = vDto.barcode?.trim() || generateEan13Barcode();

          const variant = await tx.productVariant.create({
            data: {
              productId: created.id,
              name: vDto.name.trim(),
              sku: vSku,
              barcode: vBarcode,
              costPrice: vDto.costPrice !== undefined ? new Prisma.Decimal(vDto.costPrice) : null,
              sellingPrice: vDto.sellingPrice !== undefined ? new Prisma.Decimal(vDto.sellingPrice) : null,
              wholesalePrice: vDto.wholesalePrice !== undefined ? new Prisma.Decimal(vDto.wholesalePrice) : null,
              minStockAlert: vDto.minStockAlert ?? null,
            },
          });

          // Variant Barcode Record
          await tx.productBarcode.create({
            data: {
              productId: created.id,
              variantId: variant.id,
              barcode: vBarcode,
              isPrimary: true,
              type: 'CODE128',
            },
          });

          // Link Attribute Values
          if (vDto.attributeValueIds && vDto.attributeValueIds.length > 0) {
            await tx.productVariantAttributeValue.createMany({
              data: vDto.attributeValueIds.map((valId) => ({
                variantId: variant.id,
                attributeValueId: valId,
              })),
            });
          }
        }
      }

      // Specifications
      if (dto.specifications && dto.specifications.length > 0) {
        for (const sDto of dto.specifications) {
          let groupId: string | null = null;
          if (sDto.groupName) {
            const group = await tx.specificationGroup.upsert({
              where: { name: sDto.groupName.trim() },
              update: {},
              create: { name: sDto.groupName.trim() },
            });
            groupId = group.id;
          }

          await tx.productSpecification.create({
            data: {
              productId: created.id,
              groupId,
              key: sDto.key.trim(),
              value: sDto.value.trim(),
              sortOrder: sDto.sortOrder ?? 0,
            },
          });
        }
      }

      // Images
      if (dto.images && dto.images.length > 0) {
        await tx.productImage.createMany({
          data: dto.images.map((img, idx) => ({
            productId: created.id,
            url: img.url,
            fileId: img.fileId || null,
            isPrimary: img.isPrimary ?? idx === 0,
            sortOrder: img.sortOrder ?? idx,
          })),
        });
      }

      return created;
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'products.create',
      entityType: 'Product',
      entityId: product.id,
      newValues: { name: product.name, sku: product.sku, barcode: product.barcode },
    });

    return this.findOne(product.id);
  }

  async findAll(
    pagination: PaginationDto,
    filters?: {
      categoryId?: string;
      brandId?: string;
      status?: string;
      type?: string;
    },
  ) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
    };

    if (filters?.categoryId) {
      where.categoryId = filters.categoryId;
    }
    if (filters?.brandId) {
      where.brandId = filters.brandId;
    }
    if (filters?.status) {
      where.status = filters.status as any;
    }
    if (filters?.type) {
      where.type = filters.type as any;
    }

    if (pagination.search) {
      where.OR = [
        { name: { contains: pagination.search, mode: 'insensitive' } },
        { sku: { contains: pagination.search, mode: 'insensitive' } },
        { barcode: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: pagination.sortOrder || 'desc' },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true, slug: true } },
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { url: true },
          },
          _count: { select: { variants: true } },
        },
      }),
    ]);

    return {
      data: data.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        barcode: p.barcode,
        type: p.type,
        status: p.status,
        costPrice: Number(p.costPrice),
        sellingPrice: Number(p.sellingPrice),
        wholesalePrice: p.wholesalePrice ? Number(p.wholesalePrice) : null,
        minStockAlert: p.minStockAlert,
        trackSerial: p.trackSerial,
        hasVariants: p.hasVariants,
        variantsCount: p._count.variants,
        category: p.category,
        brand: p.brand,
        primaryImage: p.images[0]?.url || null,
        createdAt: p.createdAt,
      })),
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          where: { deletedAt: null },
          include: {
            attributeValues: {
              include: {
                attributeValue: {
                  include: { attribute: true },
                },
              },
            },
            barcodes: true,
          },
        },
        specifications: {
          include: { group: true },
          orderBy: { sortOrder: 'asc' },
        },
        barcodes: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      sku: product.sku,
      barcode: product.barcode,
      type: product.type,
      status: product.status,
      costPrice: Number(product.costPrice),
      sellingPrice: Number(product.sellingPrice),
      wholesalePrice: product.wholesalePrice ? Number(product.wholesalePrice) : null,
      minStockAlert: product.minStockAlert,
      trackSerial: product.trackSerial,
      hasVariants: product.hasVariants,
      warrantyMonths: product.warrantyMonths,
      warrantyPolicy: product.warrantyPolicy,
      category: product.category,
      brand: product.brand,
      images: product.images,
      specifications: product.specifications.map((s) => ({
        id: s.id,
        group: s.group?.name || 'General',
        key: s.key,
        value: s.value,
      })),
      variants: product.variants.map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        barcode: v.barcode,
        costPrice: v.costPrice ? Number(v.costPrice) : Number(product.costPrice),
        sellingPrice: v.sellingPrice ? Number(v.sellingPrice) : Number(product.sellingPrice),
        wholesalePrice: v.wholesalePrice ? Number(v.wholesalePrice) : null,
        minStockAlert: v.minStockAlert ?? product.minStockAlert,
        isActive: v.isActive,
        attributes: v.attributeValues.map((av) => ({
          attribute: av.attributeValue.attribute.name,
          value: av.attributeValue.value,
          code: av.attributeValue.code,
        })),
        barcodes: v.barcodes.map((b) => b.barcode),
      })),
      barcodes: product.barcodes.map((b) => b.barcode),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  async findByBarcode(barcode: string) {
    const barcodeRecord = await this.prisma.productBarcode.findUnique({
      where: { barcode: barcode.trim() },
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true } },
            brand: { select: { id: true, name: true } },
          },
        },
        variant: {
          include: {
            attributeValues: {
              include: {
                attributeValue: { include: { attribute: true } },
              },
            },
          },
        },
      },
    });

    if (!barcodeRecord || barcodeRecord.product.deletedAt) {
      throw new NotFoundException(`No product matching barcode "${barcode}" was found`);
    }

    const { product, variant } = barcodeRecord;

    return {
      productId: product.id,
      productName: product.name,
      sku: variant ? variant.sku : product.sku,
      barcode: barcodeRecord.barcode,
      trackSerial: product.trackSerial,
      variantId: variant ? variant.id : null,
      variantName: variant ? variant.name : null,
      costPrice: variant?.costPrice ? Number(variant.costPrice) : Number(product.costPrice),
      sellingPrice: variant?.sellingPrice ? Number(variant.sellingPrice) : Number(product.sellingPrice),
      category: product.category.name,
      brand: product.brand?.name || null,
      attributes: variant
        ? variant.attributeValues.map((av) => ({
            name: av.attributeValue.attribute.name,
            value: av.attributeValue.value,
          }))
        : [],
    };
  }

  async update(id: string, dto: UpdateProductDto, actorId?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    let slug = product.slug;
    if (dto.slug && dto.slug !== product.slug) {
      slug = slugify(dto.slug);
      const existing = await this.prisma.product.findFirst({
        where: { slug, id: { not: id } },
      });
      if (existing) {
        throw new BadRequestException(`Product with slug "${slug}" already exists`);
      }
    } else if (dto.name && !dto.slug && dto.name !== product.name) {
      slug = slugify(dto.name);
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        slug,
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.brandId !== undefined ? { brandId: dto.brandId || null } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.costPrice !== undefined ? { costPrice: new Prisma.Decimal(dto.costPrice) } : {}),
        ...(dto.sellingPrice !== undefined ? { sellingPrice: new Prisma.Decimal(dto.sellingPrice) } : {}),
        ...(dto.wholesalePrice !== undefined
          ? { wholesalePrice: dto.wholesalePrice ? new Prisma.Decimal(dto.wholesalePrice) : null }
          : {}),
        ...(dto.minStockAlert !== undefined ? { minStockAlert: dto.minStockAlert } : {}),
        ...(dto.trackSerial !== undefined ? { trackSerial: dto.trackSerial } : {}),
        ...(dto.warrantyMonths !== undefined ? { warrantyMonths: dto.warrantyMonths } : {}),
        ...(dto.warrantyPolicy !== undefined ? { warrantyPolicy: dto.warrantyPolicy } : {}),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'products.update',
      entityType: 'Product',
      entityId: id,
      newValues: { name: updated.name, status: updated.status, sellingPrice: Number(updated.sellingPrice) },
    });

    return this.findOne(id);
  }

  async remove(id: string, actorId?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'products.delete',
      entityType: 'Product',
      entityId: id,
    });

    return { message: 'Product archived successfully' };
  }
}
