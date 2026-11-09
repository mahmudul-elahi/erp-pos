import { randomBytes } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { OrdersService } from '../orders/orders.service.js';
import type { CreateLeadDto } from './dto/create-lead.dto.js';
import type { UpdateLeadDto } from './dto/update-lead.dto.js';
import type { LogCallDto } from './dto/log-call.dto.js';
import type { QueryLeadsDto } from './dto/query-leads.dto.js';
import type { ConvertLeadToOrderDto } from './dto/convert-lead-to-order.dto.js';
import { buildPaginationMeta, type PaginatedResult } from '../../common/pagination/pagination.dto.js';
import { LeadDisposition, LeadSource, OrderSource, Prisma } from '@prisma/client';

@Injectable()
export class TelesalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly ordersService: OrdersService,
  ) {}

  async createLead(dto: CreateLeadDto, actorId?: string) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const uid = randomBytes(3).toString('hex').toUpperCase();
    const leadNumber = `LEAD-${dateStr}-${uid}`;

    const lead = await this.prisma.telesalesLead.create({
      data: {
        leadNumber,
        customerName: dto.customerName.trim(),
        phone: dto.phone.trim(),
        alternatePhone: dto.alternatePhone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        source: dto.source || LeadSource.WEBSITE,
        disposition: LeadDisposition.NEW,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        notes: dto.notes?.trim() || null,
        callbackAt: dto.callbackAt ? new Date(dto.callbackAt) : null,
        assignedAgentId: dto.assignedAgentId || null,
        createdById: actorId,
      },
      include: {
        assignedAgent: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'telesales.lead_create',
      entityType: 'TelesalesLead',
      entityId: lead.id,
      newValues: {
        leadNumber: lead.leadNumber,
        customerName: lead.customerName,
        phone: lead.phone,
        source: lead.source,
      },
    });

    return lead;
  }

  async findAll(query: QueryLeadsDto): Promise<PaginatedResult<any>> {
    const where: Prisma.TelesalesLeadWhereInput = {};

    if (query.disposition) {
      where.disposition = query.disposition;
    }
    if (query.source) {
      where.source = query.source;
    }
    if (query.assignedAgentId) {
      where.assignedAgentId = query.assignedAgentId;
    }
    if (query.phone) {
      where.phone = { contains: query.phone.trim() };
    }
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { customerName: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
        { leadNumber: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.telesalesLead.count({ where }),
      this.prisma.telesalesLead.findMany({
        where,
        include: {
          assignedAgent: { select: { id: true, name: true, email: true } },
          _count: { select: { callLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  }

  async findById(id: string) {
    const lead = await this.prisma.telesalesLead.findUnique({
      where: { id },
      include: {
        assignedAgent: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        convertedOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            paymentStatus: true,
          },
        },
        callLogs: {
          include: {
            agent: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException(`Telesales lead with ID "${id}" not found`);
    }

    return lead;
  }

  async updateLead(id: string, dto: UpdateLeadDto, actorId?: string) {
    const lead = await this.prisma.telesalesLead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException(`Telesales lead with ID "${id}" not found`);
    }

    const updated = await this.prisma.telesalesLead.update({
      where: { id },
      data: {
        customerName: dto.customerName?.trim(),
        phone: dto.phone?.trim(),
        alternatePhone: dto.alternatePhone !== undefined ? dto.alternatePhone?.trim() || null : undefined,
        email: dto.email !== undefined ? dto.email?.trim().toLowerCase() || null : undefined,
        source: dto.source,
        disposition: dto.disposition,
        address: dto.address !== undefined ? dto.address?.trim() || null : undefined,
        city: dto.city !== undefined ? dto.city?.trim() || null : undefined,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
        callbackAt: dto.callbackAt !== undefined ? (dto.callbackAt ? new Date(dto.callbackAt) : null) : undefined,
        assignedAgentId: dto.assignedAgentId !== undefined ? dto.assignedAgentId || null : undefined,
      },
      include: {
        assignedAgent: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'telesales.lead_update',
      entityType: 'TelesalesLead',
      entityId: id,
      newValues: { disposition: updated.disposition, assignedAgentId: updated.assignedAgentId },
    });

    return updated;
  }

  async logCall(leadId: string, dto: LogCallDto, actorId?: string) {
    const lead = await this.prisma.telesalesLead.findUnique({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException(`Telesales lead with ID "${leadId}" not found`);
    }

    if (!actorId) {
      throw new BadRequestException('Agent user context required to log calls');
    }

    const callbackDate = dto.callbackAt ? new Date(dto.callbackAt) : null;

    const [callLog, updatedLead] = await this.prisma.$transaction([
      this.prisma.telesalesCallLog.create({
        data: {
          leadId,
          agentId: actorId,
          disposition: dto.disposition,
          callDurationSeconds: dto.callDurationSeconds ?? 0,
          notes: dto.notes?.trim() || null,
          callbackAt: callbackDate,
        },
        include: {
          agent: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.telesalesLead.update({
        where: { id: leadId },
        data: {
          disposition: dto.disposition,
          callbackAt: callbackDate ?? lead.callbackAt,
        },
      }),
    ]);

    await this.auditLogsService.log({
      userId: actorId,
      action: 'telesales.call_log',
      entityType: 'TelesalesCallLog',
      entityId: callLog.id,
      newValues: { leadId, disposition: dto.disposition, duration: callLog.callDurationSeconds },
    });

    return { callLog, lead: updatedLead };
  }

  async convertToOrder(leadId: string, dto: ConvertLeadToOrderDto, actorId?: string) {
    const lead = await this.prisma.telesalesLead.findUnique({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException(`Telesales lead with ID "${leadId}" not found`);
    }

    if (lead.convertedOrderId) {
      throw new BadRequestException(`Lead has already been converted to Order "${lead.convertedOrderId}"`);
    }

    const shippingAddress = dto.shippingAddress?.trim() || lead.address || 'Address pending telesales follow-up';
    const shippingCity = dto.shippingCity?.trim() || lead.city || 'Dhaka';

    const order = await this.ordersService.createOrder(
      {
        warehouseId: dto.warehouseId,
        branchId: dto.branchId,
        customerName: lead.customerName,
        customerPhone: lead.phone,
        customerEmail: lead.email || undefined,
        shippingAddress,
        shippingCity,
        paymentMethod: dto.paymentMethod,
        source: OrderSource.TELESALES,
        shippingCost: dto.shippingCost ?? 0,
        discountAmount: dto.discountAmount ?? 0,
        notes: dto.notes || `Converted from Telesales Lead ${lead.leadNumber}`,
        items: dto.items,
      },
      actorId,
    );

    const updatedLead = await this.prisma.telesalesLead.update({
      where: { id: leadId },
      data: {
        disposition: LeadDisposition.CONFIRMED,
        convertedOrderId: order.id,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'telesales.lead_convert_order',
      entityType: 'TelesalesLead',
      entityId: leadId,
      newValues: { orderId: order.id, orderNumber: order.orderNumber },
    });

    return {
      lead: updatedLead,
      order,
    };
  }
}
