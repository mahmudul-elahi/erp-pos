import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import {
  CreateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeDto,
} from './dto/attribute.dto.js';

@Injectable()
export class AttributesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateAttributeDto, actorId?: string) {
    const existing = await this.prisma.attribute.findUnique({
      where: { name: dto.name.trim() },
    });

    if (existing) {
      throw new BadRequestException(`Attribute "${dto.name}" already exists`);
    }

    const attribute = await this.prisma.attribute.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'attributes.create',
      entityType: 'Attribute',
      entityId: attribute.id,
      newValues: { name: attribute.name },
    });

    return attribute;
  }

  async findAll() {
    return this.prisma.attribute.findMany({
      orderBy: { name: 'asc' },
      include: {
        values: {
          orderBy: { value: 'asc' },
        },
      },
    });
  }

  async findOne(id: string) {
    const attr = await this.prisma.attribute.findUnique({
      where: { id },
      include: {
        values: { orderBy: { value: 'asc' } },
      },
    });

    if (!attr) {
      throw new NotFoundException('Attribute not found');
    }

    return attr;
  }

  async update(id: string, dto: UpdateAttributeDto, actorId?: string) {
    const attr = await this.prisma.attribute.findUnique({ where: { id } });
    if (!attr) {
      throw new NotFoundException('Attribute not found');
    }

    const updated = await this.prisma.attribute.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'attributes.update',
      entityType: 'Attribute',
      entityId: id,
      newValues: { name: updated.name },
    });

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const attr = await this.prisma.attribute.findUnique({
      where: { id },
      include: {
        values: {
          include: {
            _count: { select: { variantValues: true } },
          },
        },
      },
    });

    if (!attr) {
      throw new NotFoundException('Attribute not found');
    }

    const inUse = attr.values.some((v) => v._count.variantValues > 0);
    if (inUse) {
      throw new BadRequestException('Cannot delete attribute because its values are in use by product variants');
    }

    await this.prisma.attribute.delete({ where: { id } });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'attributes.delete',
      entityType: 'Attribute',
      entityId: id,
    });

    return { message: 'Attribute deleted successfully' };
  }

  async addValue(attributeId: string, dto: CreateAttributeValueDto, actorId?: string) {
    const attr = await this.prisma.attribute.findUnique({ where: { id: attributeId } });
    if (!attr) {
      throw new NotFoundException('Attribute not found');
    }

    const value = dto.value.trim();
    const existing = await this.prisma.attributeValue.findUnique({
      where: {
        attributeId_value: {
          attributeId,
          value,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(`Value "${value}" already exists for attribute "${attr.name}"`);
    }

    const created = await this.prisma.attributeValue.create({
      data: {
        attributeId,
        value,
        code: dto.code?.trim(),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'attributes.add_value',
      entityType: 'AttributeValue',
      entityId: created.id,
      newValues: { attribute: attr.name, value: created.value },
    });

    return created;
  }

  async removeValue(valueId: string, actorId?: string) {
    const val = await this.prisma.attributeValue.findUnique({
      where: { id: valueId },
      include: {
        _count: { select: { variantValues: true } },
      },
    });

    if (!val) {
      throw new NotFoundException('Attribute value not found');
    }

    if (val._count.variantValues > 0) {
      throw new BadRequestException('Cannot delete attribute value that is assigned to existing product variants');
    }

    await this.prisma.attributeValue.delete({ where: { id: valueId } });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'attributes.remove_value',
      entityType: 'AttributeValue',
      entityId: valueId,
    });

    return { message: 'Attribute value removed successfully' };
  }
}
