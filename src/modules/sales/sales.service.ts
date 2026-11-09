import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementType,
  LedgerEntryType,
  Prisma,
  SaleChannel,
  SaleReturnStatus,
  SaleStatus,
  ShiftStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import {
  CashMovementDto,
  CloseShiftDto,
  CreateSaleDto,
  CreateSaleReturnDto,
  OpenShiftDto,
  SaleQueryDto,
  SaleReturnQueryDto,
  ShiftQueryDto,
} from './dto/sales.dto.js';
import {
  buildPaginationMeta,
  PaginatedResult,
} from '../../common/pagination/pagination.dto.js';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private auditLogsService: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cash Register Shifts
  // ---------------------------------------------------------------------------
  async openShift(dto: OpenShiftDto, userId: string) {
    const existing = await this.prisma.cashRegisterShift.findFirst({
      where: {
        userId,
        status: ShiftStatus.OPEN,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'You already have an open cash register shift. Please close it first.',
      );
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch || !branch.isActive || branch.deletedAt) {
      throw new NotFoundException(`Active branch "${dto.branchId}" not found`);
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const uid = randomBytes(4).toString('hex').toUpperCase();
    const shiftNumber = `SHIFT-${dateStr}-${uid}`;

    const shift = await this.prisma.cashRegisterShift.create({
      data: {
        shiftNumber,
        branchId: dto.branchId,
        userId,
        status: ShiftStatus.OPEN,
        openingCashFloat: new Prisma.Decimal(dto.openingCashFloat),
        openingNotes: dto.notes?.trim() || null,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditLogsService.log({
      userId,
      branchId: dto.branchId,
      action: 'shift.open',
      entityType: 'CashRegisterShift',
      entityId: shift.id,
      newValues: {
        shiftNumber,
        openingCashFloat: dto.openingCashFloat,
      },
    });

    return shift;
  }

  async getCurrentShift(userId: string) {
    const shift = await this.prisma.cashRegisterShift.findFirst({
      where: {
        userId,
        status: ShiftStatus.OPEN,
      },
      include: {
        branch: true,
        user: { select: { id: true, name: true, email: true } },
        cashMovements: { orderBy: { createdAt: 'desc' } },
        _count: { select: { sales: true, returns: true } },
      },
    });

    if (!shift) {
      return null;
    }

    // Compute live shift stats
    const salesPayments = await this.prisma.salePayment.findMany({
      where: {
        sale: { shiftId: shift.id, status: { not: SaleStatus.CANCELLED } },
      },
    });

    const paymentBreakdown: Record<string, Prisma.Decimal> = {};
    for (const p of salesPayments) {
      const method = p.method.toUpperCase();
      paymentBreakdown[method] = (paymentBreakdown[method] ?? new Prisma.Decimal(0)).plus(p.amount);
    }

    return {
      ...shift,
      paymentBreakdown,
    };
  }

  async recordCashMovement(shiftId: string, dto: CashMovementDto, actorId: string) {
    const shift = await this.prisma.cashRegisterShift.findUnique({
      where: { id: shiftId },
    });
    if (!shift) {
      throw new NotFoundException(`Shift "${shiftId}" not found`);
    }
    if (shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('Cannot record cash movement on a closed shift');
    }

    const movement = await this.prisma.shiftCashMovement.create({
      data: {
        shiftId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        reason: dto.reason.trim(),
        createdById: actorId,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: shift.branchId,
      action: `shift.${dto.type.toLowerCase()}`,
      entityType: 'ShiftCashMovement',
      entityId: movement.id,
      newValues: { amount: dto.amount, reason: dto.reason },
    });

    return movement;
  }

  async closeShift(shiftId: string, dto: CloseShiftDto, actorId: string) {
    const shift = await this.prisma.cashRegisterShift.findUnique({
      where: { id: shiftId },
      include: {
        cashMovements: true,
      },
    });

    if (!shift) {
      throw new NotFoundException(`Shift "${shiftId}" not found`);
    }
    if (shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('Shift is already closed');
    }

    // 1. Calculate Cash from Sales during this shift
    const cashSales = await this.prisma.salePayment.aggregate({
      where: {
        method: { equals: 'CASH', mode: 'insensitive' },
        sale: { shiftId, status: { not: SaleStatus.CANCELLED } },
      },
      _sum: { amount: true },
    });
    const totalCashFromSales = cashSales._sum.amount ?? new Prisma.Decimal(0);

    // 2. Calculate Cash Refunds during this shift
    const cashReturns = await this.prisma.saleReturn.aggregate({
      where: {
        shiftId,
        refundMethod: { equals: 'CASH', mode: 'insensitive' },
        status: SaleReturnStatus.COMPLETED,
      },
      _sum: { totalRefund: true },
    });
    const totalCashRefunds = cashReturns._sum.totalRefund ?? new Prisma.Decimal(0);

    // 3. Cash movements
    let cashInTotal = new Prisma.Decimal(0);
    let cashOutTotal = new Prisma.Decimal(0);
    for (const mov of shift.cashMovements) {
      if (mov.type === CashMovementType.CASH_IN) {
        cashInTotal = cashInTotal.plus(mov.amount);
      } else if (mov.type === CashMovementType.CASH_OUT) {
        cashOutTotal = cashOutTotal.plus(mov.amount);
      }
    }

    // Expected = Float + CashSales + CashIn - CashOut - CashRefunds
    const expectedCash = shift.openingCashFloat
      .plus(totalCashFromSales)
      .plus(cashInTotal)
      .minus(cashOutTotal)
      .minus(totalCashRefunds);

    const actualCash = new Prisma.Decimal(dto.closingCashActual);
    const cashDifference = actualCash.minus(expectedCash);

    const updated = await this.prisma.cashRegisterShift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.CLOSED,
        closingCashExpected: expectedCash,
        closingCashActual: actualCash,
        cashDifference,
        closedAt: new Date(),
        closingNotes: dto.notes?.trim() || null,
      },
      include: {
        branch: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: shift.branchId,
      action: 'shift.close',
      entityType: 'CashRegisterShift',
      entityId: shiftId,
      newValues: {
        expectedCash: expectedCash.toString(),
        actualCash: actualCash.toString(),
        cashDifference: cashDifference.toString(),
      },
    });

    return updated;
  }

  async getShifts(query: ShiftQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.CashRegisterShiftWhereInput = {};
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [total, data] = await Promise.all([
      this.prisma.cashRegisterShift.count({ where }),
      this.prisma.cashRegisterShift.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { sales: true, returns: true, cashMovements: true } },
        },
        orderBy: { openedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  }

  async getShiftById(id: string) {
    const shift = await this.prisma.cashRegisterShift.findUnique({
      where: { id },
      include: {
        branch: true,
        user: { select: { id: true, name: true, email: true } },
        cashMovements: {
          orderBy: { createdAt: 'desc' },
          include: { createdBy: { select: { id: true, name: true } } },
        },
        sales: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: { payments: true },
        },
        returns: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException(`Shift "${id}" not found`);
    }

    return shift;
  }

  // ---------------------------------------------------------------------------
  // POS Checkout & Sales
  // ---------------------------------------------------------------------------
  async checkout(dto: CreateSaleDto, actorId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
      include: { warehouses: { where: { isActive: true, deletedAt: null } } },
    });
    if (!branch || !branch.isActive || branch.deletedAt) {
      throw new NotFoundException(`Active branch "${dto.branchId}" not found`);
    }

    // Determine warehouse
    let warehouseId = dto.warehouseId;
    if (!warehouseId) {
      if (!branch.warehouses || branch.warehouses.length === 0) {
        throw new BadRequestException(`Branch "${branch.name}" has no active warehouses attached`);
      }
      warehouseId = branch.warehouses[0].id;
    }

    // Determine shift
    let shiftId = dto.shiftId;
    if (!shiftId) {
      const openShift = await this.prisma.cashRegisterShift.findFirst({
        where: { userId: actorId, branchId: dto.branchId, status: ShiftStatus.OPEN },
      });
      if (openShift) {
        shiftId = openShift.id;
      }
    }

    // Verify Customer if specified
    let customer: any = null;
    if (dto.customerId) {
      customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
      });
      if (!customer || !customer.isActive || customer.deletedAt) {
        throw new NotFoundException(`Active customer "${dto.customerId}" not found`);
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      let subtotal = new Prisma.Decimal(0);
      const saleItemsToCreate: {
        productId: string;
        variantId: string | null;
        quantity: number;
        unitPrice: Prisma.Decimal;
        costPriceSnapshot: Prisma.Decimal;
        discountAmount: Prisma.Decimal;
        totalPrice: Prisma.Decimal;
        serialNumbers: string[];
        warrantyMonths: number;
        warrantyExpiresAt: Date | null;
      }[] = [];

      for (const item of dto.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product || product.deletedAt) {
          throw new NotFoundException(`Product "${item.productId}" not found`);
        }

        let variant: any = null;
        if (item.variantId) {
          variant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
          });
          if (!variant || variant.productId !== item.productId || variant.deletedAt) {
            throw new NotFoundException(
              `Product variant "${item.variantId}" not found for product "${product.name}"`,
            );
          }
        }

        // Determine price and cost snapshot
        const unitPriceNum = item.unitPrice ?? (variant?.sellingPrice ?? product.sellingPrice);
        const unitPriceDecimal = new Prisma.Decimal(unitPriceNum);
        const costPriceDecimal = new Prisma.Decimal(
          variant?.costPrice ?? product.costPrice ?? 0,
        );

        const itemDiscount = new Prisma.Decimal(item.discountAmount ?? 0);
        const itemTotal = unitPriceDecimal.mul(item.quantity).minus(itemDiscount);
        subtotal = subtotal.plus(itemTotal);

        // Warranty calculation
        const warrantyMonths = product.warrantyMonths ?? 0;
        let warrantyExpiresAt: Date | null = null;
        if (warrantyMonths > 0) {
          warrantyExpiresAt = new Date();
          warrantyExpiresAt.setMonth(warrantyExpiresAt.getMonth() + warrantyMonths);
        }

        // Deduct inventory stock
        await this.inventoryService.adjustStockTx(tx, {
          warehouseId,
          productId: item.productId,
          variantId: item.variantId,
          quantityDelta: -item.quantity,
          type: StockMovementType.SALE,
          referenceType: 'SALE',
          serialNumbers: item.serialNumbers,
          reason: `POS Sale in branch ${branch.code}`,
          actorId,
        });

        saleItemsToCreate.push({
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.quantity,
          unitPrice: unitPriceDecimal,
          costPriceSnapshot: costPriceDecimal,
          discountAmount: itemDiscount,
          totalPrice: itemTotal,
          serialNumbers: item.serialNumbers || [],
          warrantyMonths,
          warrantyExpiresAt,
        });
      }

      // Financials
      const invoiceDiscount = new Prisma.Decimal(dto.discountAmount ?? 0);
      const invoiceTax = new Prisma.Decimal(dto.taxAmount ?? 0);
      const totalAmount = subtotal.plus(invoiceTax).minus(invoiceDiscount);

      if (totalAmount.lessThan(0)) {
        throw new BadRequestException('Total sale amount cannot be negative');
      }

      // Payments calculation
      let tenderedAmount = new Prisma.Decimal(0);
      const paymentsToCreate = dto.payments.map((p) => {
        const amtDecimal = new Prisma.Decimal(p.amount);
        tenderedAmount = tenderedAmount.plus(amtDecimal);
        return {
          method: p.method.toUpperCase(),
          amount: amtDecimal,
          reference: p.reference?.trim() || null,
        };
      });

      let paidAmount: Prisma.Decimal;
      let changeAmount: Prisma.Decimal;
      let dueAmount: Prisma.Decimal;

      if (tenderedAmount.greaterThanOrEqualTo(totalAmount)) {
        paidAmount = totalAmount;
        changeAmount = tenderedAmount.minus(totalAmount);
        dueAmount = new Prisma.Decimal(0);
      } else {
        if (!dto.customerId) {
          throw new BadRequestException(
            `Walk-in customer must pay full amount (${totalAmount.toString()}). Received only ${tenderedAmount.toString()}`,
          );
        }
        paidAmount = tenderedAmount;
        changeAmount = new Prisma.Decimal(0);
        dueAmount = totalAmount.minus(tenderedAmount);

        // Credit limit check if set
        if (customer && customer.creditLimit) {
          const lastCustomerEntry = await tx.customerLedgerEntry.findFirst({
            where: { customerId: customer.id },
            orderBy: { createdAt: 'desc' },
          });
          const currentCustomerBalance = lastCustomerEntry
            ? lastCustomerEntry.balanceAfter
            : new Prisma.Decimal(0);
          const projectedDebt = currentCustomerBalance.plus(dueAmount);
          if (projectedDebt.greaterThan(customer.creditLimit)) {
            throw new BadRequestException(
              `Sale exceeds customer credit limit (${customer.creditLimit.toString()}). Current due: ${currentCustomerBalance.toString()}, new due: ${dueAmount.toString()}`,
            );
          }
        }
      }

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const uid = randomBytes(4).toString('hex').toUpperCase();
      const invoiceNumber = `INV-${dateStr}-${uid}`;

      // 1. Create Sale
      const sale = await tx.sale.create({
        data: {
          invoiceNumber,
          branchId: dto.branchId,
          warehouseId,
          customerId: dto.customerId || null,
          shiftId: shiftId || null,
          userId: actorId,
          channel: dto.channel ?? SaleChannel.POS,
          status: SaleStatus.COMPLETED,
          subtotal,
          discountAmount: invoiceDiscount,
          taxAmount: invoiceTax,
          totalAmount,
          paidAmount,
          changeAmount,
          dueAmount,
          notes: dto.notes?.trim() || null,
          items: {
            create: saleItemsToCreate,
          },
          payments: {
            create: paymentsToCreate,
          },
        },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
              variant: { select: { id: true, name: true, sku: true } },
            },
          },
          payments: true,
          customer: true,
          branch: true,
        },
      });

      // 2. Customer Ledger (Double-entry recording if customer is registered)
      if (dto.customerId) {
        const lastEntry = await tx.customerLedgerEntry.findFirst({
          where: { customerId: dto.customerId },
          orderBy: { createdAt: 'desc' },
        });
        const currentBalance = lastEntry ? lastEntry.balanceAfter : new Prisma.Decimal(0);

        // Debit customer for total sale
        const afterSaleBalance = currentBalance.plus(totalAmount);
        await tx.customerLedgerEntry.create({
          data: {
            customerId: dto.customerId,
            branchId: dto.branchId,
            type: LedgerEntryType.SALE,
            amount: totalAmount,
            debit: totalAmount,
            credit: new Prisma.Decimal(0),
            balanceAfter: afterSaleBalance,
            referenceType: 'SALE',
            referenceId: sale.id,
            description: `POS Sale invoice ${invoiceNumber}`,
          },
        });

        // Credit customer for payment tendered
        if (paidAmount.greaterThan(0)) {
          const afterPaymentBalance = afterSaleBalance.minus(paidAmount);
          await tx.customerLedgerEntry.create({
            data: {
              customerId: dto.customerId,
              branchId: dto.branchId,
              type: LedgerEntryType.PAYMENT,
              amount: paidAmount,
              debit: new Prisma.Decimal(0),
              credit: paidAmount,
              balanceAfter: afterPaymentBalance,
              referenceType: 'SALE_PAYMENT',
              referenceId: sale.id,
              description: `Payment for invoice ${invoiceNumber}`,
            },
          });
        }
      }

      await this.auditLogsService.log({
        userId: actorId,
        branchId: dto.branchId,
        action: 'sale.checkout',
        entityType: 'Sale',
        entityId: sale.id,
        newValues: {
          invoiceNumber,
          totalAmount: totalAmount.toString(),
          paidAmount: paidAmount.toString(),
          dueAmount: dueAmount.toString(),
          itemCount: dto.items.length,
        },
      });

      return sale;
    });
  }

  async getSales(query: SaleQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.SaleWhereInput = {};
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.shiftId) {
      where.shiftId = query.shiftId;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.channel) {
      where.channel = query.channel;
    }
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search.trim(), mode: 'insensitive' } },
        { customer: { name: { contains: query.search.trim(), mode: 'insensitive' } } },
        { customer: { phone: { contains: query.search.trim(), mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, name: true } },
          payments: true,
          _count: { select: { items: true, returns: true } },
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

  async getSaleById(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        branch: true,
        warehouse: true,
        user: { select: { id: true, name: true, email: true } },
        shift: { select: { id: true, shiftNumber: true, status: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, barcode: true } },
            variant: { select: { id: true, name: true, sku: true, barcode: true } },
          },
        },
        payments: true,
        returns: {
          include: { items: true },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException(`Sale "${id}" not found`);
    }

    return sale;
  }

  // ---------------------------------------------------------------------------
  // Sales Returns & Refunds
  // ---------------------------------------------------------------------------
  async createReturn(dto: CreateSaleReturnDto, actorId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: dto.saleId },
      include: {
        items: true,
        returns: { include: { items: true } },
      },
    });

    if (!sale) {
      throw new NotFoundException(`Sale "${dto.saleId}" not found`);
    }
    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('Cannot return items from a cancelled sale');
    }

    // Map already returned quantities
    const alreadyReturnedMap = new Map<string, number>();
    for (const ret of sale.returns) {
      for (const rItem of ret.items) {
        if (rItem.saleItemId) {
          alreadyReturnedMap.set(
            rItem.saleItemId,
            (alreadyReturnedMap.get(rItem.saleItemId) ?? 0) + rItem.quantity,
          );
        }
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      let totalRefund = new Prisma.Decimal(0);
      const returnItemsData: {
        saleItemId: string;
        productId: string;
        variantId: string | null;
        quantity: number;
        unitPrice: Prisma.Decimal;
        refundAmount: Prisma.Decimal;
        serialNumbers: string[];
        reason: string | null;
      }[] = [];

      for (const item of dto.items) {
        const saleItem = sale.items.find((i) => i.id === item.saleItemId);
        if (!saleItem) {
          throw new NotFoundException(
            `Sale item "${item.saleItemId}" not found in sale "${sale.invoiceNumber}"`,
          );
        }

        const alreadyReturned = alreadyReturnedMap.get(saleItem.id) ?? 0;
        const availableToReturn = saleItem.quantity - alreadyReturned;

        if (item.quantity > availableToReturn) {
          throw new BadRequestException(
            `Cannot return ${item.quantity} units for product. Available to return: ${availableToReturn}`,
          );
        }

        const refundAmt = saleItem.unitPrice.mul(item.quantity);
        totalRefund = totalRefund.plus(refundAmt);

        returnItemsData.push({
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          variantId: saleItem.variantId,
          quantity: item.quantity,
          unitPrice: saleItem.unitPrice,
          refundAmount: refundAmt,
          serialNumbers: item.serialNumbers || [],
          reason: item.reason?.trim() || null,
        });

        // Restore stock to warehouse with movement SALE_RETURN
        await this.inventoryService.adjustStockTx(tx, {
          warehouseId: sale.warehouseId,
          productId: saleItem.productId,
          variantId: saleItem.variantId,
          quantityDelta: item.quantity,
          type: StockMovementType.SALE_RETURN,
          referenceType: 'SALE_RETURN',
          serialNumbers: item.serialNumbers,
          reason: `Sale Return: ${dto.reason}`,
          actorId,
        });
      }

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const uid = randomBytes(4).toString('hex').toUpperCase();
      const returnNumber = `SRTN-${dateStr}-${uid}`;

      // Check current open shift of actor
      const openShift = await tx.cashRegisterShift.findFirst({
        where: { userId: actorId, branchId: sale.branchId, status: ShiftStatus.OPEN },
      });

      // 1. Create SaleReturn
      const saleReturn = await tx.saleReturn.create({
        data: {
          returnNumber,
          saleId: sale.id,
          branchId: sale.branchId,
          warehouseId: sale.warehouseId,
          customerId: sale.customerId,
          shiftId: openShift ? openShift.id : sale.shiftId,
          status: SaleReturnStatus.COMPLETED,
          totalRefund,
          refundMethod: (dto.refundMethod ?? 'CASH').toUpperCase(),
          reason: dto.reason.trim(),
          notes: dto.notes?.trim() || null,
          createdById: actorId,
          items: {
            create: returnItemsData,
          },
        },
        include: {
          items: true,
          sale: true,
          customer: true,
        },
      });

      // 2. Update Sale Status
      const totalOriginalQuantity = sale.items.reduce((acc, i) => acc + i.quantity, 0);
      const totalReturnedSoFar =
        Array.from(alreadyReturnedMap.values()).reduce((a, b) => a + b, 0) +
        dto.items.reduce((acc, i) => acc + i.quantity, 0);

      const newSaleStatus =
        totalReturnedSoFar >= totalOriginalQuantity
          ? SaleStatus.REFUNDED
          : SaleStatus.PARTIALLY_REFUNDED;

      await tx.sale.update({
        where: { id: sale.id },
        data: { status: newSaleStatus },
      });

      // 3. Customer Ledger (Credit customer if customer attached)
      if (sale.customerId) {
        const lastEntry = await tx.customerLedgerEntry.findFirst({
          where: { customerId: sale.customerId },
          orderBy: { createdAt: 'desc' },
        });
        const currentBalance = lastEntry ? lastEntry.balanceAfter : new Prisma.Decimal(0);
        const newBalance = currentBalance.minus(totalRefund);

        await tx.customerLedgerEntry.create({
          data: {
            customerId: sale.customerId,
            branchId: sale.branchId,
            type: LedgerEntryType.RETURN,
            amount: totalRefund,
            debit: new Prisma.Decimal(0),
            credit: totalRefund,
            balanceAfter: newBalance,
            referenceType: 'SALE_RETURN',
            referenceId: saleReturn.id,
            description: `Sale Return ${returnNumber} for invoice ${sale.invoiceNumber}`,
          },
        });
      }

      await this.auditLogsService.log({
        userId: actorId,
        branchId: sale.branchId,
        action: 'sale.return',
        entityType: 'SaleReturn',
        entityId: saleReturn.id,
        newValues: {
          returnNumber,
          totalRefund: totalRefund.toString(),
          newSaleStatus,
        },
      });

      return saleReturn;
    });
  }

  async getReturns(query: SaleReturnQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.SaleReturnWhereInput = {};
    if (query.saleId) {
      where.saleId = query.saleId;
    }
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [total, data] = await Promise.all([
      this.prisma.saleReturn.count({ where }),
      this.prisma.saleReturn.findMany({
        where,
        include: {
          sale: { select: { id: true, invoiceNumber: true } },
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
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

  async getReturnById(id: string) {
    const saleReturn = await this.prisma.saleReturn.findUnique({
      where: { id },
      include: {
        sale: true,
        customer: true,
        branch: true,
        warehouse: true,
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, barcode: true } },
            variant: { select: { id: true, name: true, sku: true, barcode: true } },
          },
        },
      },
    });

    if (!saleReturn) {
      throw new NotFoundException(`Sale return "${id}" not found`);
    }

    return saleReturn;
  }
}
