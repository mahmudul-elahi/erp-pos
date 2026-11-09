import { Module } from '@nestjs/common';
import { CashAccountsController } from './cash-accounts.controller.js';
import { CashAccountsService } from './cash-accounts.service.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [CashAccountsController],
  providers: [CashAccountsService],
  exports: [CashAccountsService],
})
export class CashAccountsModule {}
