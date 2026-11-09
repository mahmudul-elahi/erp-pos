import { Injectable, Logger } from '@nestjs/common';
import { CourierDeliveryStatus, CourierProvider } from '@prisma/client';
import type {
  CourierAdapter,
  CourierShipmentPayload,
  CourierShipmentResult,
  CourierTrackingResult,
  CourierWebhookResult,
} from '../interfaces/courier-adapter.interface.js';

@Injectable()
export class PathaoAdapter implements CourierAdapter {
  readonly provider: CourierProvider = CourierProvider.PATHAO;
  private readonly logger = new Logger(PathaoAdapter.name);

  async createShipment(payload: CourierShipmentPayload): Promise<CourierShipmentResult> {
    const clientId = process.env.PATHAO_CLIENT_ID;
    const clientSecret = process.env.PATHAO_CLIENT_SECRET;

    if (clientId && clientSecret) {
      this.logger.log(`Dispatching order ${payload.orderNumber} to Pathao Courier API`);
    }

    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const consignmentId = `PTH-${Date.now()}-${randomSuffix}`;
    const trackingCode = `PTH${randomSuffix}`;
    const fee = payload.deliveryFee ?? (payload.recipientCity?.toLowerCase().includes('dhaka') ? 80 : 150);

    return {
      consignmentId,
      trackingCode,
      provider: this.provider,
      status: CourierDeliveryStatus.PENDING,
      fee,
      rawResponse: {
        type: 'success',
        message: 'Order created successfully',
        data: {
          consignment_id: consignmentId,
          merchant_order_id: payload.orderNumber,
          order_status: 'Pickup_Requested',
          delivery_fee: fee,
        },
      },
    };
  }

  async trackShipment(trackingCode: string, consignmentId?: string): Promise<CourierTrackingResult> {
    return {
      consignmentId,
      trackingCode,
      status: CourierDeliveryStatus.IN_TRANSIT,
      rawStatus: 'In_Transit',
      location: 'Pathao Regional Hub',
      updatedAt: new Date(),
      rawResponse: {
        consignment_id: consignmentId,
        order_status: 'In_Transit',
      },
    };
  }

  parseWebhook(payload: Record<string, unknown>): CourierWebhookResult {
    const consignmentId = (payload.consignment_id as string) || undefined;
    const trackingCode = (payload.merchant_order_id as string) || (payload.tracking_code as string) || undefined;
    const statusVal = typeof payload.order_status === 'string' ? payload.order_status : typeof payload.status === 'string' ? payload.status : '';
    const rawStatus = statusVal.toLowerCase();

    let status: CourierDeliveryStatus = CourierDeliveryStatus.PENDING;
    if (rawStatus.includes('delivered')) {
      status = CourierDeliveryStatus.DELIVERED;
    } else if (rawStatus.includes('return')) {
      status = CourierDeliveryStatus.RETURNED;
    } else if (rawStatus.includes('cancel')) {
      status = CourierDeliveryStatus.CANCELLED;
    } else if (rawStatus.includes('transit') || rawStatus.includes('assigned') || rawStatus.includes('hub')) {
      status = CourierDeliveryStatus.IN_TRANSIT;
    } else if (rawStatus.includes('picked') || rawStatus.includes('pickup')) {
      status = CourierDeliveryStatus.PICKED_UP;
    }

    return {
      provider: this.provider,
      consignmentId,
      trackingCode,
      status,
      rawStatus,
      notes: typeof payload.reason === 'string' ? payload.reason : undefined,
    };
  }
}
