import { Injectable } from '@nestjs/common';
import { CourierDeliveryStatus, CourierProvider } from '@prisma/client';
import type {
  CourierAdapter,
  CourierShipmentPayload,
  CourierShipmentResult,
  CourierTrackingResult,
  CourierWebhookResult,
} from '../interfaces/courier-adapter.interface.js';

@Injectable()
export class ManualCourierAdapter implements CourierAdapter {
  readonly provider: CourierProvider = CourierProvider.MANUAL;

  async createShipment(payload: CourierShipmentPayload): Promise<CourierShipmentResult> {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const trackingCode = `MAN-${randomSuffix}`;
    const consignmentId = `MANUAL-${Date.now()}`;
    const fee = payload.deliveryFee ?? 60;

    return {
      consignmentId,
      trackingCode,
      provider: this.provider,
      status: CourierDeliveryStatus.PENDING,
      fee,
      rawResponse: {
        note: 'Internal store dispatch agent assigned',
        orderNumber: payload.orderNumber,
      },
    };
  }

  async trackShipment(trackingCode: string, consignmentId?: string): Promise<CourierTrackingResult> {
    return {
      consignmentId,
      trackingCode,
      status: CourierDeliveryStatus.IN_TRANSIT,
      rawStatus: 'in_transit',
      location: 'Local Delivery Rider',
      updatedAt: new Date(),
      rawResponse: {
        trackingCode,
        message: 'Rider is on the way',
      },
    };
  }

  parseWebhook(payload: Record<string, unknown>): CourierWebhookResult {
    const trackingCode = (payload.trackingCode as string) || (payload.tracking_code as string) || undefined;
    const consignmentId = (payload.consignmentId as string) || (payload.consignment_id as string) || undefined;
    const statusVal = typeof payload.status === 'string' ? payload.status : '';
    const rawStatus = statusVal.toUpperCase();

    let status: CourierDeliveryStatus = CourierDeliveryStatus.PENDING;
    if (rawStatus === 'DELIVERED') {
      status = CourierDeliveryStatus.DELIVERED;
    } else if (rawStatus === 'RETURNED') {
      status = CourierDeliveryStatus.RETURNED;
    } else if (rawStatus === 'CANCELLED') {
      status = CourierDeliveryStatus.CANCELLED;
    } else if (rawStatus === 'IN_TRANSIT') {
      status = CourierDeliveryStatus.IN_TRANSIT;
    } else if (rawStatus === 'PICKED_UP') {
      status = CourierDeliveryStatus.PICKED_UP;
    }

    return {
      provider: this.provider,
      consignmentId,
      trackingCode,
      status,
      rawStatus,
      notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    };
  }
}
