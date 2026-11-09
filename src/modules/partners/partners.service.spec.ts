import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PartnersService } from './partners.service.js';
import { PartnerLedgerType, PartnerStatus, PartnerType, Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('PartnersService', () => {
  let service: PartnersService;
  let prismaMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      partnerPriceTier: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
      partner: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      partnerLedgerEntry: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn((cb) => {
        if (typeof cb === 'function') {
          return cb(prismaMock);
        }
        return Promise.all(cb);
      }),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({}),
    };

    service = new PartnersService(prismaMock, auditLogsMock);
  });

  it('creates wholesale price tier', async () => {
    prismaMock.partnerPriceTier.findUnique.mockResolvedValue(null);
    const fakeTier = {
      id: 'tier-1',
      name: 'Tier 1 Wholesale',
      discountPercentage: new Prisma.Decimal(15),
    };
    prismaMock.partnerPriceTier.create.mockResolvedValue(fakeTier);

    const result = await service.createPriceTier({
      name: 'Tier 1 Wholesale',
      discountPercentage: 15,
    });

    expect(result).toEqual(fakeTier);
    expect(auditLogsMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'partner.tier_create' }),
    );
  });

  it('creates partner with unique partnerNumber', async () => {
    prismaMock.partner.findUnique.mockResolvedValue(null);
    const fakePartner = {
      id: 'partner-1',
      partnerNumber: 'PTR-20261110-123456',
      companyName: 'Gadget Galaxy',
      phone: '+8801700998877',
      type: PartnerType.DEALER,
    };
    prismaMock.partner.create.mockResolvedValue(fakePartner);

    const res = await service.createPartner({
      companyName: 'Gadget Galaxy',
      contactPerson: 'Arif Khan',
      phone: '+8801700998877',
      address: 'Dhaka',
      type: PartnerType.DEALER,
    });

    expect(res).toEqual(fakePartner);
    expect(auditLogsMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'partner.create' }),
    );
  });

  it('calculates wholesale pricing correctly based on tier discount', async () => {
    prismaMock.partner.findUnique.mockResolvedValue({
      id: 'partner-1',
      companyName: 'Gadget Galaxy',
      priceTier: {
        name: 'Tier 1 Wholesale',
        discountPercentage: new Prisma.Decimal(20),
      },
    });

    const calc = await service.calculateWholesalePrice('partner-1', 10000);
    expect(calc.discountPercentage).toBe(20);
    expect(calc.discountAmount).toBe(2000);
    expect(calc.finalPrice).toBe(8000);
  });

  it('records invoice in ledger and increases outstanding balance', async () => {
    prismaMock.partner.findUnique.mockResolvedValue({
      id: 'partner-1',
      companyName: 'Gadget Galaxy',
      status: PartnerStatus.APPROVED,
      creditLimit: new Prisma.Decimal(100000),
      outstandingBalance: new Prisma.Decimal(10000),
    });

    const fakeEntry = { id: 'entry-1', amount: new Prisma.Decimal(25000) };
    const fakeUpdated = { id: 'partner-1', outstandingBalance: new Prisma.Decimal(35000) };

    prismaMock.partnerLedgerEntry.create.mockResolvedValue(fakeEntry);
    prismaMock.partner.update.mockResolvedValue(fakeUpdated);

    const res = await service.recordLedgerTransaction('partner-1', {
      type: PartnerLedgerType.INVOICE,
      amount: 25000,
    });

    expect(res.entry).toEqual(fakeEntry);
    expect(res.partner.outstandingBalance.toString()).toBe('35000');
  });

  it('rejects invoice transaction if partner credit limit would be exceeded', async () => {
    prismaMock.partner.findUnique.mockResolvedValue({
      id: 'partner-1',
      companyName: 'Gadget Galaxy',
      status: PartnerStatus.APPROVED,
      creditLimit: new Prisma.Decimal(50000),
      outstandingBalance: new Prisma.Decimal(45000),
    });

    await expect(
      service.recordLedgerTransaction('partner-1', {
        type: PartnerLedgerType.INVOICE,
        amount: 10000, // Total would be 55,000 > 50,000
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('records partner payment and decreases outstanding balance', async () => {
    prismaMock.partner.findUnique.mockResolvedValue({
      id: 'partner-1',
      companyName: 'Gadget Galaxy',
      status: PartnerStatus.APPROVED,
      creditLimit: new Prisma.Decimal(50000),
      outstandingBalance: new Prisma.Decimal(30000),
    });

    const fakeEntry = { id: 'entry-2', amount: new Prisma.Decimal(15000) };
    const fakeUpdated = { id: 'partner-1', outstandingBalance: new Prisma.Decimal(15000) };

    prismaMock.partnerLedgerEntry.create.mockResolvedValue(fakeEntry);
    prismaMock.partner.update.mockResolvedValue(fakeUpdated);

    const res = await service.recordLedgerTransaction('partner-1', {
      type: PartnerLedgerType.PAYMENT,
      amount: 15000,
    });

    expect(res.entry).toEqual(fakeEntry);
    expect(res.partner.outstandingBalance.toString()).toBe('15000');
  });
});
