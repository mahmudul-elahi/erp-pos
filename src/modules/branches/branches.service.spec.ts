import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service.js';

describe('BranchesService', () => {
  let branchesService: BranchesService;
  let prismaMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      branch: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    branchesService = new BranchesService(prismaMock, auditLogsMock);
  });

  describe('create', () => {
    it('should throw BadRequestException if branch code exists', async () => {
      prismaMock.branch.findUnique.mockResolvedValue({ id: 'b-1', code: 'BRANCH-DHAKA' });

      await expect(
        branchesService.create({ name: 'Dhaka Branch', code: 'BRANCH-DHAKA' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create branch and unset old main branch if isMain is true', async () => {
      prismaMock.branch.findUnique.mockResolvedValue(null);
      prismaMock.branch.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.branch.create.mockResolvedValue({
        id: 'b-2',
        name: 'Chittagong Hub',
        code: 'BRANCH-CTG',
        isMain: true,
      });

      const res = await branchesService.create(
        { name: 'Chittagong Hub', code: 'BRANCH-CTG', isMain: true },
        'admin-1',
      );

      expect(prismaMock.branch.updateMany).toHaveBeenCalledWith({
        where: { isMain: true },
        data: { isMain: false },
      });
      expect(res.code).toBe('BRANCH-CTG');
      expect(auditLogsMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'branches.create', entityId: 'b-2' }),
      );
    });
  });

  describe('findOne', () => {
    it('should throw ForbiddenException if regular user does not have branch access', async () => {
      const regularUser: any = {
        isSuperAdmin: false,
        branchIds: ['branch-allowed'],
      };

      await expect(
        branchesService.findOne('branch-unauthorized', regularUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow Super Admin to access any branch', async () => {
      const superAdminUser: any = {
        isSuperAdmin: true,
        branchIds: [],
      };

      prismaMock.branch.findFirst.mockResolvedValue({
        id: 'branch-any',
        name: 'Any Branch',
        warehouses: [],
      });

      const branch = await branchesService.findOne('branch-any', superAdminUser);
      expect(branch.id).toBe('branch-any');
    });

    it('should throw NotFoundException if branch does not exist', async () => {
      const superAdminUser: any = { isSuperAdmin: true, branchIds: [] };
      prismaMock.branch.findFirst.mockResolvedValue(null);

      await expect(
        branchesService.findOne('non-existent', superAdminUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should not allow deleting the main branch', async () => {
      prismaMock.branch.findFirst.mockResolvedValue({
        id: 'b-main',
        name: 'Main Flagship',
        isMain: true,
      });

      await expect(branchesService.remove('b-main', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should soft delete regular branch', async () => {
      prismaMock.branch.findFirst.mockResolvedValue({
        id: 'b-regular',
        name: 'Sub Branch',
        isMain: false,
      });
      prismaMock.branch.update.mockResolvedValue({});

      const res = await branchesService.remove('b-regular', 'admin-1');
      expect(res.message).toContain('deleted successfully');
      expect(prismaMock.branch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b-regular' },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });
  });
});
