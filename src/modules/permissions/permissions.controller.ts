import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions('roles.view')
  @ApiOperation({ summary: 'List all available permissions grouped by functional module' })
  async findAll() {
    return this.permissionsService.findAll();
  }
}
