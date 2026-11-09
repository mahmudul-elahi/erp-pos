import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GadgetsService } from './gadgets.service.js';
import { CreateBuybackDto } from './dto/create-buyback.dto.js';
import { UpdateBuybackDto } from './dto/update-buyback.dto.js';
import { CreateWarrantyClaimDto } from './dto/create-warranty-claim.dto.js';
import { UpdateWarrantyClaimDto } from './dto/update-warranty-claim.dto.js';
import { CreateGiftBundleDto } from './dto/create-gift-bundle.dto.js';
import { QueryBuybackDto, QueryWarrantyClaimDto } from './dto/query-gadget.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Gadget-Specific Workflows (Buyback, Warranty, Verification, Bundles)')
@Controller('gadgets')
export class GadgetsController {
  constructor(private readonly gadgetsService: GadgetsService) {}

  // ---------------------------------------------------------------------------
  // Buybacks / Used Devices
  // ---------------------------------------------------------------------------
  @Post('buybacks')
  @Public()
  @ApiOperation({ summary: 'Submit device buyback or trade-in appraisal request' })
  @ApiResponse({ status: 201, description: 'Buyback request created' })
  async createBuyback(
    @Body() dto: CreateBuybackDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.gadgetsService.createBuybackRequest(dto, userId);
  }

  @Get('buybacks')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('gadgets.buyback_view')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List buyback requests with condition and status filtering' })
  @ApiResponse({ status: 200, description: 'Paginated buyback requests' })
  async findAllBuybacks(@Query() query: QueryBuybackDto) {
    return await this.gadgetsService.findAllBuybacks(query);
  }

  @Get('buybacks/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('gadgets.buyback_view')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get buyback appraisal details' })
  @ApiResponse({ status: 200, description: 'Buyback request found' })
  async findBuybackById(@Param('id') id: string) {
    return await this.gadgetsService.findBuybackById(id);
  }

  @Patch('buybacks/:id/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('gadgets.buyback_manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update buyback status, condition, and store offered price' })
  @ApiResponse({ status: 200, description: 'Buyback status updated' })
  async updateBuybackStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBuybackDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.gadgetsService.updateBuybackStatus(id, dto, userId);
  }

  // ---------------------------------------------------------------------------
  // Warranty Claims
  // ---------------------------------------------------------------------------
  @Post('warranty-claims')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('gadgets.warranty_manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create device warranty or servicing ticket' })
  @ApiResponse({ status: 201, description: 'Warranty claim ticket created' })
  async createWarrantyClaim(
    @Body() dto: CreateWarrantyClaimDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.gadgetsService.createWarrantyClaim(dto, userId);
  }

  @Get('warranty-claims')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('gadgets.warranty_view')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List warranty claims with status and serial filtering' })
  @ApiResponse({ status: 200, description: 'Paginated warranty claims' })
  async findAllWarrantyClaims(@Query() query: QueryWarrantyClaimDto) {
    return await this.gadgetsService.findAllWarrantyClaims(query);
  }

  @Get('warranty-claims/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('gadgets.warranty_view')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get warranty claim details' })
  @ApiResponse({ status: 200, description: 'Warranty claim found' })
  async findWarrantyClaimById(@Param('id') id: string) {
    return await this.gadgetsService.findWarrantyClaimById(id);
  }

  @Patch('warranty-claims/:id/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('gadgets.warranty_manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update repair status, technician notes, and repair costs' })
  @ApiResponse({ status: 200, description: 'Warranty claim updated' })
  async updateWarrantyClaimStatus(
    @Param('id') id: string,
    @Body() dto: UpdateWarrantyClaimDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.gadgetsService.updateWarrantyClaimStatus(id, dto, userId);
  }

  // ---------------------------------------------------------------------------
  // Device Verification / IMEI Lookup (Public)
  // ---------------------------------------------------------------------------
  @Get('verification/:imeiOrSerial')
  @Public()
  @ApiOperation({ summary: 'Verify device authenticity and warranty status by IMEI/Serial' })
  @ApiResponse({ status: 200, description: 'Verification results' })
  async verifyDevice(@Param('imeiOrSerial') imeiOrSerial: string) {
    return await this.gadgetsService.verifyDevice(imeiOrSerial);
  }

  // ---------------------------------------------------------------------------
  // Gift Bundles
  // ---------------------------------------------------------------------------
  @Post('gift-bundles')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('gadgets.buyback_manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create gadget gift accessories bundle' })
  @ApiResponse({ status: 201, description: 'Gift bundle created' })
  async createGiftBundle(@Body() dto: CreateGiftBundleDto) {
    return await this.gadgetsService.createGiftBundle(dto);
  }

  @Get('gift-bundles')
  @Public()
  @ApiOperation({ summary: 'Get all active gadget gift bundles' })
  @ApiResponse({ status: 200, description: 'Gift bundles list' })
  async findAllGiftBundles() {
    return await this.gadgetsService.findAllGiftBundles();
  }
}
