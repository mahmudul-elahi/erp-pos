import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { PaginationDto, buildPaginationMeta } from '../../common/pagination/pagination.dto.js';
import { Prisma } from '@prisma/client';

export interface CreateAuditLogDto {
  userId?: string | null;
  branchId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async log(dto: CreateAuditLogDto) {
    return this.prisma.auditLog.create({
      data: {
        userId: dto.userId ?? null,
        branchId: dto.branchId ?? null,
        action: dto.action,
        entityType: dto.entityType,
        entityId: dto.entityId ?? null,
        oldValues: dto.oldValues ? (dto.oldValues as Prisma.InputJsonValue) : Prisma.JsonNull,
        newValues: dto.newValues ? (dto.newValues as Prisma.InputJsonValue) : Prisma.JsonNull,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
      },
    });
  }

  async findAll(pagination: PaginationDto) {
    const where: Prisma.AuditLogWhereInput = {};

    if (pagination.search) {
      where.OR = [
        { action: { contains: pagination.search, mode: 'insensitive' } },
        { entityType: { contains: pagination.search, mode: 'insensitive' } },
        { entityId: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: pagination.sortOrder || 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          branch: {
            select: { id: true, name: true, code: true },
          },
        },
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }
}
