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
  ParseFloatPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PartnersService } from './partners.service.js';
import { CreatePriceTierDto } from './dto/create-price-tier.dto.js';
import { CreatePartnerDto } from './dto/create-partner.dto.js';
import { UpdatePartnerDto } from './dto/update-partner.dto.js';
import { RecordPartnerTransactionDto } from './dto/partner-transaction.dto.js';
import { QueryPartnersDto } from './dto/query-partners.dto.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Partner Network (Dealers, Retailers, B2B, Franchises)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Post('price-tiers')
  @RequirePermissions('partners.manage')
  @ApiOperation({ summary: 'Create a wholesale price discount tier' })
  @ApiResponse({ status: 201, description: 'Price tier created successfully' })
  createPriceTier(@Body() dto: CreatePriceTierDto, @CurrentUser('id') userId?: string) {
    return this.partnersService.createPriceTier(dto, userId);
  }

  @Get('price-tiers')
  @RequirePermissions('partners.view')
  @ApiOperation({ summary: 'List all partner price tiers' })
  getPriceTiers() {
    return this.partnersService.getPriceTiers();
  }

  @Post()
  @RequirePermissions('partners.manage')
  @ApiOperation({ summary: 'Onboard a new partner (Dealer, Retailer, B2B, Franchise)' })
  @ApiResponse({ status: 201, description: 'Partner onboarded successfully' })
  createPartner(@Body() dto: CreatePartnerDto, @CurrentUser('id') userId?: string) {
    return this.partnersService.createPartner(dto, userId);
  }

  @Get()
  @RequirePermissions('partners.view')
  @ApiOperation({ summary: 'List all partners with pagination and search' })
  findAll(@Query() query: QueryPartnersDto) {
    return this.partnersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('partners.view')
  @ApiOperation({ summary: 'Get details of a single partner' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnersService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions('partners.manage')
  @ApiOperation({ summary: 'Update partner profile, status, credit limit, or price tier' })
  updatePartner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.partnersService.updatePartner(id, dto, userId);
  }

  @Get(':id/wholesale-price')
  @RequirePermissions('partners.view')
  @ApiOperation({ summary: 'Calculate wholesale price for a product based on partner price tier' })
  @ApiQuery({ name: 'basePrice', type: Number, description: 'Product retail selling price' })
  calculateWholesalePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('basePrice', ParseFloatPipe) basePrice: number,
  ) {
    return this.partnersService.calculateWholesalePrice(id, basePrice);
  }

  @Post(':id/ledger')
  @RequirePermissions('partners.ledger_manage')
  @ApiOperation({ summary: 'Record partner credit invoice, payment, commission credit, or adjustment' })
  recordLedgerTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPartnerTransactionDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.partnersService.recordLedgerTransaction(id, dto, userId);
  }

  @Get(':id/ledger')
  @RequirePermissions('partners.view')
  @ApiOperation({ summary: 'Get paginated audit ledger for partner transactions and outstanding balance' })
  getLedger(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationDto) {
    return this.partnersService.getLedger(id, query);
  }
}
