import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto.js';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateRoleDto, actorId?: string) {
    const existing = await this.prisma.role.findUnique({
      where: { name: dto.name.toLowerCase().trim() },
    });

    if (existing) {
      throw new BadRequestException('Role with this name already exists');
    }

    let permissionRecords: { id: string }[] = [];
    if (dto.permissionNames && dto.permissionNames.length > 0) {
      permissionRecords = await this.prisma.permission.findMany({
        where: { name: { in: dto.permissionNames } },
        select: { id: true },
      });
    }

    const role = await this.prisma.role.create({
      data: {
        name: dto.name.toLowerCase().trim(),
        description: dto.description?.trim(),
        permissions: {
          create: permissionRecords.map((p) => ({ permissionId: p.id })),
        },
      },
      include: {
        permissions: { include: { permission: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'roles.create',
      entityType: 'Role',
      entityId: role.id,
      newValues: { name: role.name, permissions: dto.permissionNames },
    });

    return {
      ...role,
      permissions: role.permissions.map((p) => p.permission.name),
    };
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((p) => p.permission.name),
      createdAt: r.createdAt,
    }));
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      userCount: role._count.users,
      permissions: role.permissions.map((p) => p.permission.name),
      createdAt: role.createdAt,
    };
  }

  async update(id: string, dto: UpdateRoleDto, actorId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (dto.permissionNames) {
      const perms = await this.prisma.permission.findMany({
        where: { name: { in: dto.permissionNames } },
        select: { id: true },
      });

      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await this.prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
      });
    }

    const updateData: { description?: string | null } = {};
    if (dto.description !== undefined) {
      updateData.description = dto.description;
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: updateData,
      include: {
        permissions: { include: { permission: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'roles.update',
      entityType: 'Role',
      entityId: id,
      newValues: { permissions: dto.permissionNames },
    });

    return {
      ...updated,
      permissions: updated.permissions.map((p) => p.permission.name),
    };
  }

  async remove(id: string, actorId?: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    if (role._count.users > 0) {
      throw new BadRequestException('Cannot delete role that is currently assigned to users');
    }

    await this.prisma.role.delete({ where: { id } });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'roles.delete',
      entityType: 'Role',
      entityId: id,
    });

    return { message: 'Role deleted successfully' };
  }
}
