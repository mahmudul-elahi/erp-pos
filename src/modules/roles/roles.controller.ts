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
import { RolesService } from './roles.service.js';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Post()
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Create custom role with permissions' })
  async create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rolesService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('roles.view')
  @ApiOperation({ summary: 'List all roles with attached permissions and user counts' })
  async findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('roles.view')
  @ApiOperation({ summary: 'Get role details' })
  async findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Update role description or permission list' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rolesService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Delete role (if unassigned)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rolesService.remove(id, actor.id);
  }
}
