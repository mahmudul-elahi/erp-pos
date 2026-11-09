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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DirectorsService } from './directors.service.js';
import { CreateDirectorDto } from './dto/create-director.dto.js';
import { UpdateDirectorDto } from './dto/update-director.dto.js';
import { ProcessDirectorTxDto } from './dto/director-transaction.dto.js';
import { QueryDirectorsDto } from './dto/query-directors.dto.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Director / Owner Treasury')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('directors')
export class DirectorsController {
  constructor(private readonly directorsService: DirectorsService) {}

  @Post()
  @RequirePermissions('directors.manage')
  @ApiOperation({ summary: 'Register a company director / shareholder' })
  @ApiResponse({ status: 201, description: 'Director registered successfully' })
  createDirector(@Body() dto: CreateDirectorDto, @CurrentUser('id') userId?: string) {
    return this.directorsService.createDirector(dto, userId);
  }

  @Get()
  @RequirePermissions('directors.view')
  @ApiOperation({ summary: 'List all company directors with pagination and search' })
  findAll(@Query() query: QueryDirectorsDto) {
    return this.directorsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('directors.view')
  @ApiOperation({ summary: 'Get details of a director and recent capital/drawing movements' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.directorsService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions('directors.manage')
  @ApiOperation({ summary: 'Update director contact details or shareholding percentage' })
  updateDirector(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDirectorDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.directorsService.updateDirector(id, dto, userId);
  }

  @Post(':id/transactions')
  @RequirePermissions('directors.transaction')
  @ApiOperation({ summary: 'Process director capital injection deposit or drawing withdrawal' })
  processTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProcessDirectorTxDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.directorsService.processTransaction(id, dto, userId);
  }

  @Get(':id/transactions')
  @RequirePermissions('directors.view')
  @ApiOperation({ summary: 'Get paginated audit ledger of director capital and drawing movements' })
  getTransactions(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationDto) {
    return this.directorsService.getTransactions(id, query);
  }
}
