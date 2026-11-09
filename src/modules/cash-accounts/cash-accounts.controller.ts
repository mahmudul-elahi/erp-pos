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
} from '@nestjs/swagger';
import { CashAccountsService } from './cash-accounts.service.js';
import { CreateCashAccountDto } from './dto/create-cash-account.dto.js';
import { DepositWithdrawDto } from './dto/deposit-withdraw.dto.js';
import { TransferCashDto } from './dto/transfer-cash.dto.js';
import { QueryCashAccountDto } from './dto/query-cash-account.dto.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Cash & Bank Accounts')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cash-accounts')
export class CashAccountsController {
  constructor(private readonly cashAccountsService: CashAccountsService) {}

  @Post()
  @RequirePermissions('cash_accounts.manage')
  @ApiOperation({ summary: 'Create a new cash/bank/MFS treasury account' })
  @ApiResponse({ status: 201, description: 'Account created' })
  async create(
    @Body() dto: CreateCashAccountDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.cashAccountsService.create(dto, userId);
  }

  @Get()
  @RequirePermissions('cash_accounts.view')
  @ApiOperation({ summary: 'List cash accounts with balances and branch filtering' })
  @ApiResponse({ status: 200, description: 'Paginated accounts list' })
  async findAll(@Query() query: QueryCashAccountDto) {
    return await this.cashAccountsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('cash_accounts.view')
  @ApiOperation({ summary: 'Get cash account details with balance and recent ledger movements' })
  @ApiResponse({ status: 200, description: 'Cash account found' })
  async findById(@Param('id') id: string) {
    return await this.cashAccountsService.findById(id);
  }

  @Post(':id/deposit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cash_accounts.manage')
  @ApiOperation({ summary: 'Deposit funds into cash/bank account' })
  @ApiResponse({ status: 200, description: 'Funds deposited' })
  async deposit(
    @Param('id') id: string,
    @Body() dto: DepositWithdrawDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.cashAccountsService.deposit(id, dto, userId);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cash_accounts.manage')
  @ApiOperation({ summary: 'Withdraw funds from cash/bank account with balance check' })
  @ApiResponse({ status: 200, description: 'Funds withdrawn' })
  async withdraw(
    @Param('id') id: string,
    @Body() dto: DepositWithdrawDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.cashAccountsService.withdraw(id, dto, userId);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cash_accounts.manage')
  @ApiOperation({ summary: 'Atomic inter-account fund transfer (e.g. Cash to Bank or Bank to bKash)' })
  @ApiResponse({ status: 200, description: 'Transfer executed with immutable double-entry records' })
  async transfer(
    @Body() dto: TransferCashDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.cashAccountsService.transfer(dto, userId);
  }

  @Get(':id/transactions')
  @RequirePermissions('cash_accounts.view')
  @ApiOperation({ summary: 'View immutable transaction ledger history for account' })
  @ApiResponse({ status: 200, description: 'Paginated transactions list' })
  async getTransactions(
    @Param('id') id: string,
    @Query() query: PaginationDto,
  ) {
    return await this.cashAccountsService.getTransactions(id, query);
  }
}
