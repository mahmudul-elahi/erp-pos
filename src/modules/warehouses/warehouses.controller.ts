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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service.js';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Warehouses')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(private warehousesService: WarehousesService) {}

  @Post()
  @RequirePermissions('warehouses.manage')
  @ApiOperation({ summary: 'Create new warehouse' })
  async create(
    @Body() dto: CreateWarehouseDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehousesService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('warehouses.view')
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOperation({ summary: 'Get paginated warehouses' })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('branchId') branchId?: string,
  ) {
    return this.warehousesService.findAll(pagination, branchId);
  }

  @Get(':id')
  @RequirePermissions('warehouses.view')
  @ApiOperation({ summary: 'Get warehouse details' })
  async findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('warehouses.manage')
  @ApiOperation({ summary: 'Update warehouse details' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehousesService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('warehouses.manage')
  @ApiOperation({ summary: 'Soft delete warehouse' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehousesService.remove(id, actor.id);
  }
}
