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
import { ProductsService } from './products.service.js';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Products & Variants')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Create new product with variants, specifications, barcodes and images' })
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('products.view')
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'brandId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] })
  @ApiQuery({ name: 'type', required: false, enum: ['PHYSICAL', 'SERVICE', 'BUNDLE'] })
  @ApiOperation({ summary: 'Get paginated product catalog with filters' })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.productsService.findAll(pagination, {
      categoryId,
      brandId,
      status,
      type,
    });
  }

  @Get('by-barcode/:barcode')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Instant barcode lookup for POS scanning' })
  async findByBarcode(@Param('barcode') barcode: string) {
    return this.productsService.findByBarcode(barcode);
  }

  @Get(':id')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get full product details including variants, specifications, barcodes and images' })
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Update product details' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Archive / soft delete product' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.remove(id, actor.id);
  }
}
