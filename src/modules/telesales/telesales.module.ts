import { Module } from '@nestjs/common';
import { TelesalesService } from './telesales.service.js';
import { TelesalesController } from './telesales.controller.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { OrdersModule } from '../orders/orders.module.js';

@Module({
  imports: [AuditLogsModule, OrdersModule],
  controllers: [TelesalesController],
  providers: [TelesalesService],
  exports: [TelesalesService],
})
export class TelesalesModule {}
