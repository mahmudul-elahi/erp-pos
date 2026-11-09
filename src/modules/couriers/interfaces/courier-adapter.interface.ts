import type { CourierDeliveryStatus, CourierProvider } from '@prisma/client';

export interface CourierShipmentPayload {
  orderId: string;
  orderNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientCity?: string | null;
  recipientZone?: string | null;
  codAmount: number;
  deliveryFee?: number;
  specialInstruction?: string | null;
}

export interface CourierShipmentResult {
  consignmentId: string;
  trackingCode: string;
  provider: CourierProvider;
  status: CourierDeliveryStatus;
  fee: number;
  rawResponse?: Record<string, unknown>;
}

export interface CourierTrackingResult {
  consignmentId?: string;
  trackingCode: string;
  status: CourierDeliveryStatus;
  rawStatus: string;
  location?: string;
  updatedAt: Date;
  rawResponse?: Record<string, unknown>;
}

export interface CourierWebhookResult {
  provider: CourierProvider;
  consignmentId?: string;
  trackingCode?: string;
  status: CourierDeliveryStatus;
  rawStatus: string;
  notes?: string;
}

export interface CourierAdapter {
  readonly provider: CourierProvider;
  createShipment(payload: CourierShipmentPayload): Promise<CourierShipmentResult>;
  trackShipment(trackingCode: string, consignmentId?: string): Promise<CourierTrackingResult>;
  parseWebhook(payload: Record<string, unknown>): CourierWebhookResult;
}
