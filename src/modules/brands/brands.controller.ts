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
import { BrandsService } from './brands.service.js';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Brands')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('brands')
export class BrandsController {
  constructor(private brandsService: BrandsService) {}

  @Post()
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Create new brand' })
  async create(
    @Body() dto: CreateBrandDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.brandsService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get paginated list of brands' })
  async findAll(@Query() pagination: PaginationDto) {
    return this.brandsService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get brand details' })
  async findOne(@Param('id') id: string) {
    return this.brandsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Update brand details' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.brandsService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Soft delete brand' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.brandsService.remove(id, actor.id);
  }
}
