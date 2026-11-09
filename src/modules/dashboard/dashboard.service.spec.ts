import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DashboardService } from './dashboard.service.js';
import { CashAccountType, Prisma } from '@prisma/client';

describe('DashboardService', () => {
  let service: DashboardService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      sale: { findMany: vi.fn() },
      order: { findMany: vi.fn(), count: vi.fn() },
      inventoryBalance: { findMany: vi.fn() },
      warrantyClaim: { count: vi.fn() },
      cashAccount: { findMany: vi.fn() },
    };

    service = new DashboardService(prismaMock);
  });

  it('aggregates daily executive metrics and treasury liquidity', async () => {
    prismaMock.sale.findMany.mockResolvedValue([
      { totalAmount: new Prisma.Decimal(45000) },
    ]);
    prismaMock.order.findMany.mockResolvedValue([
      { totalAmount: new Prisma.Decimal(25000) },
    ]);
    prismaMock.order.count.mockResolvedValue(5);
    prismaMock.inventoryBalance.findMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
    prismaMock.warrantyClaim.count.mockResolvedValue(3);
    prismaMock.cashAccount.findMany.mockResolvedValue([
      { type: CashAccountType.CASH, balance: new Prisma.Decimal(20000) },
      { type: CashAccountType.BANK, balance: new Prisma.Decimal(80000) },
      { type: CashAccountType.MFS, balance: new Prisma.Decimal(15000) },
    ]);

    const res = await service.getMetrics();

    expect(res.today.totalRevenue).toBe(70000);
    expect(res.today.posSalesRevenue).toBe(45000);
    expect(res.today.ordersRevenue).toBe(25000);
    expect(res.operations.pendingOrdersToDispatch).toBe(5);
    expect(res.operations.lowStockItemsAlertCount).toBe(2);
    expect(res.operations.activeWarrantyClaimsCount).toBe(3);
    expect(res.treasury.cashOnHand).toBe(20000);
    expect(res.treasury.bankBalance).toBe(80000);
    expect(res.treasury.mfsBalance).toBe(15000);
    expect(res.treasury.totalLiquidity).toBe(115000);
  });
});
