import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import type { CreateBuybackDto } from './dto/create-buyback.dto.js';
import type { UpdateBuybackDto } from './dto/update-buyback.dto.js';
import type { CreateWarrantyClaimDto } from './dto/create-warranty-claim.dto.js';
import type { UpdateWarrantyClaimDto } from './dto/update-warranty-claim.dto.js';
import type { CreateGiftBundleDto } from './dto/create-gift-bundle.dto.js';
import type { QueryBuybackDto, QueryWarrantyClaimDto } from './dto/query-gadget.dto.js';
import {
  buildPaginationMeta,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto.js';
import {
  BuybackStatus,
  Prisma,
  WarrantyClaimStatus,
} from '@prisma/client';

@Injectable()
export class GadgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Used Devices & Buyback Requests
  // ---------------------------------------------------------------------------
  async createBuybackRequest(dto: CreateBuybackDto, actorId?: string) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const requestNumber = `BBK-${dateStr}-${randomSuffix}`;

    const buyback = await this.prisma.deviceBuybackRequest.create({
      data: {
        requestNumber,
        customerName: dto.customerName.trim(),
        customerPhone: dto.customerPhone.trim(),
        deviceBrand: dto.deviceBrand.trim(),
        deviceModel: dto.deviceModel.trim(),
        imei: dto.imei?.trim() || null,
        serialNumber: dto.serialNumber?.trim() || null,
        condition: dto.condition ?? 'GOOD',
        batteryHealth: dto.batteryHealth ?? null,
        hasBox: dto.hasBox ?? false,
        hasCharger: dto.hasCharger ?? false,
        hasOriginalBill: dto.hasOriginalBill ?? false,
        expectedPrice: dto.expectedPrice ? new Prisma.Decimal(dto.expectedPrice) : null,
        status: BuybackStatus.PENDING,
        notes: dto.notes?.trim() || null,
        createdById: actorId,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'buyback.create',
      entityType: 'DeviceBuybackRequest',
      entityId: buyback.id,
      newValues: {
        requestNumber: buyback.requestNumber,
        device: `${buyback.deviceBrand} ${buyback.deviceModel}`,
      },
    });

    return buyback;
  }

  async updateBuybackStatus(id: string, dto: UpdateBuybackDto, actorId?: string) {
    const buyback = await this.prisma.deviceBuybackRequest.findUnique({ where: { id } });
    if (!buyback) {
      throw new NotFoundException(`Buyback request "${id}" not found`);
    }

    const updated = await this.prisma.deviceBuybackRequest.update({
      where: { id },
      data: {
        status: dto.status ?? buyback.status,
        condition: dto.condition ?? buyback.condition,
        offeredPrice: dto.offeredPrice !== undefined ? new Prisma.Decimal(dto.offeredPrice) : buyback.offeredPrice,
        notes: dto.notes?.trim() || buyback.notes,
        inspectedById: actorId || buyback.inspectedById,
      },
      include: {
        inspectedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'buyback.update_status',
      entityType: 'DeviceBuybackRequest',
      entityId: id,
      newValues: { status: updated.status, offeredPrice: updated.offeredPrice?.toString() },
    });

    return updated;
  }

  async findAllBuybacks(query: QueryBuybackDto): Promise<PaginatedResult<any>> {
    const where: Prisma.DeviceBuybackRequestWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.customerPhone) {
      where.customerPhone = { contains: query.customerPhone.trim() };
    }
    if (query.search) {
      where.OR = [
        { requestNumber: { contains: query.search.trim(), mode: 'insensitive' } },
        { customerName: { contains: query.search.trim(), mode: 'insensitive' } },
        { deviceModel: { contains: query.search.trim(), mode: 'insensitive' } },
        { imei: { contains: query.search.trim() } },
        { serialNumber: { contains: query.search.trim() } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.deviceBuybackRequest.count({ where }),
      this.prisma.deviceBuybackRequest.findMany({
        where,
        include: {
          inspectedBy: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  }

  async findBuybackById(id: string) {
    const buyback = await this.prisma.deviceBuybackRequest.findUnique({
      where: { id },
      include: {
        inspectedBy: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!buyback) {
      throw new NotFoundException(`Buyback request "${id}" not found`);
    }
    return buyback;
  }

  // ---------------------------------------------------------------------------
  // Warranty Claims Management
  // ---------------------------------------------------------------------------
  async createWarrantyClaim(dto: CreateWarrantyClaimDto, actorId?: string) {
    const serial = dto.serialNumber.trim();
    let productId = dto.productId || null;
    let saleId = dto.saleId || null;

    // Auto-detect product & sale by serial if not explicitly passed
    if (!productId || !saleId) {
      const saleItem = await this.prisma.saleItem.findFirst({
        where: {
          serialNumbers: { has: serial },
        },
        include: { sale: true },
      });
      if (saleItem) {
        productId = productId || saleItem.productId;
        saleId = saleId || saleItem.saleId;
      }
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const claimNumber = `WCLM-${dateStr}-${randomSuffix}`;

    const claim = await this.prisma.warrantyClaim.create({
      data: {
        claimNumber,
        customerName: dto.customerName.trim(),
        customerPhone: dto.customerPhone.trim(),
        serialNumber: serial,
        productId,
        saleId,
        problemSummary: dto.problemSummary.trim(),
        status: WarrantyClaimStatus.RECEIVED,
        estimatedDate: dto.estimatedDate ? new Date(dto.estimatedDate) : null,
        technicianNotes: dto.notes?.trim() || null,
        createdById: actorId,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        sale: { select: { id: true, invoiceNumber: true, createdAt: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'warranty_claim.create',
      entityType: 'WarrantyClaim',
      entityId: claim.id,
      newValues: { claimNumber: claim.claimNumber, serialNumber: claim.serialNumber },
    });

    return claim;
  }

  async updateWarrantyClaimStatus(id: string, dto: UpdateWarrantyClaimDto, actorId?: string) {
    const claim = await this.prisma.warrantyClaim.findUnique({ where: { id } });
    if (!claim) {
      throw new NotFoundException(`Warranty claim "${id}" not found`);
    }

    const updated = await this.prisma.warrantyClaim.update({
      where: { id },
      data: {
        status: dto.status ?? claim.status,
        technicianNotes: dto.technicianNotes?.trim() || claim.technicianNotes,
        repairCost: dto.repairCost !== undefined ? new Prisma.Decimal(dto.repairCost) : claim.repairCost,
        estimatedDate: dto.estimatedDate ? new Date(dto.estimatedDate) : claim.estimatedDate,
        completedDate: dto.completedDate ? new Date(dto.completedDate) : claim.completedDate,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        sale: { select: { id: true, invoiceNumber: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'warranty_claim.update_status',
      entityType: 'WarrantyClaim',
      entityId: id,
      newValues: { status: updated.status, repairCost: updated.repairCost.toString() },
    });

    return updated;
  }

  async findAllWarrantyClaims(query: QueryWarrantyClaimDto): Promise<PaginatedResult<any>> {
    const where: Prisma.WarrantyClaimWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.serialNumber) {
      where.serialNumber = { contains: query.serialNumber.trim() };
    }
    if (query.customerPhone) {
      where.customerPhone = { contains: query.customerPhone.trim() };
    }
    if (query.search) {
      where.OR = [
        { claimNumber: { contains: query.search.trim(), mode: 'insensitive' } },
        { customerName: { contains: query.search.trim(), mode: 'insensitive' } },
        { serialNumber: { contains: query.search.trim() } },
        { problemSummary: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.warrantyClaim.count({ where }),
      this.prisma.warrantyClaim.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          sale: { select: { id: true, invoiceNumber: true, createdAt: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  }

  async findWarrantyClaimById(id: string) {
    const claim = await this.prisma.warrantyClaim.findUnique({
      where: { id },
      include: {
        product: true,
        sale: { include: { customer: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!claim) {
      throw new NotFoundException(`Warranty claim "${id}" not found`);
    }
    return claim;
  }

  // ---------------------------------------------------------------------------
  // Device Verification / IMEI Lookup (Public / Customer Facing)
  // ---------------------------------------------------------------------------
  async verifyDevice(imeiOrSerial: string) {
    const query = imeiOrSerial.trim();
    if (!query) {
      throw new BadRequestException('IMEI or Serial number is required');
    }

    // 1. Search in POS Sales
    const saleItem = await this.prisma.saleItem.findFirst({
      where: {
        serialNumbers: { has: query },
      },
      include: {
        sale: {
          select: {
            id: true,
            invoiceNumber: true,
            createdAt: true,
            customer: { select: { name: true } },
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            brand: { select: { name: true } },
            category: { select: { name: true } },
            warrantyMonths: true,
            warrantyPolicy: true,
          },
        },
      },
    });

    if (saleItem) {
      const now = new Date();
      const expiresAt = saleItem.warrantyExpiresAt;
      const isWarrantyActive = expiresAt ? now <= expiresAt : false;

      return {
        verified: true,
        isSoldByStore: true,
        deviceIdentifier: query,
        product: {
          name: saleItem.product.name,
          sku: saleItem.product.sku,
          brand: saleItem.product.brand?.name || null,
          category: saleItem.product.category.name,
          warrantyPolicy: saleItem.product.warrantyPolicy,
        },
        purchaseInfo: {
          invoiceNumber: saleItem.sale.invoiceNumber,
          soldAt: saleItem.sale.createdAt,
        },
        warranty: {
          status: isWarrantyActive ? 'ACTIVE' : 'EXPIRED',
          expiresAt,
          isWarrantyActive,
        },
      };
    }

    return {
      verified: false,
      isSoldByStore: false,
      deviceIdentifier: query,
      message: 'Device IMEI or serial number was not found in our sales ledger.',
    };
  }

  // ---------------------------------------------------------------------------
  // Gift Bundles
  // ---------------------------------------------------------------------------
  async createGiftBundle(dto: CreateGiftBundleDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Gift bundle must contain at least one item mapping');
    }

    return await this.prisma.giftBundle.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
        items: {
          create: dto.items.map((i) => ({
            primaryProductId: i.primaryProductId,
            giftProductId: i.giftProductId,
            giftQuantity: i.giftQuantity ?? 1,
          })),
        },
      },
      include: {
        items: {
          include: {
            primaryProduct: { select: { id: true, name: true, sku: true } },
            giftProduct: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });
  }

  async findAllGiftBundles() {
    return await this.prisma.giftBundle.findMany({
      where: { isActive: true },
      include: {
        items: {
          include: {
            primaryProduct: { select: { id: true, name: true, sku: true, sellingPrice: true } },
            giftProduct: { select: { id: true, name: true, sku: true, sellingPrice: true } },
          },
        },
      },
    });
  }
}
