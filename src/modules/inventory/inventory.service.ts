import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdjustmentStatus,
  AdjustmentType,
  Prisma,
  StockMovementType,
  TransferStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import {
  CreateDamagedProductDto,
  CreateStockAdjustmentDto,
  CreateStockTransferDto,
  DamagedProductQueryDto,
  InventoryBalanceQueryDto,
  StockAdjustmentQueryDto,
  StockMovementQueryDto,
  StockTransferQueryDto,
} from './dto/inventory.dto.js';
import {
  buildPaginationMeta,
  PaginatedResult,
} from '../../common/pagination/pagination.dto.js';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Helper: Find or initialize InventoryBalance inside a transaction
  // ---------------------------------------------------------------------------
  private async getOrCreateBalanceTx(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    productId: string,
    variantId?: string | null,
  ) {
    const normVariantId = variantId || null;
    let balance = await tx.inventoryBalance.findFirst({
      where: {
        warehouseId,
        productId,
        variantId: normVariantId,
      },
    });

    if (!balance) {
      balance = await tx.inventoryBalance.create({
        data: {
          warehouseId,
          productId,
          variantId: normVariantId,
          onHand: 0,
          reserved: 0,
          inTransit: 0,
        },
      });
    }

    return balance;
  }

  // ---------------------------------------------------------------------------
  // Internal Stock Mutation Primitive with Concurrency & Non-Negative Check
  // ---------------------------------------------------------------------------
  async adjustStockTx(
    tx: Prisma.TransactionClient,
    params: {
      warehouseId: string;
      productId: string;
      variantId?: string | null;
      quantityDelta: number;
      type: StockMovementType;
      referenceType?: string;
      referenceId?: string;
      reason?: string;
      batchNumber?: string;
      serialNumbers?: string[];
      actorId?: string;
    },
  ) {
    const {
      warehouseId,
      productId,
      variantId,
      quantityDelta,
      type,
      referenceType,
      referenceId,
      reason,
      batchNumber,
      serialNumbers = [],
      actorId,
    } = params;

    const normVariantId = variantId || null;

    // 1. Verify Product
    const product = await tx.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.deletedAt) {
      throw new NotFoundException(`Product with ID "${productId}" not found`);
    }

    // 2. Verify Variant if specified
    if (normVariantId) {
      const variant = await tx.productVariant.findUnique({
        where: { id: normVariantId },
      });
      if (!variant || variant.productId !== productId || variant.deletedAt) {
        throw new NotFoundException(
          `Product variant "${normVariantId}" not found for product "${product.name}"`,
        );
      }
    }

    // 3. Serial / IMEI verification
    if (product.trackSerial && quantityDelta !== 0) {
      const requiredCount = Math.abs(quantityDelta);
      if (serialNumbers.length !== requiredCount) {
        throw new BadRequestException(
          `Product "${product.name}" requires serial tracking. Expected ${requiredCount} serial number(s), got ${serialNumbers.length}`,
        );
      }
    }

    // 4. Retrieve or create balance row
    const currentBalance = await this.getOrCreateBalanceTx(
      tx,
      warehouseId,
      productId,
      normVariantId,
    );

    const balanceBefore = currentBalance.onHand;
    const balanceAfter = balanceBefore + quantityDelta;

    // Strict non-negative inventory rule
    if (balanceAfter < 0) {
      throw new BadRequestException(
        `Insufficient stock for "${product.name}". Available on hand: ${balanceBefore}, requested reduction: ${Math.abs(quantityDelta)}`,
      );
    }

    // 5. Update InventoryBalance
    const updatedBalance = await tx.inventoryBalance.update({
      where: { id: currentBalance.id },
      data: { onHand: balanceAfter },
    });

    // 6. Record Immutable Stock Movement
    const movement = await tx.stockMovement.create({
      data: {
        warehouseId,
        productId,
        variantId: normVariantId,
        type,
        quantity: quantityDelta,
        balanceBefore,
        balanceAfter,
        referenceType,
        referenceId,
        batchNumber,
        serialNumbers,
        reason,
        createdById: actorId,
      },
    });

    return { balance: updatedBalance, movement };
  }

  // ---------------------------------------------------------------------------
  // Stock Reservation Primitives (Order Workflow: Confirm -> Dispatch/Cancel)
  // ---------------------------------------------------------------------------
  async reserveStockTx(
    tx: Prisma.TransactionClient,
    params: {
      warehouseId: string;
      productId: string;
      variantId?: string | null;
      quantity: number;
      referenceType?: string;
      referenceId?: string;
      actorId?: string;
    },
  ) {
    const { warehouseId, productId, variantId, quantity, referenceType, referenceId, actorId } = params;
    const normVariantId = variantId || null;

    const currentBalance = await this.getOrCreateBalanceTx(
      tx,
      warehouseId,
      productId,
      normVariantId,
    );

    const available = currentBalance.onHand - currentBalance.reserved;
    if (available < quantity) {
      throw new BadRequestException(
        `Insufficient available unreserved stock. On hand: ${currentBalance.onHand}, reserved: ${currentBalance.reserved}, available: ${available}, requested: ${quantity}`,
      );
    }

    const updated = await tx.inventoryBalance.update({
      where: { id: currentBalance.id },
      data: { reserved: currentBalance.reserved + quantity },
    });

    const movement = await tx.stockMovement.create({
      data: {
        warehouseId,
        productId,
        variantId: normVariantId,
        type: StockMovementType.RESERVED,
        quantity,
        balanceBefore: currentBalance.reserved,
        balanceAfter: updated.reserved,
        referenceType,
        referenceId,
        createdById: actorId,
      },
    });

    return { balance: updated, movement };
  }

  async releaseReservationTx(
    tx: Prisma.TransactionClient,
    params: {
      warehouseId: string;
      productId: string;
      variantId?: string | null;
      quantity: number;
      referenceType?: string;
      referenceId?: string;
      actorId?: string;
    },
  ) {
    const { warehouseId, productId, variantId, quantity, referenceType, referenceId, actorId } = params;
    const normVariantId = variantId || null;

    const currentBalance = await this.getOrCreateBalanceTx(
      tx,
      warehouseId,
      productId,
      normVariantId,
    );

    const newReserved = Math.max(0, currentBalance.reserved - quantity);

    const updated = await tx.inventoryBalance.update({
      where: { id: currentBalance.id },
      data: { reserved: newReserved },
    });

    const movement = await tx.stockMovement.create({
      data: {
        warehouseId,
        productId,
        variantId: normVariantId,
        type: StockMovementType.RESERVATION_RELEASE,
        quantity: -quantity,
        balanceBefore: currentBalance.reserved,
        balanceAfter: newReserved,
        referenceType,
        referenceId,
        createdById: actorId,
      },
    });

    return { balance: updated, movement };
  }

  // ---------------------------------------------------------------------------
  // Inventory Balances Queries
  // ---------------------------------------------------------------------------
  async getBalances(query: InventoryBalanceQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.InventoryBalanceWhereInput = {};

    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.variantId) {
      where.variantId = query.variantId;
    }

    const [total, balances] = await Promise.all([
      this.prisma.inventoryBalance.count({ where }),
      this.prisma.inventoryBalance.findMany({
        where,
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              minStockAlert: true,
              trackSerial: true,
            },
          },
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              minStockAlert: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    let data = balances;
    if (query.lowStockOnly) {
      data = balances.filter((b) => {
        const threshold = b.variant?.minStockAlert ?? b.product.minStockAlert;
        return b.onHand <= threshold;
      });
    }

    return {
      data,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  }

  async getBalance(warehouseId: string, productId: string, variantId?: string) {
    const normVariantId = variantId || null;
    const balance = await this.prisma.inventoryBalance.findFirst({
      where: {
        warehouseId,
        productId,
        variantId: normVariantId,
      },
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, sku: true, barcode: true, minStockAlert: true } },
        variant: { select: { id: true, name: true, sku: true, barcode: true, minStockAlert: true } },
      },
    });

    if (!balance) {
      throw new NotFoundException('Inventory balance record not found');
    }

    return balance;
  }

  async getMovements(query: StockMovementQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.StockMovementWhereInput = {};

    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.variantId) {
      where.variantId = query.variantId;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.referenceType) {
      where.referenceType = query.referenceType;
    }
    if (query.referenceId) {
      where.referenceId = query.referenceId;
    }

    const [total, data] = await Promise.all([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true, barcode: true } },
          variant: { select: { id: true, name: true, sku: true, barcode: true } },
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

  async getLowStockAlerts(warehouseId?: string) {
    const where: Prisma.InventoryBalanceWhereInput = {};
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const balances = await this.prisma.inventoryBalance.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            minStockAlert: true,
            sellingPrice: true,
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            minStockAlert: true,
          },
        },
      },
    });

    return balances.filter((b) => {
      const threshold = b.variant?.minStockAlert ?? b.product.minStockAlert;
      return b.onHand <= threshold;
    });
  }

  // ---------------------------------------------------------------------------
  // Stock Adjustments
  // ---------------------------------------------------------------------------
  async createAdjustment(dto: CreateStockAdjustmentDto, actorId?: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse || !warehouse.isActive || warehouse.deletedAt) {
      throw new NotFoundException(`Active warehouse "${dto.warehouseId}" not found`);
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const adjustmentNumber = `ADJ-${dateStr}-${randomSuffix}`;

    return await this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.create({
        data: {
          adjustmentNumber,
          warehouseId: dto.warehouseId,
          reason: dto.reason.trim(),
          notes: dto.notes?.trim() || null,
          status: dto.confirmImmediately ? AdjustmentStatus.CONFIRMED : AdjustmentStatus.DRAFT,
          createdById: actorId,
          confirmedById: dto.confirmImmediately ? actorId : null,
          confirmedAt: dto.confirmImmediately ? new Date() : null,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || null,
              quantity: item.quantity,
              type: item.type,
              reason: item.reason?.trim() || null,
            })),
          },
        },
        include: { items: true, warehouse: true },
      });

      if (dto.confirmImmediately) {
        for (const item of dto.items) {
          const delta = item.type === AdjustmentType.INCREASE ? item.quantity : -item.quantity;
          const movementType =
            item.type === AdjustmentType.INCREASE
              ? StockMovementType.ADJUSTMENT_IN
              : StockMovementType.ADJUSTMENT_OUT;

          await this.adjustStockTx(tx, {
            warehouseId: dto.warehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: delta,
            type: movementType,
            referenceType: 'STOCK_ADJUSTMENT',
            referenceId: adjustment.id,
            reason: item.reason || dto.reason,
            serialNumbers: item.serialNumbers,
            actorId,
          });
        }
      }

      await this.auditLogsService.log({
        userId: actorId,
        action: dto.confirmImmediately ? 'stock_adjustment.confirm' : 'stock_adjustment.create',
        entityType: 'StockAdjustment',
        entityId: adjustment.id,
        newValues: {
          adjustmentNumber: adjustment.adjustmentNumber,
          warehouseId: dto.warehouseId,
          itemCount: dto.items.length,
          status: adjustment.status,
        },
      });

      return adjustment;
    });
  }

  async confirmAdjustment(id: string, actorId?: string) {
    const adjustment = await this.prisma.stockAdjustment.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment "${id}" not found`);
    }
    if (adjustment.status !== AdjustmentStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot confirm adjustment in "${adjustment.status}" status`,
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      for (const item of adjustment.items) {
        const delta = item.type === AdjustmentType.INCREASE ? item.quantity : -item.quantity;
        const movementType =
          item.type === AdjustmentType.INCREASE
            ? StockMovementType.ADJUSTMENT_IN
            : StockMovementType.ADJUSTMENT_OUT;

        await this.adjustStockTx(tx, {
          warehouseId: adjustment.warehouseId,
          productId: item.productId,
          variantId: item.variantId,
          quantityDelta: delta,
          type: movementType,
          referenceType: 'STOCK_ADJUSTMENT',
          referenceId: adjustment.id,
          reason: item.reason || adjustment.reason,
          actorId,
        });
      }

      const updated = await tx.stockAdjustment.update({
        where: { id },
        data: {
          status: AdjustmentStatus.CONFIRMED,
          confirmedById: actorId,
          confirmedAt: new Date(),
        },
        include: { items: true, warehouse: true },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'stock_adjustment.confirm',
        entityType: 'StockAdjustment',
        entityId: id,
        newValues: { status: AdjustmentStatus.CONFIRMED },
      });

      return updated;
    });
  }

  async getAdjustments(query: StockAdjustmentQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.StockAdjustmentWhereInput = {};
    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [total, data] = await Promise.all([
      this.prisma.stockAdjustment.count({ where }),
      this.prisma.stockAdjustment.findMany({
        where,
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          confirmedBy: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
              variant: { select: { id: true, name: true, sku: true } },
            },
          },
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

  async getAdjustmentById(id: string) {
    const adjustment = await this.prisma.stockAdjustment.findUnique({
      where: { id },
      include: {
        warehouse: true,
        createdBy: { select: { id: true, name: true, email: true } },
        confirmedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, barcode: true } },
            variant: { select: { id: true, name: true, sku: true, barcode: true } },
          },
        },
      },
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment "${id}" not found`);
    }

    return adjustment;
  }

  // ---------------------------------------------------------------------------
  // Stock Transfers Lifecycle (Draft -> Dispatched -> Received / Cancelled)
  // ---------------------------------------------------------------------------
  async createTransfer(dto: CreateStockTransferDto, actorId?: string) {
    if (dto.sourceWarehouseId === dto.destinationWarehouseId) {
      throw new BadRequestException('Source and destination warehouse cannot be the same');
    }

    const [source, destination] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: dto.sourceWarehouseId } }),
      this.prisma.warehouse.findUnique({ where: { id: dto.destinationWarehouseId } }),
    ]);

    if (!source || !source.isActive || source.deletedAt) {
      throw new NotFoundException(`Source warehouse "${dto.sourceWarehouseId}" not found or inactive`);
    }
    if (!destination || !destination.isActive || destination.deletedAt) {
      throw new NotFoundException(`Destination warehouse "${dto.destinationWarehouseId}" not found or inactive`);
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const transferNumber = `TRF-${dateStr}-${randomSuffix}`;

    const transfer = await this.prisma.stockTransfer.create({
      data: {
        transferNumber,
        sourceWarehouseId: dto.sourceWarehouseId,
        destinationWarehouseId: dto.destinationWarehouseId,
        notes: dto.notes?.trim() || null,
        status: TransferStatus.DRAFT,
        createdById: actorId,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || null,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: true,
        sourceWarehouse: true,
        destinationWarehouse: true,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'stock_transfer.create',
      entityType: 'StockTransfer',
      entityId: transfer.id,
      newValues: {
        transferNumber: transfer.transferNumber,
        source: source.name,
        destination: destination.name,
        itemCount: dto.items.length,
      },
    });

    return transfer;
  }

  /**
   * Dispatch Transfer:
   * Source Warehouse onHand -= quantity
   * Destination Warehouse inTransit += quantity
   */
  async dispatchTransfer(id: string, actorId?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!transfer) {
      throw new NotFoundException(`Stock transfer "${id}" not found`);
    }
    if (transfer.status !== TransferStatus.DRAFT) {
      throw new BadRequestException(`Cannot dispatch transfer with status "${transfer.status}"`);
    }

    return await this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        // 1. Deduct from source warehouse onHand
        await this.adjustStockTx(tx, {
          warehouseId: transfer.sourceWarehouseId,
          productId: item.productId,
          variantId: item.variantId,
          quantityDelta: -item.quantity,
          type: StockMovementType.TRANSFER_OUT,
          referenceType: 'STOCK_TRANSFER',
          referenceId: transfer.id,
          reason: `Dispatched in transfer ${transfer.transferNumber}`,
          actorId,
        });

        // 2. Increment destination warehouse inTransit
        const destBalance = await this.getOrCreateBalanceTx(
          tx,
          transfer.destinationWarehouseId,
          item.productId,
          item.variantId,
        );
        await tx.inventoryBalance.update({
          where: { id: destBalance.id },
          data: { inTransit: destBalance.inTransit + item.quantity },
        });
      }

      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: TransferStatus.DISPATCHED,
          dispatchedById: actorId,
          dispatchedAt: new Date(),
        },
        include: { items: true, sourceWarehouse: true, destinationWarehouse: true },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'stock_transfer.dispatch',
        entityType: 'StockTransfer',
        entityId: id,
        newValues: { status: TransferStatus.DISPATCHED },
      });

      return updated;
    });
  }

  /**
   * Receive Transfer:
   * Destination Warehouse inTransit -= quantity
   * Destination Warehouse onHand += quantity
   */
  async receiveTransfer(id: string, actorId?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!transfer) {
      throw new NotFoundException(`Stock transfer "${id}" not found`);
    }
    if (transfer.status !== TransferStatus.DISPATCHED) {
      throw new BadRequestException(`Cannot receive transfer with status "${transfer.status}"`);
    }

    return await this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const destBalance = await this.getOrCreateBalanceTx(
          tx,
          transfer.destinationWarehouseId,
          item.productId,
          item.variantId,
        );

        if (destBalance.inTransit < item.quantity) {
          throw new BadRequestException(
            `In-transit quantity mismatch for product "${item.productId}". In-transit: ${destBalance.inTransit}, requested receive: ${item.quantity}`,
          );
        }

        // 1. Decrement inTransit
        await tx.inventoryBalance.update({
          where: { id: destBalance.id },
          data: { inTransit: destBalance.inTransit - item.quantity },
        });

        // 2. Add to destination onHand & record movement
        await this.adjustStockTx(tx, {
          warehouseId: transfer.destinationWarehouseId,
          productId: item.productId,
          variantId: item.variantId,
          quantityDelta: item.quantity,
          type: StockMovementType.TRANSFER_IN,
          referenceType: 'STOCK_TRANSFER',
          referenceId: transfer.id,
          reason: `Received from transfer ${transfer.transferNumber}`,
          actorId,
        });
      }

      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: TransferStatus.RECEIVED,
          receivedById: actorId,
          receivedAt: new Date(),
        },
        include: { items: true, sourceWarehouse: true, destinationWarehouse: true },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'stock_transfer.receive',
        entityType: 'StockTransfer',
        entityId: id,
        newValues: { status: TransferStatus.RECEIVED },
      });

      return updated;
    });
  }

  /**
   * Cancel Transfer:
   * - If DRAFT: directly cancel
   * - If DISPATCHED:
   *   Destination inTransit -= quantity
   *   Source onHand += quantity (reversal movement TRANSFER_IN)
   */
  async cancelTransfer(id: string, actorId?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!transfer) {
      throw new NotFoundException(`Stock transfer "${id}" not found`);
    }
    if (transfer.status === TransferStatus.RECEIVED) {
      throw new BadRequestException('Cannot cancel an already received transfer');
    }
    if (transfer.status === TransferStatus.CANCELLED) {
      throw new BadRequestException('Transfer is already cancelled');
    }

    return await this.prisma.$transaction(async (tx) => {
      if (transfer.status === TransferStatus.DISPATCHED) {
        for (const item of transfer.items) {
          // Revert inTransit on destination
          const destBalance = await this.getOrCreateBalanceTx(
            tx,
            transfer.destinationWarehouseId,
            item.productId,
            item.variantId,
          );

          await tx.inventoryBalance.update({
            where: { id: destBalance.id },
            data: { inTransit: Math.max(0, destBalance.inTransit - item.quantity) },
          });

          // Revert onHand on source
          await this.adjustStockTx(tx, {
            warehouseId: transfer.sourceWarehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: item.quantity,
            type: StockMovementType.TRANSFER_IN,
            referenceType: 'STOCK_TRANSFER_CANCEL',
            referenceId: transfer.id,
            reason: `Transfer ${transfer.transferNumber} cancelled reversal`,
            actorId,
          });
        }
      }

      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: TransferStatus.CANCELLED,
          cancelledById: actorId,
          cancelledAt: new Date(),
        },
        include: { items: true, sourceWarehouse: true, destinationWarehouse: true },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'stock_transfer.cancel',
        entityType: 'StockTransfer',
        entityId: id,
        newValues: { status: TransferStatus.CANCELLED },
      });

      return updated;
    });
  }

  async getTransfers(query: StockTransferQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.StockTransferWhereInput = {};
    if (query.sourceWarehouseId) {
      where.sourceWarehouseId = query.sourceWarehouseId;
    }
    if (query.destinationWarehouseId) {
      where.destinationWarehouseId = query.destinationWarehouseId;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [total, data] = await Promise.all([
      this.prisma.stockTransfer.count({ where }),
      this.prisma.stockTransfer.findMany({
        where,
        include: {
          sourceWarehouse: { select: { id: true, name: true, code: true } },
          destinationWarehouse: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          dispatchedBy: { select: { id: true, name: true, email: true } },
          receivedBy: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
              variant: { select: { id: true, name: true, sku: true } },
            },
          },
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

  async getTransferById(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        sourceWarehouse: true,
        destinationWarehouse: true,
        createdBy: { select: { id: true, name: true, email: true } },
        dispatchedBy: { select: { id: true, name: true, email: true } },
        receivedBy: { select: { id: true, name: true, email: true } },
        cancelledBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, barcode: true } },
            variant: { select: { id: true, name: true, sku: true, barcode: true } },
          },
        },
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Stock transfer "${id}" not found`);
    }

    return transfer;
  }

  // ---------------------------------------------------------------------------
  // Damaged Products Management
  // ---------------------------------------------------------------------------
  async recordDamaged(dto: CreateDamagedProductDto, actorId?: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse || !warehouse.isActive || warehouse.deletedAt) {
      throw new NotFoundException(`Active warehouse "${dto.warehouseId}" not found`);
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const damageNumber = `DAM-${dateStr}-${randomSuffix}`;

    return await this.prisma.$transaction(async (tx) => {
      // 1. Deduct from stock with movement DAMAGED
      const { movement } = await this.adjustStockTx(tx, {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        variantId: dto.variantId,
        quantityDelta: -dto.quantity,
        type: StockMovementType.DAMAGED,
        referenceType: 'DAMAGED_PRODUCT',
        reason: dto.reason.trim(),
        serialNumbers: dto.serialNumbers,
        actorId,
      });

      // 2. Create DamagedProduct record
      const damaged = await tx.damagedProduct.create({
        data: {
          damageNumber,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          variantId: dto.variantId || null,
          quantity: dto.quantity,
          serialNumbers: dto.serialNumbers || [],
          reason: dto.reason.trim(),
          actionTaken: dto.actionTaken?.trim() || null,
          reportedById: actorId,
        },
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true } },
          variant: { select: { id: true, name: true, sku: true } },
        },
      });

      // 3. Update movement with referenceId
      await tx.stockMovement.update({
        where: { id: movement.id },
        data: { referenceId: damaged.id },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'stock.damaged_write_off',
        entityType: 'DamagedProduct',
        entityId: damaged.id,
        newValues: {
          damageNumber,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          quantity: dto.quantity,
          reason: dto.reason,
        },
      });

      return damaged;
    });
  }

  async getDamaged(query: DamagedProductQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.DamagedProductWhereInput = {};
    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
    if (query.productId) {
      where.productId = query.productId;
    }

    const [total, data] = await Promise.all([
      this.prisma.damagedProduct.count({ where }),
      this.prisma.damagedProduct.findMany({
        where,
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true, barcode: true } },
          variant: { select: { id: true, name: true, sku: true, barcode: true } },
          reportedBy: { select: { id: true, name: true, email: true } },
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

  async getDamagedById(id: string) {
    const damaged = await this.prisma.damagedProduct.findUnique({
      where: { id },
      include: {
        warehouse: true,
        product: true,
        variant: true,
        reportedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!damaged) {
      throw new NotFoundException(`Damaged product record "${id}" not found`);
    }

    return damaged;
  }
}
