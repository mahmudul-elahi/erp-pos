import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto.js';
import { PaginationDto, buildPaginationMeta } from '../../common/pagination/pagination.dto.js';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@Injectable()
export class BranchesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateBranchDto, actorId?: string) {
    const code = dto.code.toUpperCase().trim();
    const existing = await this.prisma.branch.findUnique({ where: { code } });

    if (existing) {
      throw new BadRequestException(`Branch with code "${code}" already exists`);
    }

    if (dto.isMain) {
      // Unset previous main branch if this is designated as main
      await this.prisma.branch.updateMany({
        where: { isMain: true },
        data: { isMain: false },
      });
    }

    const branch = await this.prisma.branch.create({
      data: {
        name: dto.name.trim(),
        code,
        address: dto.address?.trim(),
        phone: dto.phone?.trim(),
        email: dto.email?.trim(),
        isActive: dto.isActive ?? true,
        isMain: dto.isMain ?? false,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: branch.id,
      action: 'branches.create',
      entityType: 'Branch',
      entityId: branch.id,
      newValues: { name: branch.name, code: branch.code },
    });

    return branch;
  }

  async findAll(pagination: PaginationDto, user?: AuthenticatedUser) {
    const where: Prisma.BranchWhereInput = {
      deletedAt: null,
    };

    if (user && !user.isSuperAdmin) {
      where.id = { in: user.branchIds };
    }

    if (pagination.search) {
      where.OR = [
        { name: { contains: pagination.search, mode: 'insensitive' } },
        { code: { contains: pagination.search, mode: 'insensitive' } },
        { address: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.branch.count({ where }),
      this.prisma.branch.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: pagination.sortOrder || 'desc' },
        include: {
          _count: { select: { warehouses: true, userBranches: true } },
        },
      }),
    ]);

    return {
      data: data.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        address: b.address,
        phone: b.phone,
        email: b.email,
        isActive: b.isActive,
        isMain: b.isMain,
        warehousesCount: b._count.warehouses,
        usersCount: b._count.userBranches,
        createdAt: b.createdAt,
      })),
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async findOne(id: string, user?: AuthenticatedUser) {
    if (user && !user.isSuperAdmin && !user.branchIds.includes(id)) {
      throw new ForbiddenException('You do not have access to this branch');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      include: {
        warehouses: {
          where: { deletedAt: null },
          select: { id: true, name: true, code: true, isDefault: true, isActive: true },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  async update(id: string, dto: UpdateBranchDto, actorId?: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (dto.isMain) {
      await this.prisma.branch.updateMany({
        where: { isMain: true, id: { not: id } },
        data: { isMain: false },
      });
    }

    const updated = await this.prisma.branch.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isMain !== undefined ? { isMain: dto.isMain } : {}),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: id,
      action: 'branches.update',
      entityType: 'Branch',
      entityId: id,
      oldValues: { name: branch.name, isMain: branch.isMain, isActive: branch.isActive },
      newValues: { name: updated.name, isMain: updated.isMain, isActive: updated.isActive },
    });

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.isMain) {
      throw new BadRequestException('Cannot delete the main flagship branch');
    }

    await this.prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: id,
      action: 'branches.delete',
      entityType: 'Branch',
      entityId: id,
    });

    return { message: 'Branch deleted successfully' };
  }
}
