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
import { InventoryService } from './inventory.service.js';
import {
  CreateDamagedProductDto,
  CreateStockAdjustmentDto,
  CreateStockTransferDto,
  DamagedProductQueryDto,
  InventoryBalanceQueryDto,
  StockAdjustmentQueryDto,
  StockMovementQueryDto,
  StockTransferQueryDto,
} from './dto/inventory.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Inventory Management')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  // ---------------------------------------------------------------------------
  // Balances & Movements
  // ---------------------------------------------------------------------------
  @Get('balances')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get paginated inventory balances across warehouses and products' })
  async getBalances(@Query() query: InventoryBalanceQueryDto) {
    return this.inventoryService.getBalances(query);
  }

  @Get('balances/:warehouseId/:productId')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get inventory balance for a specific product in a warehouse' })
  async getBalance(
    @Param('warehouseId') warehouseId: string,
    @Param('productId') productId: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.inventoryService.getBalance(warehouseId, productId, variantId);
  }

  @Get('movements')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get immutable audit trail of stock movements' })
  async getMovements(@Query() query: StockMovementQueryDto) {
    return this.inventoryService.getMovements(query);
  }

  @Get('low-stock')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get low stock alerts where on-hand quantity is below alert threshold' })
  async getLowStockAlerts(@Query('warehouseId') warehouseId?: string) {
    return this.inventoryService.getLowStockAlerts(warehouseId);
  }

  // ---------------------------------------------------------------------------
  // Adjustments
  // ---------------------------------------------------------------------------
  @Post('adjustments')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Create a stock adjustment (draft or immediate confirmation)' })
  async createAdjustment(
    @Body() dto: CreateStockAdjustmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.createAdjustment(dto, actor.id);
  }

  @Post('adjustments/:id/confirm')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Confirm a draft stock adjustment and apply stock changes' })
  async confirmAdjustment(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.confirmAdjustment(id, actor.id);
  }

  @Get('adjustments')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get paginated stock adjustments list' })
  async getAdjustments(@Query() query: StockAdjustmentQueryDto) {
    return this.inventoryService.getAdjustments(query);
  }

  @Get('adjustments/:id')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get stock adjustment details by ID' })
  async getAdjustmentById(@Param('id') id: string) {
    return this.inventoryService.getAdjustmentById(id);
  }

  // ---------------------------------------------------------------------------
  // Transfers
  // ---------------------------------------------------------------------------
  @Post('transfers')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Create a draft stock transfer between warehouses' })
  async createTransfer(
    @Body() dto: CreateStockTransferDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.createTransfer(dto, actor.id);
  }

  @Post('transfers/:id/dispatch')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Dispatch transfer: deduct source onHand, increment destination inTransit' })
  async dispatchTransfer(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.dispatchTransfer(id, actor.id);
  }

  @Post('transfers/:id/receive')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Receive transfer: deduct destination inTransit, increment destination onHand' })
  async receiveTransfer(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.receiveTransfer(id, actor.id);
  }

  @Post('transfers/:id/cancel')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Cancel transfer: revert in-transit and return stock to source if dispatched' })
  async cancelTransfer(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.cancelTransfer(id, actor.id);
  }

  @Get('transfers')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get paginated list of stock transfers' })
  async getTransfers(@Query() query: StockTransferQueryDto) {
    return this.inventoryService.getTransfers(query);
  }

  @Get('transfers/:id')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get stock transfer details by ID' })
  async getTransferById(@Param('id') id: string) {
    return this.inventoryService.getTransferById(id);
  }

  // ---------------------------------------------------------------------------
  // Damaged Products
  // ---------------------------------------------------------------------------
  @Post('damage')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Record damaged items and write off inventory' })
  async recordDamaged(
    @Body() dto: CreateDamagedProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.recordDamaged(dto, actor.id);
  }

  @Get('damage')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get paginated list of damaged product write-offs' })
  async getDamaged(@Query() query: DamagedProductQueryDto) {
    return this.inventoryService.getDamaged(query);
  }

  @Get('damage/:id')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get damaged product record by ID' })
  async getDamagedById(@Param('id') id: string) {
    return this.inventoryService.getDamagedById(id);
  }
}
