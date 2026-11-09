import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CouriersService } from './couriers.service.js';
import { CreateShipmentDto } from './dto/create-shipment.dto.js';
import { QueryShipmentsDto } from './dto/query-shipments.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CourierProvider } from '@prisma/client';

@ApiTags('Couriers')
@Controller('couriers')
export class CouriersController {
  constructor(private readonly couriersService: CouriersService) {}

  @Post('shipments')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('couriers.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Dispatch order via courier adapter (Steadfast, Pathao, REDX, Manual)' })
  @ApiResponse({ status: 201, description: 'Shipment created and dispatched' })
  async createShipment(
    @Body() dto: CreateShipmentDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.couriersService.createShipment(dto, userId);
  }

  @Get('shipments')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('couriers.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List courier shipments with status and tracking filtering' })
  @ApiResponse({ status: 200, description: 'Paginated shipments list' })
  async findAll(@Query() query: QueryShipmentsDto) {
    return await this.couriersService.findAll(query);
  }

  @Get('shipments/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('couriers.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get shipment details and status history' })
  @ApiResponse({ status: 200, description: 'Shipment found' })
  async findById(@Param('id') id: string) {
    return await this.couriersService.findById(id);
  }

  @Get('shipments/:id/track')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('couriers.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Query live tracking status from courier service' })
  @ApiResponse({ status: 200, description: 'Live tracking details' })
  async trackShipment(@Param('id') id: string) {
    return await this.couriersService.trackShipment(id);
  }

  @Post('webhooks/:provider')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inbound delivery status webhook receiver from courier partners' })
  @ApiParam({ name: 'provider', enum: CourierProvider })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(
    @Param('provider') provider: CourierProvider,
    @Body() payload: Record<string, unknown>,
  ) {
    return await this.couriersService.handleWebhook(provider, payload);
  }
}
