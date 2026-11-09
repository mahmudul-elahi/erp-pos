import { randomBytes } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import type { CreatePriceTierDto } from './dto/create-price-tier.dto.js';
import type { CreatePartnerDto } from './dto/create-partner.dto.js';
import type { UpdatePartnerDto } from './dto/update-partner.dto.js';
import type { RecordPartnerTransactionDto } from './dto/partner-transaction.dto.js';
import type { QueryPartnersDto } from './dto/query-partners.dto.js';
import {
  buildPaginationMeta,
  type PaginatedResult,
  PaginationDto,
} from '../../common/pagination/pagination.dto.js';
import {
  PartnerLedgerType,
  PartnerStatus,
  PartnerType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Price Tiers
  // ---------------------------------------------------------------------------
  async createPriceTier(dto: CreatePriceTierDto, actorId?: string) {
    const existing = await this.prisma.partnerPriceTier.findUnique({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new ConflictException(`Price tier with name "${dto.name}" already exists`);
    }

    const tier = await this.prisma.partnerPriceTier.create({
      data: {
        name: dto.name.trim(),
        discountPercentage: new Prisma.Decimal(dto.discountPercentage),
        description: dto.description?.trim() || null,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'partner.tier_create',
      entityType: 'PartnerPriceTier',
      entityId: tier.id,
      newValues: { name: tier.name, discountPercentage: tier.discountPercentage.toString() },
    });

    return tier;
  }

  async getPriceTiers() {
    return this.prisma.partnerPriceTier.findMany({
      orderBy: { discountPercentage: 'asc' },
      include: {
        _count: { select: { partners: true } },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Partner Management
  // ---------------------------------------------------------------------------
  async createPartner(dto: CreatePartnerDto, actorId?: string) {
    const existingPhone = await this.prisma.partner.findUnique({
      where: { phone: dto.phone.trim() },
    });
    if (existingPhone) {
      throw new ConflictException(`Partner with phone "${dto.phone}" already exists`);
    }

    if (dto.email) {
      const existingEmail = await this.prisma.partner.findUnique({
        where: { email: dto.email.trim().toLowerCase() },
      });
      if (existingEmail) {
        throw new ConflictException(`Partner with email "${dto.email}" already exists`);
      }
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const uid = randomBytes(3).toString('hex').toUpperCase();
    const partnerNumber = `PTR-${dateStr}-${uid}`;

    const partner = await this.prisma.partner.create({
      data: {
        partnerNumber,
        companyName: dto.companyName.trim(),
        contactPerson: dto.contactPerson.trim(),
        phone: dto.phone.trim(),
        email: dto.email?.trim().toLowerCase() || null,
        address: dto.address.trim(),
        city: dto.city?.trim() || null,
        type: dto.type || PartnerType.RETAILER,
        status: PartnerStatus.APPROVED,
        priceTierId: dto.priceTierId || null,
        creditLimit: new Prisma.Decimal(dto.creditLimit ?? 0),
        commissionRate: new Prisma.Decimal(dto.commissionRate ?? 0),
        tradeLicense: dto.tradeLicense?.trim() || null,
        binNumber: dto.binNumber?.trim() || null,
        nidNumber: dto.nidNumber?.trim() || null,
        branchId: dto.branchId || null,
        createdById: actorId,
      },
      include: {
        priceTier: true,
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'partner.create',
      entityType: 'Partner',
      entityId: partner.id,
      newValues: {
        partnerNumber: partner.partnerNumber,
        companyName: partner.companyName,
        type: partner.type,
      },
    });

    return partner;
  }

  async findAll(query: QueryPartnersDto): Promise<PaginatedResult<any>> {
    const where: Prisma.PartnerWhereInput = {};

    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.priceTierId) {
      where.priceTierId = query.priceTierId;
    }
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { companyName: { contains: s, mode: 'insensitive' } },
        { contactPerson: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
        { partnerNumber: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.partner.count({ where }),
      this.prisma.partner.findMany({
        where,
        include: {
          priceTier: true,
          branch: { select: { id: true, name: true, code: true } },
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

  async findById(id: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      include: {
        priceTier: true,
        branch: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { ledgerEntries: true, orders: true } },
      },
    });

    if (!partner) {
      throw new NotFoundException(`Partner with ID "${id}" not found`);
    }

    return partner;
  }

  async updatePartner(id: string, dto: UpdatePartnerDto, actorId?: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) {
      throw new NotFoundException(`Partner with ID "${id}" not found`);
    }

    const updated = await this.prisma.partner.update({
      where: { id },
      data: {
        companyName: dto.companyName?.trim(),
        contactPerson: dto.contactPerson?.trim(),
        phone: dto.phone?.trim(),
        email: dto.email !== undefined ? dto.email?.trim().toLowerCase() || null : undefined,
        address: dto.address?.trim(),
        city: dto.city !== undefined ? dto.city?.trim() || null : undefined,
        type: dto.type,
        status: dto.status,
        priceTierId: dto.priceTierId !== undefined ? dto.priceTierId || null : undefined,
        creditLimit: dto.creditLimit !== undefined ? new Prisma.Decimal(dto.creditLimit) : undefined,
        commissionRate: dto.commissionRate !== undefined ? new Prisma.Decimal(dto.commissionRate) : undefined,
      },
      include: {
        priceTier: true,
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'partner.update',
      entityType: 'Partner',
      entityId: id,
      newValues: { status: updated.status, creditLimit: updated.creditLimit.toString() },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Wholesale Pricing Calculation
  // ---------------------------------------------------------------------------
  async calculateWholesalePrice(partnerId: string, basePrice: number) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: { priceTier: true },
    });

    if (!partner) {
      throw new NotFoundException(`Partner "${partnerId}" not found`);
    }

    const discountPercentage = partner.priceTier ? Number(partner.priceTier.discountPercentage) : 0;
    const discountAmount = (basePrice * discountPercentage) / 100;
    const finalPrice = Math.max(0, basePrice - discountAmount);

    return {
      partnerId,
      partnerName: partner.companyName,
      tierName: partner.priceTier?.name ?? 'Standard',
      discountPercentage,
      basePrice,
      discountAmount,
      finalPrice,
    };
  }

  // ---------------------------------------------------------------------------
  // Partner Credit Ledger & Payments
  // ---------------------------------------------------------------------------
  async recordLedgerTransaction(
    partnerId: string,
    dto: RecordPartnerTransactionDto,
    actorId?: string,
  ) {
    const amountDecimal = new Prisma.Decimal(dto.amount);
    if (amountDecimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Transaction amount must be greater than 0');
    }

    return await this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.findUnique({ where: { id: partnerId } });
      if (!partner) {
        throw new NotFoundException(`Partner with ID "${partnerId}" not found`);
      }

      if (partner.status === PartnerStatus.SUSPENDED) {
        throw new BadRequestException(`Partner "${partner.companyName}" is suspended`);
      }

      const balanceBefore = partner.outstandingBalance;
      let balanceAfter = balanceBefore;

      if (dto.type === PartnerLedgerType.INVOICE) {
        // Increases receivable from partner
        balanceAfter = balanceBefore.plus(amountDecimal);

        // Enforce credit limit if set (> 0)
        if (partner.creditLimit.greaterThan(0) && balanceAfter.greaterThan(partner.creditLimit)) {
          throw new BadRequestException(
            `Credit limit of ${partner.creditLimit.toString()} BDT exceeded. Current: ${balanceBefore.toString()} BDT, Requested: ${amountDecimal.toString()} BDT, Total: ${balanceAfter.toString()} BDT`,
          );
        }
      } else if (dto.type === PartnerLedgerType.PAYMENT || dto.type === PartnerLedgerType.COMMISSION) {
        // Partner pays or receives commission credit -> reduces outstanding receivable
        balanceAfter = balanceBefore.minus(amountDecimal);
      } else if (dto.type === PartnerLedgerType.ADJUSTMENT) {
        balanceAfter = balanceBefore.plus(amountDecimal);
      }

      const entry = await tx.partnerLedgerEntry.create({
        data: {
          partnerId,
          type: dto.type,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          referenceType: dto.referenceType || 'MANUAL',
          referenceId: dto.referenceId || null,
          notes: dto.notes?.trim() || null,
          createdById: actorId,
        },
      });

      const updatedPartner = await tx.partner.update({
        where: { id: partnerId },
        data: { outstandingBalance: balanceAfter },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'partner.ledger_record',
        entityType: 'PartnerLedgerEntry',
        entityId: entry.id,
        newValues: {
          partnerId,
          type: dto.type,
          amount: amountDecimal.toString(),
          balanceAfter: balanceAfter.toString(),
        },
      });

      return {
        entry,
        partner: updatedPartner,
      };
    });
  }

  async getLedger(partnerId: string, query: PaginationDto): Promise<PaginatedResult<any>> {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) {
      throw new NotFoundException(`Partner with ID "${partnerId}" not found`);
    }

    const where: Prisma.PartnerLedgerEntryWhereInput = { partnerId };

    const [total, data] = await Promise.all([
      this.prisma.partnerLedgerEntry.count({ where }),
      this.prisma.partnerLedgerEntry.findMany({
        where,
        include: {
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
}
