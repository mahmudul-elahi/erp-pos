import { Module } from '@nestjs/common';
import { GadgetsController } from './gadgets.controller.js';
import { GadgetsService } from './gadgets.service.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [GadgetsController],
  providers: [GadgetsService],
  exports: [GadgetsService],
})
export class GadgetsModule {}
