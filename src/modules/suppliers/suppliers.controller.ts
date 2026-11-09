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
import { SuppliersService } from './suppliers.service.js';
import {
  AddSupplierAdjustmentDto,
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/supplier.dto.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Suppliers & Supplier Ledgers')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Post()
  @RequirePermissions('suppliers.manage')
  @ApiOperation({ summary: 'Create supplier with company details, trade license, and auditable opening balance' })
  async create(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.suppliersService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('suppliers.view')
  @ApiOperation({ summary: 'Get paginated list of suppliers with computed payable balance' })
  async findAll(@Query() pagination: PaginationDto) {
    return this.suppliersService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions('suppliers.view')
  @ApiOperation({ summary: 'Get supplier details, contact info, total debits/credits and payable balance' })
  async findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Get(':id/ledger')
  @RequirePermissions('suppliers.view')
  @ApiOperation({ summary: 'Get immutable supplier transaction ledger with running balance history' })
  async getLedger(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.suppliersService.getLedger(id, pagination);
  }

  @Post(':id/adjustments')
  @RequirePermissions('suppliers.manage')
  @ApiOperation({ summary: 'Record manual auditable ledger adjustment for supplier payable balance' })
  async addAdjustment(
    @Param('id') id: string,
    @Body() dto: AddSupplierAdjustmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.suppliersService.addAdjustment(id, dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('suppliers.manage')
  @ApiOperation({ summary: 'Update supplier details, contact person, or tax numbers' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.suppliersService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('suppliers.manage')
  @ApiOperation({ summary: 'Archive / soft delete supplier profile' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.suppliersService.remove(id, actor.id);
  }
}
