import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import {
  AddSupplierAdjustmentDto,
  CreateSupplierDto,
  SupplierAdjustmentType,
  UpdateSupplierDto,
} from './dto/supplier.dto.js';
import { PaginationDto, buildPaginationMeta } from '../../common/pagination/pagination.dto.js';

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateSupplierDto, actorId?: string) {
    const phone = dto.phone.trim();
    const existing = await this.prisma.supplier.findUnique({ where: { phone } });
    if (existing) {
      throw new BadRequestException(`Supplier with phone "${phone}" already exists`);
    }

    const supplier = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: {
          companyName: dto.companyName.trim(),
          contactPerson: dto.contactPerson?.trim() || null,
          phone,
          email: dto.email?.trim().toLowerCase() || null,
          address: dto.address?.trim() || null,
          taxNumber: dto.taxNumber?.trim() || null,
          tradeLicense: dto.tradeLicense?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });

      // Opening balance recorded ONLY as an immutable ledger transaction
      if (dto.openingBalance !== undefined && dto.openingBalance !== 0) {
        const amountDecimal = new Prisma.Decimal(dto.openingBalance);
        const isPayable = amountDecimal.greaterThan(0); // Positive means store owes supplier
        const absAmount = amountDecimal.abs();

        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: created.id,
            branchId: dto.branchId || null,
            type: 'OPENING_BALANCE',
            amount: absAmount,
            credit: isPayable ? absAmount : new Prisma.Decimal(0),
            debit: !isPayable ? absAmount : new Prisma.Decimal(0),
            balanceAfter: amountDecimal,
            referenceType: 'OPENING_BALANCE',
            referenceId: created.id,
            description: 'Initial auditable opening balance',
          },
        });
      }

      return created;
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: dto.branchId,
      action: 'suppliers.create',
      entityType: 'Supplier',
      entityId: supplier.id,
      newValues: {
        companyName: supplier.companyName,
        phone: supplier.phone,
        openingBalance: dto.openingBalance || 0,
      },
    });

    return this.findOne(supplier.id);
  }

  async findAll(pagination: PaginationDto) {
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
    };

    if (pagination.search) {
      where.OR = [
        { companyName: { contains: pagination.search, mode: 'insensitive' } },
        { contactPerson: { contains: pagination.search, mode: 'insensitive' } },
        { phone: { contains: pagination.search, mode: 'insensitive' } },
        { email: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const [total, suppliers] = await Promise.all([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { companyName: 'asc' },
        include: {
          ledgerEntries: {
            select: { debit: true, credit: true },
          },
        },
      }),
    ]);

    const data = suppliers.map((s) => {
      let balance = new Prisma.Decimal(0);
      for (const entry of s.ledgerEntries) {
        // Supplier balance: Credit increases payable (we owe them), Debit decreases payable (we paid them)
        balance = balance.plus(entry.credit).minus(entry.debit);
      }

      return {
        id: s.id,
        companyName: s.companyName,
        contactPerson: s.contactPerson,
        phone: s.phone,
        email: s.email,
        address: s.address,
        taxNumber: s.taxNumber,
        notes: s.notes,
        currentPayable: balance.toNumber(), // Positive = store owes supplier, Negative = store paid in advance
        isActive: s.isActive,
        createdAt: s.createdAt,
      };
    });

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        ledgerEntries: {
          select: { debit: true, credit: true },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    let totalCredit = new Prisma.Decimal(0);
    let totalDebit = new Prisma.Decimal(0);
    for (const entry of supplier.ledgerEntries) {
      totalCredit = totalCredit.plus(entry.credit);
      totalDebit = totalDebit.plus(entry.debit);
    }
    const currentPayable = totalCredit.minus(totalDebit);

    return {
      id: supplier.id,
      companyName: supplier.companyName,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      taxNumber: supplier.taxNumber,
      tradeLicense: supplier.tradeLicense,
      notes: supplier.notes,
      totalPurchasedOrPayable: totalCredit.toNumber(),
      totalPaidOrDebited: totalDebit.toNumber(),
      currentPayable: currentPayable.toNumber(),
      isActive: supplier.isActive,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
    };
  }

  async getLedger(supplierId: string, pagination: PaginationDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
      select: { id: true, companyName: true, phone: true },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const where: Prisma.SupplierLedgerEntryWhereInput = { supplierId };

    const [total, entries] = await Promise.all([
      this.prisma.supplierLedgerEntry.count({ where }),
      this.prisma.supplierLedgerEntry.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: pagination.sortOrder || 'desc' },
        include: {
          branch: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);

    return {
      supplier,
      data: entries.map((e) => ({
        id: e.id,
        type: e.type,
        amount: Number(e.amount),
        credit: Number(e.credit), // Increases payable
        debit: Number(e.debit),   // Decreases payable
        balanceAfter: Number(e.balanceAfter),
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        description: e.description,
        branch: e.branch,
        createdAt: e.createdAt,
      })),
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async addAdjustment(supplierId: string, dto: AddSupplierAdjustmentDto, actorId?: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (dto.amount <= 0) {
      throw new BadRequestException('Adjustment amount must be positive');
    }

    const amountDecimal = new Prisma.Decimal(dto.amount);
    const isCredit = dto.adjustmentType === SupplierAdjustmentType.CREDIT;

    const entry = await this.prisma.$transaction(async (tx) => {
      const latestEntry = await tx.supplierLedgerEntry.findFirst({
        where: { supplierId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });

      const currentBalance = latestEntry
        ? new Prisma.Decimal(latestEntry.balanceAfter)
        : new Prisma.Decimal(0);

      const newBalance = isCredit
        ? currentBalance.plus(amountDecimal)
        : currentBalance.minus(amountDecimal);

      return tx.supplierLedgerEntry.create({
        data: {
          supplierId,
          branchId: dto.branchId || null,
          type: 'ADJUSTMENT',
          amount: amountDecimal,
          credit: isCredit ? amountDecimal : new Prisma.Decimal(0),
          debit: !isCredit ? amountDecimal : new Prisma.Decimal(0),
          balanceAfter: newBalance,
          referenceType: 'MANUAL_ADJUSTMENT',
          description: dto.reason.trim(),
        },
        include: {
          branch: { select: { id: true, name: true, code: true } },
        },
      });
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: dto.branchId,
      action: 'suppliers.adjustment',
      entityType: 'SupplierLedgerEntry',
      entityId: entry.id,
      newValues: {
        supplierId,
        type: dto.adjustmentType,
        amount: dto.amount,
        balanceAfter: Number(entry.balanceAfter),
        reason: dto.reason,
      },
    });

    return {
      message: 'Supplier ledger adjustment recorded successfully',
      entry: {
        id: entry.id,
        type: entry.type,
        amount: Number(entry.amount),
        credit: Number(entry.credit),
        debit: Number(entry.debit),
        balanceAfter: Number(entry.balanceAfter),
        description: entry.description,
        createdAt: entry.createdAt,
      },
    };
  }

  async update(id: string, dto: UpdateSupplierDto, actorId?: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (dto.phone && dto.phone !== supplier.phone) {
      const existing = await this.prisma.supplier.findUnique({
        where: { phone: dto.phone.trim() },
      });
      if (existing) {
        throw new BadRequestException(`Phone number "${dto.phone}" is already in use`);
      }
    }

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.companyName ? { companyName: dto.companyName.trim() } : {}),
        ...(dto.contactPerson !== undefined ? { contactPerson: dto.contactPerson?.trim() || null } : {}),
        ...(dto.phone ? { phone: dto.phone.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim().toLowerCase() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.taxNumber !== undefined ? { taxNumber: dto.taxNumber?.trim() || null } : {}),
        ...(dto.tradeLicense !== undefined ? { tradeLicense: dto.tradeLicense?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'suppliers.update',
      entityType: 'Supplier',
      entityId: id,
      newValues: { companyName: updated.companyName, phone: updated.phone },
    });

    return this.findOne(id);
  }

  async remove(id: string, actorId?: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'suppliers.delete',
      entityType: 'Supplier',
      entityId: id,
    });

    return { message: 'Supplier profile archived successfully' };
  }
}
