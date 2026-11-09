import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto.js';
import { PaginationDto, buildPaginationMeta } from '../../common/pagination/pagination.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateUserDto, actorId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email.toLowerCase().trim() },
          ...(dto.phone ? [{ phone: dto.phone.trim() }] : []),
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('User with this email or phone already exists');
    }

    const passwordHash = await argon2.hash(dto.password);

    // Resolve roles
    let roleRecords: { id: string }[] = [];
    if (dto.roleNames && dto.roleNames.length > 0) {
      roleRecords = await this.prisma.role.findMany({
        where: { name: { in: dto.roleNames } },
        select: { id: true },
      });
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        name: dto.name.trim(),
        phone: dto.phone?.trim(),
        passwordHash,
        status: dto.status || 'ACTIVE',
        roles: {
          create: roleRecords.map((r) => ({ roleId: r.id })),
        },
        branches: {
          create: (dto.branchIds || []).map((branchId) => ({
            branchId,
            isDefault: branchId === dto.defaultBranchId,
          })),
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        status: true,
        isSuperAdmin: true,
        createdAt: true,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'users.create',
      entityType: 'User',
      entityId: user.id,
      newValues: { email: user.email, name: user.name, roles: dto.roleNames },
    });

    return user;
  }

  async findAll(pagination: PaginationDto, branchId?: string) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (pagination.search) {
      where.OR = [
        { name: { contains: pagination.search, mode: 'insensitive' } },
        { email: { contains: pagination.search, mode: 'insensitive' } },
        { phone: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    if (branchId) {
      where.branches = {
        some: { branchId },
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: pagination.sortOrder || 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          status: true,
          isSuperAdmin: true,
          lastLoginAt: true,
          createdAt: true,
          roles: {
            select: { role: { select: { id: true, name: true } } },
          },
          branches: {
            select: {
              isDefault: true,
              branch: { select: { id: true, name: true, code: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: data.map((u) => ({
        ...u,
        roles: u.roles.map((r) => r.role.name),
        branches: u.branches.map((b) => ({ ...b.branch, isDefault: b.isDefault })),
      })),
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        status: true,
        isSuperAdmin: true,
        lastLoginAt: true,
        createdAt: true,
        roles: {
          select: { role: { select: { id: true, name: true } } },
        },
        branches: {
          select: {
            isDefault: true,
            branch: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      roles: user.roles.map((r) => r.role.name),
      branches: user.branches.map((b) => ({ ...b.branch, isDefault: b.isDefault })),
    };
  }

  async update(id: string, dto: UpdateUserDto, actorId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Role re-assignments if provided
    if (dto.roleNames) {
      const roles = await this.prisma.role.findMany({
        where: { name: { in: dto.roleNames } },
        select: { id: true },
      });

      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      await this.prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: id, roleId: r.id })),
      });
    }

    // Branch re-assignments if provided
    if (dto.branchIds) {
      await this.prisma.userBranch.deleteMany({ where: { userId: id } });
      await this.prisma.userBranch.createMany({
        data: dto.branchIds.map((bId) => ({
          userId: id,
          branchId: bId,
          isDefault: bId === dto.defaultBranchId,
        })),
      });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        status: true,
        isSuperAdmin: true,
        updatedAt: true,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'users.update',
      entityType: 'User',
      entityId: id,
      oldValues: { name: user.name, status: user.status },
      newValues: { name: updated.name, status: updated.status },
    });

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isSuperAdmin) {
      throw new BadRequestException('Super administrator cannot be deleted');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'INACTIVE',
        refreshTokenHash: null,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'users.delete',
      entityType: 'User',
      entityId: id,
    });

    return { message: 'User deleted successfully' };
  }
}
