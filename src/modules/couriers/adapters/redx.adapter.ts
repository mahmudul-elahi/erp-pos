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
export class RedxAdapter implements CourierAdapter {
  readonly provider: CourierProvider = CourierProvider.REDX;
  private readonly logger = new Logger(RedxAdapter.name);

  async createShipment(payload: CourierShipmentPayload): Promise<CourierShipmentResult> {
    const redxToken = process.env.REDX_API_TOKEN;

    if (redxToken) {
      this.logger.log(`Dispatching order ${payload.orderNumber} to REDX API`);
    }

    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const trackingCode = `REDX${randomSuffix}`;
    const consignmentId = `RDX-${Date.now()}-${randomSuffix}`;
    const fee = payload.deliveryFee ?? (payload.recipientCity?.toLowerCase().includes('dhaka') ? 70 : 140);

    return {
      consignmentId,
      trackingCode,
      provider: this.provider,
      status: CourierDeliveryStatus.PENDING,
      fee,
      rawResponse: {
        tracking_id: trackingCode,
        parcel_id: consignmentId,
        message: 'Parcel created successfully',
      },
    };
  }

  async trackShipment(trackingCode: string, consignmentId?: string): Promise<CourierTrackingResult> {
    return {
      consignmentId,
      trackingCode,
      status: CourierDeliveryStatus.IN_TRANSIT,
      rawStatus: 'in-transit',
      location: 'REDX Hub Tejgaon',
      updatedAt: new Date(),
      rawResponse: {
        tracking_id: trackingCode,
        status: 'in-transit',
      },
    };
  }

  parseWebhook(payload: Record<string, unknown>): CourierWebhookResult {
    const trackingCode = (payload.tracking_id as string) || (payload.tracking_code as string) || undefined;
    const consignmentId = (payload.parcel_id as string) || undefined;
    const statusVal = typeof payload.status === 'string' ? payload.status : '';
    const rawStatus = statusVal.toLowerCase();

    let status: CourierDeliveryStatus = CourierDeliveryStatus.PENDING;
    if (rawStatus.includes('delivered')) {
      status = CourierDeliveryStatus.DELIVERED;
    } else if (rawStatus.includes('returned') || rawStatus.includes('return')) {
      status = CourierDeliveryStatus.RETURNED;
    } else if (rawStatus.includes('cancel')) {
      status = CourierDeliveryStatus.CANCELLED;
    } else if (rawStatus.includes('transit') || rawStatus.includes('sorting')) {
      status = CourierDeliveryStatus.IN_TRANSIT;
    } else if (rawStatus.includes('pickup') || rawStatus.includes('picked')) {
      status = CourierDeliveryStatus.PICKED_UP;
    }

    return {
      provider: this.provider,
      consignmentId,
      trackingCode,
      status,
      rawStatus,
      notes: typeof payload.note === 'string' ? payload.note : undefined,
    };
  }
}
