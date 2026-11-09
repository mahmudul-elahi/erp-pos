import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesService } from './purchases.service.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';

@Module({
  imports: [InventoryModule, AuditLogsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
