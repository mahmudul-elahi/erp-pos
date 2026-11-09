import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import {
  AddCustomerAdjustmentDto,
  CreateCustomerDto,
  CustomerAdjustmentType,
  UpdateCustomerDto,
} from './dto/customer.dto.js';
import { PaginationDto, buildPaginationMeta } from '../../common/pagination/pagination.dto.js';

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateCustomerDto, actorId?: string) {
    const phone = dto.phone.trim();
    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    if (existing) {
      throw new BadRequestException(`Customer with phone "${phone}" already exists`);
    }

    const customer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          name: dto.name.trim(),
          phone,
          email: dto.email?.trim().toLowerCase() || null,
          address: dto.address?.trim() || null,
          city: dto.city?.trim() || null,
          postalCode: dto.postalCode?.trim() || null,
          notes: dto.notes?.trim() || null,
          creditLimit: dto.creditLimit !== undefined ? new Prisma.Decimal(dto.creditLimit) : null,
        },
      });

      // Opening balance recorded ONLY as an immutable ledger transaction
      if (dto.openingBalance !== undefined && dto.openingBalance !== 0) {
        const amountDecimal = new Prisma.Decimal(dto.openingBalance);
        const isDebit = amountDecimal.greaterThan(0); // Positive means customer owes money
        const absAmount = amountDecimal.abs();

        await tx.customerLedgerEntry.create({
          data: {
            customerId: created.id,
            branchId: dto.branchId || null,
            type: 'OPENING_BALANCE',
            amount: absAmount,
            debit: isDebit ? absAmount : new Prisma.Decimal(0),
            credit: !isDebit ? absAmount : new Prisma.Decimal(0),
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
      action: 'customers.create',
      entityType: 'Customer',
      entityId: customer.id,
      newValues: {
        name: customer.name,
        phone: customer.phone,
        openingBalance: dto.openingBalance || 0,
      },
    });

    return this.findOne(customer.id);
  }

  async findAll(pagination: PaginationDto) {
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
    };

    if (pagination.search) {
      where.OR = [
        { name: { contains: pagination.search, mode: 'insensitive' } },
        { phone: { contains: pagination.search, mode: 'insensitive' } },
        { email: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: pagination.sortOrder || 'desc' },
        include: {
          ledgerEntries: {
            select: { debit: true, credit: true },
          },
        },
      }),
    ]);

    const data = customers.map((c) => {
      let balance = new Prisma.Decimal(0);
      for (const entry of c.ledgerEntries) {
        balance = balance.plus(entry.debit).minus(entry.credit);
      }

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        city: c.city,
        notes: c.notes,
        creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
        currentBalance: balance.toNumber(), // Positive = due, Negative = advance
        isActive: c.isActive,
        createdAt: c.createdAt,
      };
    });

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        ledgerEntries: {
          select: { debit: true, credit: true },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    for (const entry of customer.ledgerEntries) {
      totalDebit = totalDebit.plus(entry.debit);
      totalCredit = totalCredit.plus(entry.credit);
    }
    const currentBalance = totalDebit.minus(totalCredit);

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      city: customer.city,
      postalCode: customer.postalCode,
      notes: customer.notes,
      creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
      totalDebit: totalDebit.toNumber(),
      totalCredit: totalCredit.toNumber(),
      currentBalance: currentBalance.toNumber(),
      isActive: customer.isActive,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  async getLedger(customerId: string, pagination: PaginationDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, name: true, phone: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const where: Prisma.CustomerLedgerEntryWhereInput = { customerId };

    const [total, entries] = await Promise.all([
      this.prisma.customerLedgerEntry.count({ where }),
      this.prisma.customerLedgerEntry.findMany({
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
      customer,
      data: entries.map((e) => ({
        id: e.id,
        type: e.type,
        amount: Number(e.amount),
        debit: Number(e.debit),
        credit: Number(e.credit),
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

  async addAdjustment(customerId: string, dto: AddCustomerAdjustmentDto, actorId?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (dto.amount <= 0) {
      throw new BadRequestException('Adjustment amount must be positive');
    }

    const amountDecimal = new Prisma.Decimal(dto.amount);
    const isDebit = dto.adjustmentType === CustomerAdjustmentType.DEBIT;

    const entry = await this.prisma.$transaction(async (tx) => {
      const latestEntry = await tx.customerLedgerEntry.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });

      const currentBalance = latestEntry
        ? new Prisma.Decimal(latestEntry.balanceAfter)
        : new Prisma.Decimal(0);

      const newBalance = isDebit
        ? currentBalance.plus(amountDecimal)
        : currentBalance.minus(amountDecimal);

      return tx.customerLedgerEntry.create({
        data: {
          customerId,
          branchId: dto.branchId || null,
          type: 'ADJUSTMENT',
          amount: amountDecimal,
          debit: isDebit ? amountDecimal : new Prisma.Decimal(0),
          credit: !isDebit ? amountDecimal : new Prisma.Decimal(0),
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
      action: 'customers.adjustment',
      entityType: 'CustomerLedgerEntry',
      entityId: entry.id,
      newValues: {
        customerId,
        type: dto.adjustmentType,
        amount: dto.amount,
        balanceAfter: Number(entry.balanceAfter),
        reason: dto.reason,
      },
    });

    return {
      message: 'Ledger adjustment recorded successfully',
      entry: {
        id: entry.id,
        type: entry.type,
        amount: Number(entry.amount),
        debit: Number(entry.debit),
        credit: Number(entry.credit),
        balanceAfter: Number(entry.balanceAfter),
        description: entry.description,
        createdAt: entry.createdAt,
      },
    };
  }

  async update(id: string, dto: UpdateCustomerDto, actorId?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (dto.phone && dto.phone !== customer.phone) {
      const existing = await this.prisma.customer.findUnique({
        where: { phone: dto.phone.trim() },
      });
      if (existing) {
        throw new BadRequestException(`Phone number "${dto.phone}" is already in use`);
      }
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.phone ? { phone: dto.phone.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim().toLowerCase() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
        ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.creditLimit !== undefined
          ? { creditLimit: dto.creditLimit ? new Prisma.Decimal(dto.creditLimit) : null }
          : {}),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'customers.update',
      entityType: 'Customer',
      entityId: id,
      newValues: { name: updated.name, phone: updated.phone },
    });

    return this.findOne(id);
  }

  async remove(id: string, actorId?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'customers.delete',
      entityType: 'Customer',
      entityId: id,
    });

    return { message: 'Customer profile archived successfully' };
  }
}
