import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AttributesService } from './attributes.service.js';
import {
  CreateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeDto,
} from './dto/attribute.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Attributes & Variants Setup')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('attributes')
export class AttributesController {
  constructor(private attributesService: AttributesService) {}

  @Post()
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Create new product attribute (e.g. Color, Storage, RAM)' })
  async create(
    @Body() dto: CreateAttributeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attributesService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'List all attributes with their values' })
  async findAll() {
    return this.attributesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get attribute details and values' })
  async findOne(@Param('id') id: string) {
    return this.attributesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Update attribute metadata' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAttributeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attributesService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Delete attribute (if unassigned)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attributesService.remove(id, actor.id);
  }

  @Post(':id/values')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Add discrete value to an attribute' })
  async addValue(
    @Param('id') id: string,
    @Body() dto: CreateAttributeValueDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attributesService.addValue(id, dto, actor.id);
  }

  @Delete('values/:valueId')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Delete attribute value (if unassigned)' })
  async removeValue(
    @Param('valueId') valueId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attributesService.removeValue(valueId, actor.id);
  }
}
