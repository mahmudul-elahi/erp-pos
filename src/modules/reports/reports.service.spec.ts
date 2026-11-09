import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportsService } from './reports.service.js';
import { Prisma } from '@prisma/client';

describe('ReportsService', () => {
  let service: ReportsService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      sale: { findMany: vi.fn() },
      order: { findMany: vi.fn() },
      saleReturn: { findMany: vi.fn() },
      expense: { findMany: vi.fn() },
      inventoryBalance: { findMany: vi.fn() },
      cashRegisterShift: { findMany: vi.fn() },
    };

    service = new ReportsService(prismaMock);
  });

  it('calculates Profit & Loss statement correctly with COGS, gross profit, and net profit', async () => {
    // POS Sales: 50,000 revenue with 35,000 COGS
    prismaMock.sale.findMany.mockResolvedValue([
      {
        totalAmount: new Prisma.Decimal(50000),
        items: [{ quantity: 1, product: { costPrice: new Prisma.Decimal(35000) } }],
      },
    ]);

    // Orders: 20,000 revenue with 12,000 COGS
    prismaMock.order.findMany.mockResolvedValue([
      {
        totalAmount: new Prisma.Decimal(20000),
        items: [{ quantity: 2, product: { costPrice: new Prisma.Decimal(6000) } }],
      },
    ]);

    // Refunds: 5,000
    prismaMock.saleReturn.findMany.mockResolvedValue([
      { totalRefund: new Prisma.Decimal(5000) },
    ]);

    // Expenses: 8,000
    prismaMock.expense.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(8000) },
    ]);

    const res = await service.getProfitAndLoss({});

    // Gross Sales = 50,000 + 20,000 = 70,000
    expect(res.revenue.grossSalesRevenue).toBe(70000);
    // Refunds = 5,000
    expect(res.revenue.salesRefunds).toBe(5000);
    // Net Revenue = 65,000
    expect(res.revenue.netSalesRevenue).toBe(65000);
    // COGS = 35,000 + 12,000 = 47,000
    expect(res.costOfGoodsSold).toBe(47000);
    // Gross Profit = 65,000 - 47,000 = 18,000
    expect(res.grossProfit).toBe(18000);
    // Operating Expenses = 8,000
    expect(res.operatingExpenses).toBe(8000);
    // Net Profit = 18,000 - 8,000 = 10,000
    expect(res.netProfit).toBe(10000);
  });

  it('calculates inventory valuation report at cost and retail selling prices', async () => {
    prismaMock.inventoryBalance.findMany.mockResolvedValue([
      {
        onHand: 10,
        warehouseId: 'wh-1',
        warehouse: { id: 'wh-1', name: 'Main Hub', code: 'WH-MAIN' },
        product: {
          costPrice: new Prisma.Decimal(500),
          sellingPrice: new Prisma.Decimal(800),
        },
        variant: null,
      },
    ]);

    const res = await service.getInventoryValuation({});

    expect(res.summary.totalItemsOnHand).toBe(10);
    expect(res.summary.totalCostValuation).toBe(5000);
    expect(res.summary.totalRetailValuation).toBe(8000);
    expect(res.summary.potentialGrossMargin).toBe(3000);
    expect(res.warehouseBreakdown).toHaveLength(1);
    expect(res.warehouseBreakdown[0].costValuation).toBe(5000);
  });

  it('calculates sales summary breakdown across channels', async () => {
    prismaMock.sale.findMany.mockResolvedValue([
      { totalAmount: new Prisma.Decimal(30000) },
    ]);
    prismaMock.order.findMany.mockResolvedValue([
      { totalAmount: new Prisma.Decimal(20000), source: 'WEBSITE' },
      { totalAmount: new Prisma.Decimal(10000), source: 'TELESALES' },
    ]);

    const res = await service.getSalesSummary({});

    expect(res.totalRevenue).toBe(60000);
    expect(res.totalTransactions).toBe(3);
    expect(res.channels.pos.revenue).toBe(30000);
    expect(res.channels.ecommerce.revenue).toBe(20000);
    expect(res.channels.telesales.revenue).toBe(10000);
  });

  it('audits cash register shifts for overages and shortages', async () => {
    prismaMock.cashRegisterShift.findMany.mockResolvedValue([
      {
        id: 'shift-1',
        shiftNumber: 'SH-1',
        branch: { name: 'Main Branch' },
        user: { name: 'Cashier 1' },
        openingCashFloat: new Prisma.Decimal(1000),
        closingCashExpected: new Prisma.Decimal(15000),
        closingCashActual: new Prisma.Decimal(15500),
        cashDifference: new Prisma.Decimal(500), // +500 overage
        closedAt: new Date(),
      },
    ]);

    const res = await service.getRegisterDiscrepancies({});

    expect(res.summary.totalShiftsAudited).toBe(1);
    expect(res.summary.totalOverageAmount).toBe(500);
    expect(res.discrepancies[0].status).toBe('OVERAGE');
  });
});
