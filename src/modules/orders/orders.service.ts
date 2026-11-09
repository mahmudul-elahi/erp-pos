import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  Prisma,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import {
  CreateOrderDto,
  CreateOrderPaymentDto,
  OrderQueryDto,
  UpdateOrderStatusDto,
} from './dto/order.dto.js';
import {
  buildPaginationMeta,
  PaginatedResult,
} from '../../common/pagination/pagination.dto.js';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private auditLogsService: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Create Order
  // ---------------------------------------------------------------------------
  async create(dto: CreateOrderDto, actorId?: string) {
    // Determine Warehouse
    let warehouseId = dto.warehouseId;
    if (!warehouseId) {
      const defaultWh = await this.prisma.warehouse.findFirst({
        where: { isActive: true, deletedAt: null },
      });
      if (!defaultWh) {
        throw new BadRequestException('No active warehouse available for order fulfillment');
      }
      warehouseId = defaultWh.id;
    } else {
      const wh = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
      if (!wh || !wh.isActive || wh.deletedAt) {
        throw new NotFoundException(`Active warehouse "${warehouseId}" not found`);
      }
    }

    // Verify products & build items
    let subtotal = new Prisma.Decimal(0);
    const orderItemsData: {
      productId: string;
      variantId: string | null;
      quantity: number;
      unitPrice: Prisma.Decimal;
      costPriceSnapshot: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      totalPrice: Prisma.Decimal;
    }[] = [];

    for (const item of dto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });
      if (!product || product.deletedAt) {
        throw new NotFoundException(`Product "${item.productId}" not found`);
      }

      let variant: any = null;
      if (item.variantId) {
        variant = await this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
        });
        if (!variant || variant.productId !== item.productId || variant.deletedAt) {
          throw new NotFoundException(
            `Product variant "${item.variantId}" not found for product "${product.name}"`,
          );
        }
      }

      const unitPriceNum = item.unitPrice ?? (variant?.sellingPrice ?? product.sellingPrice);
      const unitPriceDecimal = new Prisma.Decimal(unitPriceNum);
      const costPriceDecimal = new Prisma.Decimal(
        variant?.costPrice ?? product.costPrice ?? 0,
      );

      const itemDiscount = new Prisma.Decimal(item.discountAmount ?? 0);
      const itemTotal = unitPriceDecimal.mul(item.quantity).minus(itemDiscount);
      subtotal = subtotal.plus(itemTotal);

      orderItemsData.push({
        productId: item.productId,
        variantId: item.variantId || null,
        quantity: item.quantity,
        unitPrice: unitPriceDecimal,
        costPriceSnapshot: costPriceDecimal,
        discountAmount: itemDiscount,
        totalPrice: itemTotal,
      });
    }

    const shipping = new Prisma.Decimal(dto.shippingCost ?? 0);
    const orderDiscount = new Prisma.Decimal(dto.discountAmount ?? 0);
    const tax = new Prisma.Decimal(dto.taxAmount ?? 0);
    const totalAmount = subtotal.plus(shipping).plus(tax).minus(orderDiscount);

    if (totalAmount.lessThan(0)) {
      throw new BadRequestException('Order total amount cannot be negative');
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${dateStr}-${randomSuffix}`;

    return await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId: dto.customerId || null,
          warehouseId,
          branchId: dto.branchId || null,
          status: OrderStatus.PENDING,
          paymentStatus: OrderPaymentStatus.UNPAID,
          paymentMethod: dto.paymentMethod ?? OrderPaymentMethod.COD,
          source: dto.source ?? 'WEBSITE',
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone.trim(),
          customerEmail: dto.customerEmail?.trim().toLowerCase() || null,
          shippingAddress: dto.shippingAddress.trim(),
          shippingCity: dto.shippingCity?.trim() || null,
          shippingZone: dto.shippingZone?.trim() || null,
          subtotal,
          shippingCost: shipping,
          discountAmount: orderDiscount,
          taxAmount: tax,
          totalAmount,
          paidAmount: new Prisma.Decimal(0),
          dueAmount: totalAmount,
          notes: dto.notes?.trim() || null,
          createdById: actorId,
          items: {
            create: orderItemsData,
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: OrderStatus.PENDING,
              reason: 'Order placed',
              changedById: actorId,
            },
          },
        },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
              variant: { select: { id: true, name: true, sku: true } },
            },
          },
          customer: true,
          warehouse: true,
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'order.create',
        entityType: 'Order',
        entityId: order.id,
        newValues: {
          orderNumber,
          customerName: dto.customerName,
          totalAmount: totalAmount.toString(),
          itemCount: dto.items.length,
        },
      });

      return order;
    });
  }

  // ---------------------------------------------------------------------------
  // Order State Machine Transitions
  // ---------------------------------------------------------------------------
  async transitionStatus(id: string, dto: UpdateOrderStatusDto, actorId?: string) {
    return this.updateStatus(id, dto, actorId);
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, actorId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        warehouse: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }

    const currentStatus = order.status;
    const targetStatus = dto.status;

    if (currentStatus === targetStatus) {
      return order;
    }

    // State machine validation
    this.validateStatusTransition(currentStatus, targetStatus);

    return await this.prisma.$transaction(async (tx) => {
      // 1. CONFIRMED -> Trigger Stock Reservation
      let newIsReserved = order.isReserved;
      let newIsStockDeducted = order.isStockDeducted;

      if (targetStatus === OrderStatus.CONFIRMED && !order.isReserved) {
        for (const item of order.items) {
          await this.inventoryService.reserveStockTx(tx, {
            warehouseId: order.warehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            referenceType: 'ORDER',
            referenceId: order.id,
            actorId,
          });
        }
        newIsReserved = true;
      }

      // 2. SHIPPED -> Release Reservation and Deduct Stock
      if (targetStatus === OrderStatus.SHIPPED && !order.isStockDeducted) {
        const serialMap = new Map<string, string[]>();
        if (dto.serialNumbers) {
          for (const s of dto.serialNumbers) {
            serialMap.set(s.orderItemId, s.serialNumbers);
          }
        }

        for (const item of order.items) {
          // Release reservation if it was reserved
          if (newIsReserved) {
            await this.inventoryService.releaseReservationTx(tx, {
              warehouseId: order.warehouseId,
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              referenceType: 'ORDER',
              referenceId: order.id,
              actorId,
            });
          }

          const serials = serialMap.get(item.id) || [];
          if (item.product.trackSerial && serials.length !== item.quantity) {
            throw new BadRequestException(
              `Product "${item.product.name}" requires ${item.quantity} serial number(s) to ship, got ${serials.length}`,
            );
          }

          // Deduct physical stock
          await this.inventoryService.adjustStockTx(tx, {
            warehouseId: order.warehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: -item.quantity,
            type: StockMovementType.SALE,
            referenceType: 'ORDER',
            referenceId: order.id,
            serialNumbers: serials,
            reason: `Dispatched order ${order.orderNumber}`,
            actorId,
          });

          // Save serial numbers onto OrderItem
          if (serials.length > 0) {
            await tx.orderItem.update({
              where: { id: item.id },
              data: { serialNumbers: serials },
            });
          }
        }
        newIsReserved = false;
        newIsStockDeducted = true;
      }

      // 3. CANCELLED -> Release Reservation or Restore Stock
      if (targetStatus === OrderStatus.CANCELLED) {
        if (newIsReserved) {
          for (const item of order.items) {
            await this.inventoryService.releaseReservationTx(tx, {
              warehouseId: order.warehouseId,
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              referenceType: 'ORDER_CANCEL',
              referenceId: order.id,
              actorId,
            });
          }
          newIsReserved = false;
        }

        if (newIsStockDeducted) {
          for (const item of order.items) {
            await this.inventoryService.adjustStockTx(tx, {
              warehouseId: order.warehouseId,
              productId: item.productId,
              variantId: item.variantId,
              quantityDelta: item.quantity,
              type: StockMovementType.SALE_RETURN,
              referenceType: 'ORDER_CANCEL',
              referenceId: order.id,
              reason: `Stock restored from cancelled order ${order.orderNumber}`,
              actorId,
            });
          }
          newIsStockDeducted = false;
        }
      }

      // 4. RETURNED -> Restore Stock
      if (targetStatus === OrderStatus.RETURNED && newIsStockDeducted) {
        for (const item of order.items) {
          await this.inventoryService.adjustStockTx(tx, {
            warehouseId: order.warehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: item.quantity,
            type: StockMovementType.SALE_RETURN,
            referenceType: 'ORDER_RETURN',
            referenceId: order.id,
            reason: `Courier return for order ${order.orderNumber}`,
            actorId,
          });
        }
        newIsStockDeducted = false;
      }

      // 5. DELIVERED -> If COD and unpaid, settle payment
      let paidAmount = order.paidAmount;
      let dueAmount = order.dueAmount;
      let paymentStatus = order.paymentStatus;

      if (targetStatus === OrderStatus.DELIVERED && order.paymentMethod === OrderPaymentMethod.COD && paymentStatus !== OrderPaymentStatus.PAID) {
        paidAmount = order.totalAmount;
        dueAmount = new Prisma.Decimal(0);
        paymentStatus = OrderPaymentStatus.PAID;

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const paymentNumber = `OPAY-${dateStr}-${randomSuffix}`;

        await tx.orderPayment.create({
          data: {
            paymentNumber,
            orderId: order.id,
            amount: dueAmount.equals(0) ? order.totalAmount : dueAmount,
            paymentMethod: OrderPaymentMethod.COD,
            notes: 'Cash on delivery collected by courier upon delivery',
          },
        });
      }

      // Update Order
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          status: targetStatus,
          isReserved: newIsReserved,
          isStockDeducted: newIsStockDeducted,
          courierName: dto.courierName || order.courierName,
          courierTrackingCode: dto.courierTrackingCode || order.courierTrackingCode,
          paidAmount,
          dueAmount,
          paymentStatus,
        },
        include: {
          items: true,
          statusHistory: { orderBy: { createdAt: 'desc' } },
        },
      });

      // Append Status History
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          reason: dto.reason?.trim() || null,
          notes: dto.notes?.trim() || null,
          changedById: actorId,
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'order.status_change',
        entityType: 'Order',
        entityId: order.id,
        newValues: {
          orderNumber: order.orderNumber,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          reason: dto.reason,
        },
      });

      return updatedOrder;
    });
  }

  private validateStatusTransition(current: OrderStatus, target: OrderStatus) {
    const allowedMap: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.READY_TO_SHIP, OrderStatus.CANCELLED],
      [OrderStatus.READY_TO_SHIP]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.RETURNED, OrderStatus.CANCELLED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.RETURNED]: [],
    };

    const allowed = allowedMap[current] || [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Invalid status transition from "${current}" to "${target}". Allowed transitions: ${allowed.join(', ') || 'None (terminal state)'}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Order Payments
  // ---------------------------------------------------------------------------
  async addPayment(id: string, dto: CreateOrderPaymentDto, actorId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot add payment to a cancelled order');
    }

    const amountDecimal = new Prisma.Decimal(dto.amount);
    if (amountDecimal.greaterThan(order.dueAmount)) {
      throw new BadRequestException(
        `Payment amount (${amountDecimal.toString()}) cannot exceed remaining due amount (${order.dueAmount.toString()})`,
      );
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const paymentNumber = `OPAY-${dateStr}-${randomSuffix}`;

    return await this.prisma.$transaction(async (tx) => {
      const payment = await tx.orderPayment.create({
        data: {
          paymentNumber,
          orderId: order.id,
          amount: amountDecimal,
          paymentMethod: dto.paymentMethod,
          transactionId: dto.transactionId?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });

      const newPaid = order.paidAmount.plus(amountDecimal);
      const newDue = order.dueAmount.minus(amountDecimal);
      const newPaymentStatus = newDue.equals(0)
        ? OrderPaymentStatus.PAID
        : OrderPaymentStatus.PARTIAL_PAID;

      await tx.order.update({
        where: { id: order.id },
        data: {
          paidAmount: newPaid,
          dueAmount: newDue,
          paymentStatus: newPaymentStatus,
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'order.payment',
        entityType: 'OrderPayment',
        entityId: payment.id,
        newValues: {
          orderNumber: order.orderNumber,
          amount: amountDecimal.toString(),
          paymentStatus: newPaymentStatus,
        },
      });

      return payment;
    });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  async findAll(query: OrderQueryDto): Promise<PaginatedResult<any>> {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }
    if (query.source) {
      where.source = query.source;
    }
    if (query.customerPhone) {
      where.customerPhone = { contains: query.customerPhone.trim() };
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search.trim(), mode: 'insensitive' } },
        { customerName: { contains: query.search.trim(), mode: 'insensitive' } },
        { customerPhone: { contains: query.search.trim() } },
        { courierTrackingCode: { contains: query.search.trim() } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          warehouse: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true, statusHistory: true, payments: true } },
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
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        warehouse: true,
        branch: true,
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, barcode: true, trackSerial: true } },
            variant: { select: { id: true, name: true, sku: true, barcode: true } },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          include: { changedBy: { select: { id: true, name: true, email: true } } },
        },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }

    return order;
  }

  createOrder(dto: CreateOrderDto, actorId?: string) {
    return this.create(dto, actorId);
  }
}
