import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service.js';
import {
  CreateOrderDto,
  CreateOrderPaymentDto,
  OrderQueryDto,
  UpdateOrderStatusDto,
} from './dto/order.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('E-commerce Orders & State Workflow')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @RequirePermissions('orders.manage')
  @ApiOperation({ summary: 'Create a new e-commerce / omni-channel customer order' })
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('orders.view')
  @ApiOperation({ summary: 'Get paginated list of orders with status and phone filters' })
  async findAll(@Query() query: OrderQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('orders.view')
  @ApiOperation({ summary: 'Get order details by ID with items, status history, and payments' })
  async findById(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @Patch(':id/status')
  @RequirePermissions('orders.manage')
  @ApiOperation({ summary: 'Transition order state machine status with stock reservation & deduction rules' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.updateStatus(id, dto, actor.id);
  }

  @Post(':id/payments')
  @RequirePermissions('orders.manage')
  @ApiOperation({ summary: 'Record payment or advance delivery fee against order' })
  async addPayment(
    @Param('id') id: string,
    @Body() dto: CreateOrderPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.addPayment(id, dto, actor.id);
  }
}
