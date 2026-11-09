import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto.js';
import { PaginationDto, buildPaginationMeta } from '../../common/pagination/pagination.dto.js';

@Injectable()
export class WarehousesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateWarehouseDto, actorId?: string) {
    const code = dto.code.toUpperCase().trim();
    const existing = await this.prisma.warehouse.findUnique({ where: { code } });

    if (existing) {
      throw new BadRequestException(`Warehouse with code "${code}" already exists`);
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }

    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const warehouse = await this.prisma.warehouse.create({
      data: {
        name: dto.name.trim(),
        code,
        branchId: dto.branchId || null,
        location: dto.location?.trim(),
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: dto.branchId,
      action: 'warehouses.create',
      entityType: 'Warehouse',
      entityId: warehouse.id,
      newValues: { name: warehouse.name, code: warehouse.code },
    });

    return warehouse;
  }

  async findAll(pagination: PaginationDto, branchId?: string) {
    const where: Prisma.WarehouseWhereInput = {
      deletedAt: null,
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (pagination.search) {
      where.OR = [
        { name: { contains: pagination.search, mode: 'insensitive' } },
        { code: { contains: pagination.search, mode: 'insensitive' } },
        { location: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.warehouse.count({ where }),
      this.prisma.warehouse.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: pagination.sortOrder || 'desc' },
        include: {
          branch: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto, actorId?: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, deletedAt: null },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }

    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId || null } : {}),
        ...(dto.location !== undefined ? { location: dto.location?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: updated.branchId,
      action: 'warehouses.update',
      entityType: 'Warehouse',
      entityId: id,
      newValues: { name: updated.name, isDefault: updated.isDefault },
    });

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, deletedAt: null },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    if (warehouse.isDefault) {
      throw new BadRequestException('Cannot delete default warehouse');
    }

    await this.prisma.warehouse.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditLogsService.log({
      userId: actorId,
      branchId: warehouse.branchId,
      action: 'warehouses.delete',
      entityType: 'Warehouse',
      entityId: id,
    });

    return { message: 'Warehouse deleted successfully' };
  }
}
