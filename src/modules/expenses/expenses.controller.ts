import {
  Controller,
  Get,
  Post,
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
import { ExpensesService } from './expenses.service.js';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { QueryExpenseDto } from './dto/query-expense.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Store Expenses & Categories')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post('categories')
  @RequirePermissions('expenses.manage')
  @ApiOperation({ summary: 'Create an expense category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  async createCategory(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.expensesService.createCategory(dto, userId);
  }

  @Get('categories')
  @RequirePermissions('expenses.view')
  @ApiOperation({ summary: 'List all active expense categories' })
  @ApiResponse({ status: 200, description: 'Categories list' })
  async findAllCategories() {
    return await this.expensesService.findAllCategories();
  }

  @Get('categories/:id')
  @RequirePermissions('expenses.view')
  @ApiOperation({ summary: 'Get category details' })
  @ApiResponse({ status: 200, description: 'Category found' })
  async findCategoryById(@Param('id') id: string) {
    return await this.expensesService.findCategoryById(id);
  }

  @Post()
  @RequirePermissions('expenses.manage')
  @ApiOperation({ summary: 'Record store expense and deduct from cash/bank account' })
  @ApiResponse({ status: 201, description: 'Expense recorded' })
  async create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.expensesService.create(dto, userId);
  }

  @Get()
  @RequirePermissions('expenses.view')
  @ApiOperation({ summary: 'List store expenses with filters by date, account, category' })
  @ApiResponse({ status: 200, description: 'Paginated expenses list' })
  async findAll(@Query() query: QueryExpenseDto) {
    return await this.expensesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('expenses.view')
  @ApiOperation({ summary: 'Get expense voucher details and receipt attachment' })
  @ApiResponse({ status: 200, description: 'Expense found' })
  async findById(@Param('id') id: string) {
    return await this.expensesService.findById(id);
  }
}
