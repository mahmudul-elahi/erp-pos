import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BranchesService } from './branches.service.js';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto.js';
import { PaginationDto } from '../../common/pagination/pagination.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Branches')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('branches')
export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  @Post()
  @RequirePermissions('branches.manage')
  @ApiOperation({ summary: 'Create new branch' })
  async create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.branchesService.create(dto, actor.id);
  }

  @Get()
  @RequirePermissions('branches.view')
  @ApiOperation({ summary: 'Get paginated list of accessible branches' })
  async findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.branchesService.findAll(pagination, user);
  }

  @Get(':id')
  @RequirePermissions('branches.view')
  @ApiOperation({ summary: 'Get branch details with warehouses' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.branchesService.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermissions('branches.manage')
  @ApiOperation({ summary: 'Update branch information' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.branchesService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('branches.manage')
  @ApiOperation({ summary: 'Soft delete branch' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.branchesService.remove(id, actor.id);
  }
}
