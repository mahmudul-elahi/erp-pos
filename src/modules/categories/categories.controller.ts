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
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Categories')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post()
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Create new category / subcategory' })
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.categoriesService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get paginated list of categories' })
  async findAll(@Query() pagination: PaginationDto) {
    return this.categoriesService.findAll(pagination);
  }

  @Get('tree')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get full nested category tree structure' })
  async getTree() {
    return this.categoriesService.getTree();
  }

  @Get(':id')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get category details and immediate children' })
  async findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Update category details' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.categoriesService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Soft delete category' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.categoriesService.remove(id, actor.id);
  }
}
