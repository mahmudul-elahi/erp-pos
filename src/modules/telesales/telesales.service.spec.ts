import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelesalesService } from './telesales.service.js';
import { LeadDisposition, LeadSource, OrderSource } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('TelesalesService', () => {
  let service: TelesalesService;
  let prismaMock: any;
  let auditLogsMock: any;
  let ordersMock: any;

  beforeEach(() => {
    prismaMock = {
      telesalesLead: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      telesalesCallLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn((cb) => {
        if (typeof cb === 'function') {
          return cb(prismaMock);
        }
        return Promise.all(cb);
      }),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({}),
    };

    ordersMock = {
      createOrder: vi.fn(),
    };

    service = new TelesalesService(prismaMock, auditLogsMock, ordersMock);
  });

  it('creates lead with generated leadNumber and default NEW disposition', async () => {
    const fakeLead = {
      id: 'lead-1',
      leadNumber: 'LEAD-20261110-123',
      customerName: 'Tamim Iqbal',
      phone: '+8801700112233',
      source: LeadSource.WEBSITE,
      disposition: LeadDisposition.NEW,
    };
    prismaMock.telesalesLead.create.mockResolvedValue(fakeLead);

    const result = await service.createLead({
      customerName: 'Tamim Iqbal',
      phone: '+8801700112233',
      source: LeadSource.WEBSITE,
    });

    expect(prismaMock.telesalesLead.create).toHaveBeenCalled();
    expect(auditLogsMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'telesales.lead_create' }),
    );
    expect(result).toEqual(fakeLead);
  });

  it('lists leads with pagination metadata', async () => {
    prismaMock.telesalesLead.count.mockResolvedValue(1);
    prismaMock.telesalesLead.findMany.mockResolvedValue([
      { id: 'lead-1', customerName: 'Tamim Iqbal' },
    ]);

    const res = await service.findAll({ page: 1, limit: 10 } as any);
    expect(res.data).toHaveLength(1);
    expect(res.meta.total).toBe(1);
  });

  it('logs call and syncs lead disposition and callback', async () => {
    prismaMock.telesalesLead.findUnique.mockResolvedValue({
      id: 'lead-1',
      customerName: 'Tamim Iqbal',
      disposition: LeadDisposition.NEW,
      callbackAt: null,
    });

    const callLogResult = { id: 'log-1', disposition: LeadDisposition.CALLBACK_REQUESTED };
    const leadUpdateResult = { id: 'lead-1', disposition: LeadDisposition.CALLBACK_REQUESTED };

    prismaMock.telesalesCallLog.create.mockResolvedValue(callLogResult);
    prismaMock.telesalesLead.update.mockResolvedValue(leadUpdateResult);

    const res = await service.logCall(
      'lead-1',
      {
        disposition: LeadDisposition.CALLBACK_REQUESTED,
        callDurationSeconds: 120,
        notes: 'Customer asked to call back tomorrow at 11am',
        callbackAt: '2026-11-11T11:00:00.000Z',
      },
      'agent-uuid-1',
    );

    expect(res.callLog).toEqual(callLogResult);
    expect(res.lead).toEqual(leadUpdateResult);
  });

  it('converts lead into fulfillment order and updates disposition to CONFIRMED', async () => {
    prismaMock.telesalesLead.findUnique.mockResolvedValue({
      id: 'lead-1',
      leadNumber: 'LEAD-101',
      customerName: 'Tamim Iqbal',
      phone: '+8801700112233',
      email: 'tamim@example.com',
      address: 'Gulshan 2, Dhaka',
      city: 'Dhaka',
      convertedOrderId: null,
    });

    ordersMock.createOrder.mockResolvedValue({
      id: 'order-uuid-99',
      orderNumber: 'ORD-20261110-1234',
      status: 'PENDING',
    });

    prismaMock.telesalesLead.update.mockResolvedValue({
      id: 'lead-1',
      disposition: LeadDisposition.CONFIRMED,
      convertedOrderId: 'order-uuid-99',
    });

    const res = await service.convertToOrder(
      'lead-1',
      {
        warehouseId: 'wh-1',
        items: [{ productId: 'prod-1', quantity: 2, unitPrice: 5000 }],
      },
      'agent-1',
    );

    expect(ordersMock.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: 'Tamim Iqbal',
        customerPhone: '+8801700112233',
        source: OrderSource.TELESALES,
      }),
      'agent-1',
    );
    expect(res.order.id).toBe('order-uuid-99');
    expect(res.lead.disposition).toBe(LeadDisposition.CONFIRMED);
  });

  it('rejects order conversion if lead is already converted', async () => {
    prismaMock.telesalesLead.findUnique.mockResolvedValue({
      id: 'lead-1',
      convertedOrderId: 'existing-order-id',
    });

    await expect(
      service.convertToOrder('lead-1', { items: [] } as any, 'agent-1'),
    ).rejects.toThrow(BadRequestException);
  });
});
