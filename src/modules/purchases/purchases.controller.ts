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
import { PurchasesService } from './purchases.service.js';
import {
  CreatePurchaseDto,
  CreatePurchasePaymentDto,
  CreatePurchaseReturnDto,
  PurchaseQueryDto,
  PurchaseReturnQueryDto,
  ReceivePurchaseDto,
} from './dto/purchase.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Purchases & Purchase Returns')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private purchasesService: PurchasesService) {}

  // ---------------------------------------------------------------------------
  // Purchase Orders
  // ---------------------------------------------------------------------------
  @Post()
  @RequirePermissions('purchases.create')
  @ApiOperation({ summary: 'Create a supplier purchase order with items, costs, and taxes' })
  async create(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.purchasesService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('purchases.view')
  @ApiOperation({ summary: 'Get paginated list of purchase orders with status and supplier filters' })
  async findAll(@Query() query: PurchaseQueryDto) {
    return this.purchasesService.findAll(query);
  }

  // NOTE: Static routes before dynamic `:id`
  @Get('returns')
  @RequirePermissions('purchases.view')
  @ApiOperation({ summary: 'Get paginated list of purchase returns' })
  async getReturns(@Query() query: PurchaseReturnQueryDto) {
    return this.purchasesService.getReturns(query);
  }

  @Get('returns/:id')
  @RequirePermissions('purchases.view')
  @ApiOperation({ summary: 'Get purchase return details by ID' })
  async getReturnById(@Param('id') id: string) {
    return this.purchasesService.getReturnById(id);
  }

  @Post('returns')
  @RequirePermissions('purchases.create')
  @ApiOperation({ summary: 'Create purchase return: deduct stock and update supplier ledger' })
  async createReturn(
    @Body() dto: CreatePurchaseReturnDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.purchasesService.createReturn(dto, actor.id);
  }

  @Get(':id')
  @RequirePermissions('purchases.view')
  @ApiOperation({ summary: 'Get purchase order details by ID with items, payments, and returns' })
  async findById(@Param('id') id: string) {
    return this.purchasesService.findById(id);
  }

  @Post(':id/receive')
  @RequirePermissions('purchases.receive')
  @ApiOperation({ summary: 'Receive goods into warehouse, increment on-hand stock, and log supplier credit' })
  async receive(
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.purchasesService.receive(id, dto, actor.id);
  }

  @Post(':id/payments')
  @RequirePermissions('purchases.create')
  @ApiOperation({ summary: 'Record payment against purchase order and debit supplier payable ledger' })
  async addPayment(
    @Param('id') id: string,
    @Body() dto: CreatePurchasePaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.purchasesService.addPayment(id, dto, actor.id);
  }

  @Post(':id/cancel')
  @RequirePermissions('purchases.create')
  @ApiOperation({ summary: 'Cancel purchase order before any goods are received' })
  async cancel(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.purchasesService.cancel(id, actor.id);
  }
}
