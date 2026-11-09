import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { CourierAdapterFactory } from './courier-adapter.factory.js';
import type { CreateShipmentDto } from './dto/create-shipment.dto.js';
import type { QueryShipmentsDto } from './dto/query-shipments.dto.js';
import {
  buildPaginationMeta,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto.js';
import {
  CourierDeliveryStatus,
  CourierProvider,
  OrderStatus,
  Prisma,
} from '@prisma/client';

@Injectable()
export class CouriersService {
  private readonly logger = new Logger(CouriersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly ordersService: OrdersService,
    private readonly adapterFactory: CourierAdapterFactory,
  ) {}

  async createShipment(dto: CreateShipmentDto, actorId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: { include: { product: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${dto.orderId}" not found`);
    }

    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.RETURNED ||
      order.status === OrderStatus.DELIVERED
    ) {
      throw new BadRequestException(
        `Cannot create courier shipment for order in "${order.status}" status`,
      );
    }

    const adapter = this.adapterFactory.getAdapter(dto.provider);

    const recipientName = dto.recipientName?.trim() || order.customerName;
    const recipientPhone = dto.recipientPhone?.trim() || order.customerPhone;
    const recipientAddress = dto.recipientAddress?.trim() || order.shippingAddress;
    const recipientCity = dto.recipientCity?.trim() || order.shippingCity;
    const recipientZone = dto.recipientZone?.trim() || order.shippingZone;
    const codAmount = dto.codAmount !== undefined ? dto.codAmount : Number(order.dueAmount);

    const shipmentResult = await adapter.createShipment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      recipientName,
      recipientPhone,
      recipientAddress,
      recipientCity,
      recipientZone,
      codAmount,
      deliveryFee: dto.deliveryFee,
      specialInstruction: dto.notes,
    });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const shipmentNumber = `SHIP-${dateStr}-${randomSuffix}`;

    const shipment = await this.prisma.courierShipment.create({
      data: {
        shipmentNumber,
        orderId: order.id,
        provider: dto.provider,
        consignmentId: shipmentResult.consignmentId,
        trackingCode: shipmentResult.trackingCode,
        status: shipmentResult.status,
        deliveryFee: new Prisma.Decimal(shipmentResult.fee),
        codAmount: new Prisma.Decimal(codAmount),
        recipientName,
        recipientPhone,
        recipientAddress,
        recipientCity,
        recipientZone,
        statusHistory: [
          {
            status: shipmentResult.status,
            timestamp: now.toISOString(),
            message: 'Shipment created and dispatched to courier adapter',
          },
        ],
        courierPayload: (shipmentResult.rawResponse || {}) as Prisma.InputJsonValue,
        createdById: actorId,
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
          },
        },
      },
    });

    // Advance order status to SHIPPED through pipeline
    try {
      let currentStatus = order.status;
      if (currentStatus === OrderStatus.PENDING) {
        await this.ordersService.transitionStatus(
          order.id,
          {
            status: OrderStatus.CONFIRMED,
            notes: 'Auto-confirmed for courier dispatch',
          },
          actorId,
        );
        currentStatus = OrderStatus.CONFIRMED;
      }
      if (currentStatus === OrderStatus.CONFIRMED) {
        await this.ordersService.transitionStatus(
          order.id,
          {
            status: OrderStatus.PROCESSING,
            notes: 'Processing for courier dispatch',
          },
          actorId,
        );
        currentStatus = OrderStatus.PROCESSING;
      }
      if (currentStatus === OrderStatus.PROCESSING) {
        await this.ordersService.transitionStatus(
          order.id,
          {
            status: OrderStatus.READY_TO_SHIP,
            notes: 'Ready for courier dispatch',
          },
          actorId,
        );
        currentStatus = OrderStatus.READY_TO_SHIP;
      }
      if (currentStatus === OrderStatus.READY_TO_SHIP) {
        await this.ordersService.transitionStatus(
          order.id,
          {
            status: OrderStatus.SHIPPED,
            courierName: dto.provider,
            courierTrackingCode: shipmentResult.trackingCode,
            notes: `Dispatched via ${dto.provider} (Consignment: ${shipmentResult.consignmentId})`,
          },
          actorId,
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Automated order transition during courier dispatch skipped or deferred: ${errMsg}`,
      );
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'courier.shipment_create',
      entityType: 'CourierShipment',
      entityId: shipment.id,
      newValues: {
        shipmentNumber,
        provider: dto.provider,
        trackingCode: shipmentResult.trackingCode,
        consignmentId: shipmentResult.consignmentId,
      },
    });

    return shipment;
  }

  async findAll(query: QueryShipmentsDto): Promise<PaginatedResult<any>> {
    const where: Prisma.CourierShipmentWhereInput = {};
    if (query.provider) {
      where.provider = query.provider;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.orderId) {
      where.orderId = query.orderId;
    }
    if (query.search) {
      where.OR = [
        { trackingCode: { contains: query.search.trim(), mode: 'insensitive' } },
        { consignmentId: { contains: query.search.trim(), mode: 'insensitive' } },
        { recipientPhone: { contains: query.search.trim() } },
        { shipmentNumber: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.courierShipment.count({ where }),
      this.prisma.courierShipment.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              totalAmount: true,
              customerName: true,
              customerPhone: true,
            },
          },
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

  async findById(id: string) {
    const shipment = await this.prisma.courierShipment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, sku: true } },
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!shipment) {
      throw new NotFoundException(`Courier shipment with ID "${id}" not found`);
    }

    return shipment;
  }

  async trackShipment(id: string) {
    const shipment = await this.findById(id);
    const adapter = this.adapterFactory.getAdapter(shipment.provider);

    const trackingResult = await adapter.trackShipment(
      shipment.trackingCode || '',
      shipment.consignmentId || undefined,
    );

    // If status changed, update shipment
    if (trackingResult.status !== shipment.status) {
      const history = (shipment.statusHistory as any[]) || [];
      history.push({
        status: trackingResult.status,
        timestamp: new Date().toISOString(),
        location: trackingResult.location,
        rawStatus: trackingResult.rawStatus,
      });

      await this.prisma.courierShipment.update({
        where: { id },
        data: {
          status: trackingResult.status,
          statusHistory: history,
        },
      });
    }

    return {
      shipmentId: shipment.id,
      shipmentNumber: shipment.shipmentNumber,
      provider: shipment.provider,
      consignmentId: shipment.consignmentId,
      trackingCode: shipment.trackingCode,
      status: trackingResult.status,
      rawStatus: trackingResult.rawStatus,
      location: trackingResult.location,
      updatedAt: trackingResult.updatedAt,
    };
  }

  async handleWebhook(provider: CourierProvider, payload: Record<string, unknown>) {
    this.logger.log(`Received incoming webhook from courier provider ${provider}`);
    const adapter = this.adapterFactory.getAdapter(provider);
    const result = adapter.parseWebhook(payload);

    // Locate shipment
    const shipment = await this.prisma.courierShipment.findFirst({
      where: {
        provider,
        OR: [
          ...(result.consignmentId ? [{ consignmentId: result.consignmentId }] : []),
          ...(result.trackingCode ? [{ trackingCode: result.trackingCode }] : []),
        ],
      },
      include: { order: true },
    });

    if (!shipment) {
      this.logger.warn(
        `Webhook ignored: No shipment found matching tracking=${result.trackingCode} or consignment=${result.consignmentId} for provider ${provider}`,
      );
      return {
        success: false,
        message: 'Shipment not found in local system',
        received: result,
      };
    }

    const currentHistory = (shipment.statusHistory as any[]) || [];
    currentHistory.push({
      status: result.status,
      timestamp: new Date().toISOString(),
      rawStatus: result.rawStatus,
      notes: result.notes,
      source: 'WEBHOOK',
    });

    const updatedShipment = await this.prisma.courierShipment.update({
      where: { id: shipment.id },
      data: {
        status: result.status,
        statusHistory: currentHistory,
      },
    });

    // Synchronize Order status
    try {
      if (
        result.status === CourierDeliveryStatus.DELIVERED &&
        shipment.order.status !== OrderStatus.DELIVERED
      ) {
        await this.ordersService.transitionStatus(shipment.order.id, {
          status: OrderStatus.DELIVERED,
          reason: `Automated webhook: Delivered by ${provider}`,
        });
      } else if (
        result.status === CourierDeliveryStatus.RETURNED &&
        shipment.order.status !== OrderStatus.RETURNED
      ) {
        await this.ordersService.transitionStatus(shipment.order.id, {
          status: OrderStatus.RETURNED,
          reason: `Automated webhook: Returned by ${provider}`,
        });
      } else if (
        result.status === CourierDeliveryStatus.CANCELLED &&
        shipment.order.status !== OrderStatus.CANCELLED
      ) {
        await this.ordersService.transitionStatus(shipment.order.id, {
          status: OrderStatus.CANCELLED,
          reason: `Automated webhook: Delivery cancelled by ${provider}`,
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not auto-transition order ${shipment.orderId}: ${errMsg}`);
    }

    return {
      success: true,
      shipmentId: updatedShipment.id,
      newStatus: updatedShipment.status,
    };
  }
}
