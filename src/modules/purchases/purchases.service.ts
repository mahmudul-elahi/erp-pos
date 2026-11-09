import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerEntryType,
  Prisma,
  PurchasePaymentStatus,
  PurchaseReturnStatus,
  PurchaseStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import {
  CreatePurchaseDto,
  CreatePurchasePaymentDto,
  CreatePurchaseReturnDto,
  PurchaseQueryDto,
  PurchaseReturnQueryDto,
  ReceivePurchaseDto,
} from './dto/purchase.dto.js';
import {
  buildPaginationMeta,
  PaginatedResult,
} from '../../common/pagination/pagination.dto.js';

@Injectable()
export class PurchasesService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private auditLogsService: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Create Purchase Order
  // ---------------------------------------------------------------------------
  async create(dto: CreatePurchaseDto, actorId?: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier || !supplier.isActive || supplier.deletedAt) {
      throw new NotFoundException(`Active supplier "${dto.supplierId}" not found`);
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse || !warehouse.isActive || warehouse.deletedAt) {
      throw new NotFoundException(`Active warehouse "${dto.warehouseId}" not found`);
    }

    // Verify all products/variants
    for (const item of dto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });
      if (!product || product.deletedAt) {
        throw new NotFoundException(`Product "${item.productId}" not found`);
      }
      if (item.variantId) {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
        });
        if (!variant || variant.productId !== item.productId || variant.deletedAt) {
          throw new NotFoundException(
            `Product variant "${item.variantId}" not found for product "${product.name}"`,
          );
        }
      }
    }

    // Calculate financials
    let subtotal = new Prisma.Decimal(0);
    const itemRecords = dto.items.map((item) => {
      const unitCostDecimal = new Prisma.Decimal(item.unitCost);
      const totalCost = unitCostDecimal.mul(item.orderedQuantity);
      subtotal = subtotal.plus(totalCost);
      return {
        productId: item.productId,
        variantId: item.variantId || null,
        orderedQuantity: item.orderedQuantity,
        unitCost: unitCostDecimal,
        totalCost,
        batchNumber: item.batchNumber?.trim() || null,
      };
    });

    const tax = new Prisma.Decimal(dto.taxAmount ?? 0);
    const discount = new Prisma.Decimal(dto.discountAmount ?? 0);
    const shipping = new Prisma.Decimal(dto.shippingCost ?? 0);
    const totalAmount = subtotal.plus(tax).plus(shipping).minus(discount);

    if (totalAmount.lessThan(0)) {
      throw new BadRequestException('Total purchase amount cannot be negative');
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const purchaseNumber = `PO-${dateStr}-${randomSuffix}`;

    const purchase = await this.prisma.purchase.create({
      data: {
        purchaseNumber,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        branchId: dto.branchId || warehouse.branchId || null,
        status: PurchaseStatus.ORDERED,
        paymentStatus: PurchasePaymentStatus.UNPAID,
        orderDate: dto.orderDate ? new Date(dto.orderDate) : now,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        subtotal,
        taxAmount: tax,
        discountAmount: discount,
        shippingCost: shipping,
        totalAmount,
        paidAmount: new Prisma.Decimal(0),
        dueAmount: totalAmount,
        invoiceNumber: dto.invoiceNumber?.trim() || null,
        notes: dto.notes?.trim() || null,
        createdById: actorId,
        items: {
          create: itemRecords,
        },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
        supplier: { select: { id: true, companyName: true, phone: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: purchase.branchId,
      action: 'purchase.create',
      entityType: 'Purchase',
      entityId: purchase.id,
      newValues: {
        purchaseNumber: purchase.purchaseNumber,
        supplier: supplier.companyName,
        totalAmount: totalAmount.toString(),
        itemCount: dto.items.length,
      },
    });

    return purchase;
  }

  // ---------------------------------------------------------------------------
  // Find Purchases
  // ---------------------------------------------------------------------------
  async findAll(query: PurchaseQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.PurchaseWhereInput = {};

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }
    if (query.search) {
      where.OR = [
        { purchaseNumber: { contains: query.search.trim(), mode: 'insensitive' } },
        { invoiceNumber: { contains: query.search.trim(), mode: 'insensitive' } },
        { supplier: { companyName: { contains: query.search.trim(), mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.findMany({
        where,
        include: {
          supplier: { select: { id: true, companyName: true, phone: true } },
          warehouse: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { items: true, payments: true, returns: true } },
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
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        warehouse: true,
        branch: true,
        createdBy: { select: { id: true, name: true, email: true } },
        receivedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
                trackSerial: true,
                costPrice: true,
              },
            },
            variant: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
                costPrice: true,
              },
            },
          },
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
          include: { createdBy: { select: { id: true, name: true } } },
        },
        returns: {
          include: { items: true },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException(`Purchase "${id}" not found`);
    }

    return purchase;
  }

  // ---------------------------------------------------------------------------
  // Receive Goods & Mutate Stock & Update Supplier Payable Ledger
  // ---------------------------------------------------------------------------
  async receive(id: string, dto: ReceivePurchaseDto, actorId?: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException(`Purchase "${id}" not found`);
    }
    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('Cannot receive items on a cancelled purchase order');
    }
    if (purchase.status === PurchaseStatus.RECEIVED) {
      throw new BadRequestException('This purchase order has already been fully received');
    }

    return await this.prisma.$transaction(async (tx) => {
      let intakeBatchTotal = new Prisma.Decimal(0);
      const itemsMap = new Map(purchase.items.map((i) => [i.id, i]));

      // Determine items to receive
      const itemsToReceive: {
        item: (typeof purchase.items)[0];
        quantity: number;
        serialNumbers?: string[];
        batchNumber?: string;
      }[] = [];

      if (dto.items && dto.items.length > 0) {
        for (const rItem of dto.items) {
          const item = itemsMap.get(rItem.purchaseItemId);
          if (!item) {
            throw new NotFoundException(
              `Purchase item "${rItem.purchaseItemId}" does not belong to purchase "${id}"`,
            );
          }
          const pending = item.orderedQuantity - item.receivedQuantity;
          if (rItem.receivedQuantity > pending) {
            throw new BadRequestException(
              `Cannot receive ${rItem.receivedQuantity} units for product "${item.product.name}". Remaining pending: ${pending}`,
            );
          }
          itemsToReceive.push({
            item,
            quantity: rItem.receivedQuantity,
            serialNumbers: rItem.serialNumbers,
            batchNumber: rItem.batchNumber,
          });
        }
      } else {
        // Default: receive all remaining ordered quantities
        for (const item of purchase.items) {
          const pending = item.orderedQuantity - item.receivedQuantity;
          if (pending > 0) {
            itemsToReceive.push({ item, quantity: pending });
          }
        }
      }

      if (itemsToReceive.length === 0) {
        throw new BadRequestException('No pending quantities available to receive');
      }

      // Process each received item
      for (const { item, quantity, serialNumbers = [], batchNumber } of itemsToReceive) {
        // Serial number validation
        if (item.product.trackSerial && serialNumbers.length !== quantity) {
          throw new BadRequestException(
            `Product "${item.product.name}" requires serial tracking. Received quantity is ${quantity}, but ${serialNumbers.length} serial numbers provided`,
          );
        }

        const itemCost = item.unitCost.mul(quantity);
        intakeBatchTotal = intakeBatchTotal.plus(itemCost);

        // 1. Update purchase item
        const updatedSerials = [...item.serialNumbers, ...serialNumbers];
        await tx.purchaseItem.update({
          where: { id: item.id },
          data: {
            receivedQuantity: item.receivedQuantity + quantity,
            serialNumbers: updatedSerials,
            batchNumber: batchNumber || item.batchNumber,
          },
        });

        // 2. Mutate inventory stock and write immutable movement
        await this.inventoryService.adjustStockTx(tx, {
          warehouseId: purchase.warehouseId,
          productId: item.productId,
          variantId: item.variantId,
          quantityDelta: quantity,
          type: StockMovementType.PURCHASE_RECEIVED,
          referenceType: 'PURCHASE',
          referenceId: purchase.id,
          batchNumber: batchNumber || item.batchNumber || undefined,
          serialNumbers,
          reason: `Goods receipt for Purchase ${purchase.purchaseNumber}`,
          actorId,
        });

        // 3. Update product or variant latest costPrice
        if (dto.updateCostPrice !== false) {
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { costPrice: item.unitCost },
            });
          } else {
            await tx.product.update({
              where: { id: item.productId },
              data: { costPrice: item.unitCost },
            });
          }
        }
      }

      // Check if all items are fully received
      const refreshedItems = await tx.purchaseItem.findMany({
        where: { purchaseId: purchase.id },
      });
      const allFullyReceived = refreshedItems.every(
        (i) => i.receivedQuantity >= i.orderedQuantity,
      );

      const newStatus = allFullyReceived
        ? PurchaseStatus.RECEIVED
        : PurchaseStatus.PARTIALLY_RECEIVED;

      // 4. Update Purchase
      const updatedPurchase = await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          status: newStatus,
          receivedById: actorId,
          receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : new Date(),
        },
        include: {
          items: true,
          supplier: true,
          warehouse: true,
        },
      });

      // 5. Supplier Ledger Entry (Credit increases store payable liability)
      if (intakeBatchTotal.greaterThan(0)) {
        const lastEntry = await tx.supplierLedgerEntry.findFirst({
          where: { supplierId: purchase.supplierId },
          orderBy: { createdAt: 'desc' },
        });

        const currentBalance = lastEntry ? lastEntry.balanceAfter : new Prisma.Decimal(0);
        const newBalance = currentBalance.plus(intakeBatchTotal);

        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: purchase.supplierId,
            branchId: purchase.branchId,
            type: LedgerEntryType.PURCHASE,
            amount: intakeBatchTotal,
            credit: intakeBatchTotal,
            debit: new Prisma.Decimal(0),
            balanceAfter: newBalance,
            referenceType: 'PURCHASE',
            referenceId: purchase.id,
            description: `Goods received for Purchase ${purchase.purchaseNumber}`,
          },
        });
      }

      await this.auditLogsService.log({
        userId: actorId,
        branchId: purchase.branchId,
        action: 'purchase.receive',
        entityType: 'Purchase',
        entityId: purchase.id,
        newValues: {
          purchaseNumber: purchase.purchaseNumber,
          status: newStatus,
          batchValue: intakeBatchTotal.toString(),
        },
      });

      return updatedPurchase;
    });
  }

  // ---------------------------------------------------------------------------
  // Record Supplier Payment Against Purchase
  // ---------------------------------------------------------------------------
  async addPayment(id: string, dto: CreatePurchasePaymentDto, actorId?: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
    });
    if (!purchase) {
      throw new NotFoundException(`Purchase "${id}" not found`);
    }
    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('Cannot add payment to a cancelled purchase order');
    }

    const amountDecimal = new Prisma.Decimal(dto.amount);
    if (amountDecimal.greaterThan(purchase.dueAmount)) {
      throw new BadRequestException(
        `Payment amount (${amountDecimal.toString()}) cannot exceed remaining due amount (${purchase.dueAmount.toString()})`,
      );
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const paymentNumber = `PAY-${dateStr}-${randomSuffix}`;

    return await this.prisma.$transaction(async (tx) => {
      // 1. Create Payment record
      const payment = await tx.purchasePayment.create({
        data: {
          paymentNumber,
          purchaseId: purchase.id,
          supplierId: purchase.supplierId,
          amount: amountDecimal,
          paymentMethod: dto.paymentMethod.toUpperCase(),
          reference: dto.reference?.trim() || null,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : now,
          notes: dto.notes?.trim() || null,
          createdById: actorId,
        },
      });

      // 2. Update Purchase paidAmount and dueAmount
      const newPaid = purchase.paidAmount.plus(amountDecimal);
      const newDue = purchase.dueAmount.minus(amountDecimal);
      const newPaymentStatus = newDue.equals(0)
        ? PurchasePaymentStatus.PAID
        : PurchasePaymentStatus.PARTIAL;

      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          paidAmount: newPaid,
          dueAmount: newDue,
          paymentStatus: newPaymentStatus,
        },
      });

      // 3. Supplier Ledger Entry (Debit reduces payable liability)
      const lastEntry = await tx.supplierLedgerEntry.findFirst({
        where: { supplierId: purchase.supplierId },
        orderBy: { createdAt: 'desc' },
      });

      const currentBalance = lastEntry ? lastEntry.balanceAfter : new Prisma.Decimal(0);
      const newBalance = currentBalance.minus(amountDecimal);

      await tx.supplierLedgerEntry.create({
        data: {
          supplierId: purchase.supplierId,
          branchId: purchase.branchId,
          type: LedgerEntryType.PAYMENT,
          amount: amountDecimal,
          debit: amountDecimal,
          credit: new Prisma.Decimal(0),
          balanceAfter: newBalance,
          referenceType: 'PURCHASE_PAYMENT',
          referenceId: payment.id,
          description: `Payment for Purchase ${purchase.purchaseNumber} via ${dto.paymentMethod.toUpperCase()}`,
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        branchId: purchase.branchId,
        action: 'purchase.payment',
        entityType: 'PurchasePayment',
        entityId: payment.id,
        newValues: {
          paymentNumber,
          purchaseNumber: purchase.purchaseNumber,
          amount: amountDecimal.toString(),
          remainingDue: newDue.toString(),
        },
      });

      return payment;
    });
  }

  // ---------------------------------------------------------------------------
  // Purchase Returns & Supplier Credits
  // ---------------------------------------------------------------------------
  async createReturn(dto: CreatePurchaseReturnDto, actorId?: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier || !supplier.isActive || supplier.deletedAt) {
      throw new NotFoundException(`Active supplier "${dto.supplierId}" not found`);
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse || !warehouse.isActive || warehouse.deletedAt) {
      throw new NotFoundException(`Active warehouse "${dto.warehouseId}" not found`);
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const returnNumber = `PRTN-${dateStr}-${randomSuffix}`;

    return await this.prisma.$transaction(async (tx) => {
      let totalReturnAmount = new Prisma.Decimal(0);
      const returnItemsData: {
        productId: string;
        variantId: string | null;
        quantity: number;
        unitCost: Prisma.Decimal;
        totalCost: Prisma.Decimal;
        serialNumbers: string[];
      }[] = [];

      for (const item of dto.items) {
        const unitCostDecimal = new Prisma.Decimal(item.unitCost);
        const itemTotal = unitCostDecimal.mul(item.quantity);
        totalReturnAmount = totalReturnAmount.plus(itemTotal);

        returnItemsData.push({
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.quantity,
          unitCost: unitCostDecimal,
          totalCost: itemTotal,
          serialNumbers: item.serialNumbers || [],
        });

        // Mutate inventory: deduct from warehouse stock with movement PURCHASE_RETURN
        await this.inventoryService.adjustStockTx(tx, {
          warehouseId: dto.warehouseId,
          productId: item.productId,
          variantId: item.variantId,
          quantityDelta: -item.quantity,
          type: StockMovementType.PURCHASE_RETURN,
          referenceType: 'PURCHASE_RETURN',
          serialNumbers: item.serialNumbers,
          reason: `Purchase Return ${returnNumber}: ${dto.reason}`,
          actorId,
        });
      }

      // 1. Create PurchaseReturn record
      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          returnNumber,
          purchaseId: dto.purchaseId || null,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          status: PurchaseReturnStatus.COMPLETED,
          totalAmount: totalReturnAmount,
          reason: dto.reason.trim(),
          notes: dto.notes?.trim() || null,
          createdById: actorId,
          items: {
            create: returnItemsData,
          },
        },
        include: {
          items: true,
          supplier: true,
          warehouse: true,
        },
      });

      // 2. Supplier Ledger Entry (Debit reduces store payable liability or creates credit)
      const lastEntry = await tx.supplierLedgerEntry.findFirst({
        where: { supplierId: dto.supplierId },
        orderBy: { createdAt: 'desc' },
      });

      const currentBalance = lastEntry ? lastEntry.balanceAfter : new Prisma.Decimal(0);
      const newBalance = currentBalance.minus(totalReturnAmount);

      await tx.supplierLedgerEntry.create({
        data: {
          supplierId: dto.supplierId,
          branchId: warehouse.branchId,
          type: LedgerEntryType.RETURN,
          amount: totalReturnAmount,
          debit: totalReturnAmount,
          credit: new Prisma.Decimal(0),
          balanceAfter: newBalance,
          referenceType: 'PURCHASE_RETURN',
          referenceId: purchaseReturn.id,
          description: `Purchase Return ${returnNumber}: ${dto.reason}`,
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        branchId: warehouse.branchId,
        action: 'purchase.return',
        entityType: 'PurchaseReturn',
        entityId: purchaseReturn.id,
        newValues: {
          returnNumber,
          supplier: supplier.companyName,
          totalAmount: totalReturnAmount.toString(),
          itemCount: dto.items.length,
        },
      });

      return purchaseReturn;
    });
  }

  async getReturns(query: PurchaseReturnQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.PurchaseReturnWhereInput = {};
    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
    if (query.purchaseId) {
      where.purchaseId = query.purchaseId;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [total, data] = await Promise.all([
      this.prisma.purchaseReturn.count({ where }),
      this.prisma.purchaseReturn.findMany({
        where,
        include: {
          supplier: { select: { id: true, companyName: true, phone: true } },
          warehouse: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true, email: true } },
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
    const purchaseReturn = await this.prisma.purchaseReturn.findUnique({
      where: { id },
      include: {
        supplier: true,
        warehouse: true,
        purchase: { select: { id: true, purchaseNumber: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, barcode: true } },
            variant: { select: { id: true, name: true, sku: true, barcode: true } },
          },
        },
      },
    });

    if (!purchaseReturn) {
      throw new NotFoundException(`Purchase return "${id}" not found`);
    }

    return purchaseReturn;
  }

  // ---------------------------------------------------------------------------
  // Cancel Purchase
  // ---------------------------------------------------------------------------
  async cancel(id: string, actorId?: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!purchase) {
      throw new NotFoundException(`Purchase "${id}" not found`);
    }
    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('Purchase order is already cancelled');
    }
    const hasReceivedItems = purchase.items.some((i) => i.receivedQuantity > 0);
    if (hasReceivedItems) {
      throw new BadRequestException(
        'Cannot cancel purchase order with received goods. Use purchase returns instead',
      );
    }

    const updated = await this.prisma.purchase.update({
      where: { id },
      data: { status: PurchaseStatus.CANCELLED },
      include: { supplier: true, warehouse: true },
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: purchase.branchId,
      action: 'purchase.cancel',
      entityType: 'Purchase',
      entityId: id,
      newValues: { status: PurchaseStatus.CANCELLED },
    });

    return updated;
  }
}
