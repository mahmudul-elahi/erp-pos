import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service.js';
import {
  AddCustomerAdjustmentDto,
  CreateCustomerDto,
  UpdateCustomerDto,
} from './dto/customer.dto.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Customers & Customer Ledgers')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Post()
  @RequirePermissions('customers.manage')
  @ApiOperation({ summary: 'Create customer with contact details, address and auditable opening balance' })
  async create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('customers.view')
  @ApiOperation({ summary: 'Get paginated list of customers with computed running balance' })
  async findAll(@Query() pagination: PaginationDto) {
    return this.customersService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions('customers.view')
  @ApiOperation({ summary: 'Get customer details, contact info, total debits/credits and balance' })
  async findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Get(':id/ledger')
  @RequirePermissions('customers.view')
  @ApiOperation({ summary: 'Get immutable customer transaction ledger with running balance history' })
  async getLedger(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.customersService.getLedger(id, pagination);
  }

  @Post(':id/adjustments')
  @RequirePermissions('customers.manage')
  @ApiOperation({ summary: 'Record manual auditable ledger adjustment for customer balance' })
  async addAdjustment(
    @Param('id') id: string,
    @Body() dto: AddCustomerAdjustmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.addAdjustment(id, dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('customers.manage')
  @ApiOperation({ summary: 'Update customer contact info, address, or credit limit' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('customers.manage')
  @ApiOperation({ summary: 'Archive / soft delete customer profile' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.remove(id, actor.id);
  }
}
