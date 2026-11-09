import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CashAccountType, OrderStatus, SaleStatus, WarrantyClaimStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      todaySales,
      todayOrders,
      pendingOrdersCount,
      lowStockBalances,
      activeWarrantyClaimsCount,
      cashAccounts,
    ] = await Promise.all([
      // Today's POS sales
      this.prisma.sale.findMany({
        where: {
          status: SaleStatus.COMPLETED,
          createdAt: { gte: todayStart },
        },
        select: { totalAmount: true },
      }),
      // Today's E-com/Telesales orders
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: todayStart },
        },
        select: { totalAmount: true, status: true },
      }),
      // Orders pending confirmation/fulfillment
      this.prisma.order.count({
        where: { status: OrderStatus.PENDING },
      }),
      // Low stock balances
      this.prisma.inventoryBalance.findMany({
        where: { onHand: { lte: 5 } },
        select: { id: true },
      }),
      // Active in-service warranty claims
      this.prisma.warrantyClaim.count({
        where: {
          status: {
            in: [
              WarrantyClaimStatus.RECEIVED,
              WarrantyClaimStatus.DIAGNOSING,
              WarrantyClaimStatus.SENT_TO_SERVICE_CENTER,
            ],
          },
        },
      }),
      // Cash & Bank balances
      this.prisma.cashAccount.findMany({
        where: { isActive: true },
        select: { type: true, balance: true },
      }),
    ]);

    const posSalesRevenue = todaySales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const ordersRevenue = todayOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const totalTodayRevenue = posSalesRevenue + ordersRevenue;

    const treasury = {
      cash: 0,
      bank: 0,
      mfs: 0,
      total: 0,
    };

    for (const acc of cashAccounts) {
      const b = Number(acc.balance);
      treasury.total += b;
      if (acc.type === CashAccountType.CASH) {
        treasury.cash += b;
      } else if (acc.type === CashAccountType.BANK) {
        treasury.bank += b;
      } else if (acc.type === CashAccountType.MFS) {
        treasury.mfs += b;
      }
    }

    return {
      today: {
        totalRevenue: Math.round(totalTodayRevenue * 100) / 100,
        posSalesRevenue: Math.round(posSalesRevenue * 100) / 100,
        ordersRevenue: Math.round(ordersRevenue * 100) / 100,
        posTransactionsCount: todaySales.length,
        ordersCount: todayOrders.length,
      },
      operations: {
        pendingOrdersToDispatch: pendingOrdersCount,
        lowStockItemsAlertCount: lowStockBalances.length,
        activeWarrantyClaimsCount,
      },
      treasury: {
        cashOnHand: Math.round(treasury.cash * 100) / 100,
        bankBalance: Math.round(treasury.bank * 100) / 100,
        mfsBalance: Math.round(treasury.mfs * 100) / 100,
        totalLiquidity: Math.round(treasury.total * 100) / 100,
      },
    };
  }
}
