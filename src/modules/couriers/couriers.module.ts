import { Module } from '@nestjs/common';
import { CouriersController } from './couriers.controller.js';
import { CouriersService } from './couriers.service.js';
import { CourierAdapterFactory } from './courier-adapter.factory.js';
import { SteadfastAdapter } from './adapters/steadfast.adapter.js';
import { PathaoAdapter } from './adapters/pathao.adapter.js';
import { RedxAdapter } from './adapters/redx.adapter.js';
import { ManualCourierAdapter } from './adapters/manual.adapter.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { OrdersModule } from '../orders/orders.module.js';

@Module({
  imports: [PrismaModule, AuditLogsModule, OrdersModule],
  controllers: [CouriersController],
  providers: [
    CouriersService,
    CourierAdapterFactory,
    SteadfastAdapter,
    PathaoAdapter,
    RedxAdapter,
    ManualCourierAdapter,
  ],
  exports: [CouriersService],
})
export class CouriersModule {}
