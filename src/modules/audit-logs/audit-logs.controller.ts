import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private auditLogsService: AuditLogsService) {}

  @Get()
  @RequirePermissions('audit_logs.view')
  @ApiOperation({ summary: 'Get paginated audit trail logs' })
  async findAll(@Query() pagination: PaginationDto) {
    return this.auditLogsService.findAll(pagination);
  }
}
