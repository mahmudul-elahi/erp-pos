import { Module } from '@nestjs/common';
import { DirectorsService } from './directors.service.js';
import { DirectorsController } from './directors.controller.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';

@Module({
  imports: [AuditLogsModule],
  controllers: [DirectorsController],
  providers: [DirectorsService],
  exports: [DirectorsService],
})
export class DirectorsModule {}
