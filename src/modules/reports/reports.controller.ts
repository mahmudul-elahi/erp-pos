import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service.js';
import {
  DateRangeQueryDto,
  InventoryValuationQueryDto,
  SalesSummaryQueryDto,
} from './dto/report-query.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';

@ApiTags('Reports & Financial Reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('profit-and-loss')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Generate Financial Profit & Loss (P&L) statement' })
  getProfitAndLoss(@Query() query: DateRangeQueryDto) {
    return this.reportsService.getProfitAndLoss(query);
  }

  @Get('inventory-valuation')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Generate inventory stock valuation report (Cost vs Retail Valuation)' })
  getInventoryValuation(@Query() query: InventoryValuationQueryDto) {
    return this.reportsService.getInventoryValuation(query);
  }

  @Get('sales-summary')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Generate sales performance summary breakdown across POS, E-commerce, and Telesales' })
  getSalesSummary(@Query() query: SalesSummaryQueryDto) {
    return this.reportsService.getSalesSummary(query);
  }

  @Get('register-discrepancies')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Audit register shift cash balances for overages and shortages' })
  getRegisterDiscrepancies(@Query() query: DateRangeQueryDto) {
    return this.reportsService.getRegisterDiscrepancies(query);
  }
}
