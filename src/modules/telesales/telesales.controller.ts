import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TelesalesService } from './telesales.service.js';
import { CreateLeadDto } from './dto/create-lead.dto.js';
import { UpdateLeadDto } from './dto/update-lead.dto.js';
import { LogCallDto } from './dto/log-call.dto.js';
import { QueryLeadsDto } from './dto/query-leads.dto.js';
import { ConvertLeadToOrderDto } from './dto/convert-lead-to-order.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Telesales & Order Confirmation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('telesales')
export class TelesalesController {
  constructor(private readonly telesalesService: TelesalesService) {}

  @Post('leads')
  @RequirePermissions('telesales.lead_manage')
  @ApiOperation({ summary: 'Create a new telesales customer inquiry lead' })
  @ApiResponse({ status: 201, description: 'Lead successfully created' })
  createLead(@Body() dto: CreateLeadDto, @CurrentUser('id') userId?: string) {
    return this.telesalesService.createLead(dto, userId);
  }

  @Get('leads')
  @RequirePermissions('telesales.lead_view')
  @ApiOperation({ summary: 'List all telesales leads with pagination, search, and disposition filters' })
  findAll(@Query() query: QueryLeadsDto) {
    return this.telesalesService.findAll(query);
  }

  @Get('leads/:id')
  @RequirePermissions('telesales.lead_view')
  @ApiOperation({ summary: 'Get details of a telesales lead including interaction logs and converted order' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.telesalesService.findById(id);
  }

  @Patch('leads/:id')
  @RequirePermissions('telesales.lead_manage')
  @ApiOperation({ summary: 'Update lead details, assignment, or disposition' })
  updateLead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.telesalesService.updateLead(id, dto, userId);
  }

  @Post('leads/:id/calls')
  @RequirePermissions('telesales.call_log')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log a telesales outbound call outcome and schedule callbacks' })
  logCall(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LogCallDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.telesalesService.logCall(id, dto, userId);
  }

  @Post('leads/:id/convert-to-order')
  @RequirePermissions('telesales.lead_manage')
  @ApiOperation({ summary: 'Convert confirmed telesales lead directly into fulfillment order' })
  convertToOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertLeadToOrderDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.telesalesService.convertToOrder(id, dto, userId);
  }
}
