import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller.js';
import { MarketingService } from './marketing.service.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [MarketingController],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
