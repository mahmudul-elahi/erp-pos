import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import configuration from './config/configuration.js';
import { validateConfig } from './config/validation.js';

import { PrismaModule } from './database/prisma.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { MinioModule } from './infrastructure/minio/minio.module.js';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';

import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { PermissionsModule } from './modules/permissions/permissions.module.js';
import { BranchesModule } from './modules/branches/branches.module.js';
import { WarehousesModule } from './modules/warehouses/warehouses.module.js';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { BrandsModule } from './modules/brands/brands.module.js';
import { AttributesModule } from './modules/attributes/attributes.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { PurchasesModule } from './modules/purchases/purchases.module.js';
import { SalesModule } from './modules/sales/sales.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { CouriersModule } from './modules/couriers/couriers.module.js';
import { CashAccountsModule } from './modules/cash-accounts/cash-accounts.module.js';
import { ExpensesModule } from './modules/expenses/expenses.module.js';
import { MarketingModule } from './modules/marketing/marketing.module.js';
import { GadgetsModule } from './modules/gadgets/gadgets.module.js';
import { TelesalesModule } from './modules/telesales/telesales.module.js';
import { PartnersModule } from './modules/partners/partners.module.js';
import { DirectorsModule } from './modules/directors/directors.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateConfig,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: (config.get<number>('throttle.ttl', 60)) * 1000,
          limit: config.get<number>('throttle.limit', 100),
        },
      ],
    }),
    PrismaModule,
    RedisModule,
    MinioModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    BranchesModule,
    WarehousesModule,
    AuditLogsModule,
    FilesModule,
    HealthModule,
    CategoriesModule,
    BrandsModule,
    AttributesModule,
    ProductsModule,
    CustomersModule,
    SuppliersModule,
    InventoryModule,
    PurchasesModule,
    SalesModule,
    OrdersModule,
    CouriersModule,
    CashAccountsModule,
    ExpensesModule,
    MarketingModule,
    GadgetsModule,
    TelesalesModule,
    PartnersModule,
    DirectorsModule,
    ReportsModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
