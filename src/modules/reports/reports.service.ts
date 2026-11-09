import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  DateRangeQueryDto,
  InventoryValuationQueryDto,
  SalesSummaryQueryDto,
} from './dto/report-query.dto.js';
import { OrderStatus, SaleStatus, ShiftStatus } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Financial Profit & Loss (P&L) Summary
  // ---------------------------------------------------------------------------
  async getProfitAndLoss(query: DateRangeQueryDto) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (query.startDate) {
      dateFilter.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const hasDate = Object.keys(dateFilter).length > 0;

    // 1. POS Sales Revenue & Items
    const sales = await this.prisma.sale.findMany({
      where: {
        status: SaleStatus.COMPLETED,
        ...(hasDate ? { createdAt: dateFilter } : {}),
      },
      include: {
        items: {
          include: {
            product: { select: { costPrice: true } },
            variant: { select: { costPrice: true } },
          },
        },
      },
    });

    // 2. E-Commerce & Telesales Orders Revenue & Items
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
        ...(hasDate ? { createdAt: dateFilter } : {}),
      },
      include: {
        items: {
          include: {
            product: { select: { costPrice: true } },
            variant: { select: { costPrice: true } },
          },
        },
      },
    });

    let grossSalesRevenue = 0;
    let cogs = 0;

    for (const sale of sales) {
      grossSalesRevenue += Number(sale.totalAmount);
      for (const item of sale.items) {
        const itemCost = Number(item.variant?.costPrice ?? item.product.costPrice ?? 0);
        cogs += itemCost * item.quantity;
      }
    }

    for (const order of orders) {
      grossSalesRevenue += Number(order.totalAmount);
      for (const item of order.items) {
        const itemCost = Number(item.variant?.costPrice ?? item.product.costPrice ?? 0);
        cogs += itemCost * item.quantity;
      }
    }

    // 3. Sales Refunds & Returns
    const returns = await this.prisma.saleReturn.findMany({
      where: hasDate ? { createdAt: dateFilter } : {},
      select: { totalRefund: true },
    });
    const totalRefunds = returns.reduce((sum, r) => sum + Number(r.totalRefund), 0);

    const netSalesRevenue = Math.max(0, grossSalesRevenue - totalRefunds);
    const grossProfit = netSalesRevenue - cogs;

    // 4. Operating Expenses
    const expenses = await this.prisma.expense.findMany({
      where: hasDate ? { expenseDate: dateFilter } : {},
      select: { amount: true },
    });
    const totalOperatingExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const netProfit = grossProfit - totalOperatingExpenses;
    const grossProfitMargin = netSalesRevenue > 0 ? (grossProfit / netSalesRevenue) * 100 : 0;
    const netProfitMargin = netSalesRevenue > 0 ? (netProfit / netSalesRevenue) * 100 : 0;

    return {
      period: {
        startDate: query.startDate ?? 'All Time',
        endDate: query.endDate ?? 'All Time',
      },
      revenue: {
        grossSalesRevenue: Math.round(grossSalesRevenue * 100) / 100,
        salesRefunds: Math.round(totalRefunds * 100) / 100,
        netSalesRevenue: Math.round(netSalesRevenue * 100) / 100,
      },
      costOfGoodsSold: Math.round(cogs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossProfitMarginPercentage: Math.round(grossProfitMargin * 100) / 100,
      operatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      netProfitMarginPercentage: Math.round(netProfitMargin * 100) / 100,
    };
  }

  // ---------------------------------------------------------------------------
  // Stock Valuation Report (Cost vs Retail Valuation)
  // ---------------------------------------------------------------------------
  async getInventoryValuation(query: InventoryValuationQueryDto) {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        onHand: { gt: 0 },
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      },
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, costPrice: true, sellingPrice: true } },
        variant: { select: { id: true, name: true, costPrice: true, sellingPrice: true } },
      },
    });

    let totalItemsOnHand = 0;
    let totalCostValuation = 0;
    let totalRetailValuation = 0;

    const warehouseMap = new Map<string, {
      warehouseId: string;
      warehouseName: string;
      itemsCount: number;
      costValuation: number;
      retailValuation: number;
    }>();

    for (const b of balances) {
      const qty = b.onHand;
      const cost = Number(b.variant?.costPrice ?? b.product.costPrice ?? 0);
      const retail = Number(b.variant?.sellingPrice ?? b.product.sellingPrice ?? 0);

      totalItemsOnHand += qty;
      totalCostValuation += cost * qty;
      totalRetailValuation += retail * qty;

      const wKey = b.warehouseId;
      if (!warehouseMap.has(wKey)) {
        warehouseMap.set(wKey, {
          warehouseId: b.warehouse.id,
          warehouseName: b.warehouse.name,
          itemsCount: 0,
          costValuation: 0,
          retailValuation: 0,
        });
      }
      const wStat = warehouseMap.get(wKey)!;
      wStat.itemsCount += qty;
      wStat.costValuation += cost * qty;
      wStat.retailValuation += retail * qty;
    }

    const potentialMargin = totalRetailValuation - totalCostValuation;
    const potentialMarginPercentage = totalRetailValuation > 0 ? (potentialMargin / totalRetailValuation) * 100 : 0;

    return {
      summary: {
        totalSKUs: balances.length,
        totalItemsOnHand,
        totalCostValuation: Math.round(totalCostValuation * 100) / 100,
        totalRetailValuation: Math.round(totalRetailValuation * 100) / 100,
        potentialGrossMargin: Math.round(potentialMargin * 100) / 100,
        potentialGrossMarginPercentage: Math.round(potentialMarginPercentage * 100) / 100,
      },
      warehouseBreakdown: Array.from(warehouseMap.values()),
    };
  }

  // ---------------------------------------------------------------------------
  // Sales Breakdown by Channel
  // ---------------------------------------------------------------------------
  async getSalesSummary(query: SalesSummaryQueryDto) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (query.startDate) {
      dateFilter.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const hasDate = Object.keys(dateFilter).length > 0;

    // 1. POS Sales
    const posSales = await this.prisma.sale.findMany({
      where: {
        status: SaleStatus.COMPLETED,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(hasDate ? { createdAt: dateFilter } : {}),
      },
      select: { totalAmount: true },
    });
    const posTotal = posSales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const posCount = posSales.length;

    // 2. Orders (E-Commerce vs Telesales)
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(hasDate ? { createdAt: dateFilter } : {}),
      },
      select: { totalAmount: true, source: true },
    });

    let ecomTotal = 0;
    let ecomCount = 0;
    let telesalesTotal = 0;
    let telesalesCount = 0;

    for (const order of orders) {
      const amt = Number(order.totalAmount);
      if (order.source === 'TELESALES') {
        telesalesTotal += amt;
        telesalesCount++;
      } else {
        ecomTotal += amt;
        ecomCount++;
      }
    }

    const totalRevenue = posTotal + ecomTotal + telesalesTotal;
    const totalTransactions = posCount + ecomCount + telesalesCount;
    const aov = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalTransactions,
      averageOrderValue: Math.round(aov * 100) / 100,
      channels: {
        pos: {
          transactions: posCount,
          revenue: Math.round(posTotal * 100) / 100,
          percentage: totalRevenue > 0 ? Math.round((posTotal / totalRevenue) * 10000) / 100 : 0,
        },
        ecommerce: {
          transactions: ecomCount,
          revenue: Math.round(ecomTotal * 100) / 100,
          percentage: totalRevenue > 0 ? Math.round((ecomTotal / totalRevenue) * 10000) / 100 : 0,
        },
        telesales: {
          transactions: telesalesCount,
          revenue: Math.round(telesalesTotal * 100) / 100,
          percentage: totalRevenue > 0 ? Math.round((telesalesTotal / totalRevenue) * 10000) / 100 : 0,
        },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Cash Register Shift Discrepancy Audit
  // ---------------------------------------------------------------------------
  async getRegisterDiscrepancies(query: DateRangeQueryDto) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (query.startDate) {
      dateFilter.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const hasDate = Object.keys(dateFilter).length > 0;

    const closedShifts = await this.prisma.cashRegisterShift.findMany({
      where: {
        status: ShiftStatus.CLOSED,
        ...(hasDate ? { closedAt: dateFilter } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { closedAt: 'desc' },
      take: 50,
    });

    let totalOverages = 0;
    let totalShortages = 0;
    let exactMatches = 0;

    const discrepancies = closedShifts.map((shift) => {
      const expected = Number(shift.closingCashExpected ?? 0);
      const actual = Number(shift.closingCashActual ?? 0);
      const diff = Math.round(Number(shift.cashDifference ?? (actual - expected)) * 100) / 100;

      if (diff > 0) {
        totalOverages += diff;
      } else if (diff < 0) {
        totalShortages += Math.abs(diff);
      } else {
        exactMatches++;
      }

      return {
        shiftId: shift.id,
        shiftNumber: shift.shiftNumber,
        branch: shift.branch.name,
        cashier: shift.user.name,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        openingFloat: Number(shift.openingCashFloat),
        expectedCash: expected,
        countedCash: actual,
        difference: diff,
        status: diff === 0 ? 'BALANCED' : diff > 0 ? 'OVERAGE' : 'SHORTAGE',
        closingNotes: shift.closingNotes,
      };
    });

    return {
      summary: {
        totalShiftsAudited: closedShifts.length,
        exactMatches,
        totalOverageAmount: Math.round(totalOverages * 100) / 100,
        totalShortageAmount: Math.round(totalShortages * 100) / 100,
      },
      discrepancies,
    };
  }
}
