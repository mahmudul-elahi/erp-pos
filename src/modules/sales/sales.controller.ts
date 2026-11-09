import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesService } from './sales.service.js';
import {
  CashMovementDto,
  CloseShiftDto,
  CreateSaleDto,
  CreateSaleReturnDto,
  OpenShiftDto,
  SaleQueryDto,
  SaleReturnQueryDto,
  ShiftQueryDto,
} from './dto/sales.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('POS Sales & Cash Register Shifts')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  // ---------------------------------------------------------------------------
  // Cash Register Shifts
  // ---------------------------------------------------------------------------
  @Post('shifts/open')
  @RequirePermissions('sales.create')
  @ApiOperation({ summary: 'Open cash register shift with opening cash float' })
  async openShift(
    @Body() dto: OpenShiftDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.salesService.openShift(dto, actor.id);
  }

  @Get('shifts/current')
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'Get current active shift for logged-in cashier' })
  async getCurrentShift(@CurrentUser() actor: AuthenticatedUser) {
    return this.salesService.getCurrentShift(actor.id);
  }

  @Post('shifts/:id/cash-movement')
  @RequirePermissions('sales.create')
  @ApiOperation({ summary: 'Record Cash In or Cash Out petty cash movement during shift' })
  async recordCashMovement(
    @Param('id') id: string,
    @Body() dto: CashMovementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.salesService.recordCashMovement(id, dto, actor.id);
  }

  @Post('shifts/:id/close')
  @RequirePermissions('sales.create')
  @ApiOperation({ summary: 'Close shift with physical cash count and reconcile discrepancy' })
  async closeShift(
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.salesService.closeShift(id, dto, actor.id);
  }

  @Get('shifts')
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'Get paginated cash register shifts' })
  async getShifts(@Query() query: ShiftQueryDto) {
    return this.salesService.getShifts(query);
  }

  @Get('shifts/:id')
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'Get shift details by ID with reconciliation summary' })
  async getShiftById(@Param('id') id: string) {
    return this.salesService.getShiftById(id);
  }

  // ---------------------------------------------------------------------------
  // Sales Returns
  // ---------------------------------------------------------------------------
  @Get('returns')
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'Get paginated list of sales returns' })
  async getReturns(@Query() query: SaleReturnQueryDto) {
    return this.salesService.getReturns(query);
  }

  @Get('returns/:id')
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'Get sale return details by ID' })
  async getReturnById(@Param('id') id: string) {
    return this.salesService.getReturnById(id);
  }

  @Post('returns')
  @RequirePermissions('sales.refund')
  @ApiOperation({ summary: 'Process sales return, restore stock, and issue customer refund' })
  async createReturn(
    @Body() dto: CreateSaleReturnDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.salesService.createReturn(dto, actor.id);
  }

  // ---------------------------------------------------------------------------
  // POS Checkout & Sales
  // ---------------------------------------------------------------------------
  @Post('checkout')
  @RequirePermissions('sales.create')
  @ApiOperation({ summary: 'POS checkout with multi-payment tenders and stock deduction' })
  async checkout(
    @Body() dto: CreateSaleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.salesService.checkout(dto, actor.id);
  }

  @Get()
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'Get paginated sales list with branch and customer filters' })
  async getSales(@Query() query: SaleQueryDto) {
    return this.salesService.getSales(query);
  }

  @Get(':id')
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'Get sale invoice by ID with items and payment breakdown' })
  async getSaleById(@Param('id') id: string) {
    return this.salesService.getSaleById(id);
  }
}
