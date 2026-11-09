import { Module } from '@nestjs/common';
import { PartnersService } from './partners.service.js';
import { PartnersController } from './partners.controller.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';

@Module({
  imports: [AuditLogsModule],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
