import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let authService: AuthService;
  let prismaMock: any;
  let jwtMock: any;
  let configMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    jwtMock = {
      signAsync: vi.fn().mockImplementation((payload, opts) => {
        if (opts.secret === 'refresh-secret') return Promise.resolve('mock-refresh-token');
        return Promise.resolve('mock-access-token');
      }),
      verify: vi.fn(),
    };

    configMock = {
      get: vi.fn().mockImplementation((key: string, defaultVal?: any) => {
        if (key === 'jwt.accessSecret') return 'access-secret';
        if (key === 'jwt.refreshSecret') return 'refresh-secret';
        if (key === 'jwt.accessExpiresIn') return '15m';
        if (key === 'jwt.refreshExpiresIn') return '30d';
        return defaultVal;
      }),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    authService = new AuthService(
      prismaMock,
      jwtMock,
      configMock,
      auditLogsMock,
    );
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'unknown@test.com', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const hash = await argon2.hash('CorrectPassword123!');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        passwordHash: hash,
        status: 'ACTIVE',
        deletedAt: null,
        roles: [],
        branches: [],
      });

      await expect(
        authService.login({ email: 'user@test.com', password: 'WrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user status is INACTIVE', async () => {
      const hash = await argon2.hash('Password123!');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        passwordHash: hash,
        status: 'INACTIVE',
        deletedAt: null,
      });

      await expect(
        authService.login({ email: 'user@test.com', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens and user profile on successful login', async () => {
      const hash = await argon2.hash('Password123!');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        name: 'Test User',
        passwordHash: hash,
        status: 'ACTIVE',
        isSuperAdmin: false,
        deletedAt: null,
        roles: [{ role: { name: 'cashier' } }],
        branches: [],
      });
      prismaMock.user.update.mockResolvedValue({});

      const result = await authService.login(
        { email: 'user@test.com', password: 'Password123!' },
        '127.0.0.1',
        'Mozilla',
      );

      expect(result.data.accessToken).toBe('mock-access-token');
      expect(result.data.refreshToken).toBe('mock-refresh-token');
      expect(result.data.user.email).toBe('user@test.com');
      expect(auditLogsMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login', userId: 'user-1' }),
      );
    });
  });

  describe('refreshToken', () => {
    it('should rotate tokens when refresh token is valid', async () => {
      const rawToken = 'valid-refresh-token';
      const hashedToken = await argon2.hash(rawToken);

      jwtMock.verify.mockReturnValue({ sub: 'user-1', email: 'user@test.com', isSuperAdmin: false });
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        status: 'ACTIVE',
        deletedAt: null,
        refreshTokenHash: hashedToken,
      });
      prismaMock.user.update.mockResolvedValue({});

      const result = await authService.refreshToken({ refreshToken: rawToken });

      expect(result.data.accessToken).toBe('mock-access-token');
      expect(result.data.refreshToken).toBe('mock-refresh-token');
      expect(prismaMock.user.update).toHaveBeenCalled();
    });

    it('should revoke sessions on refresh token reuse attempt', async () => {
      const storedHash = await argon2.hash('other-token');
      jwtMock.verify.mockReturnValue({ sub: 'user-1', email: 'user@test.com' });
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        status: 'ACTIVE',
        deletedAt: null,
        refreshTokenHash: storedHash,
      });
      prismaMock.user.update.mockResolvedValue({});

      await expect(
        authService.refreshToken({ refreshToken: 'stolen-token' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshTokenHash: null },
      });
    });
  });

  describe('changePassword', () => {
    it('should throw BadRequestException if current password does not match', async () => {
      const hash = await argon2.hash('OldPassword123!');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: hash,
      });

      await expect(
        authService.changePassword('user-1', {
          currentPassword: 'IncorrectOldPassword',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update password and invalidate refresh token on success', async () => {
      const hash = await argon2.hash('OldPassword123!');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: hash,
      });
      prismaMock.user.update.mockResolvedValue({});

      const res = await authService.changePassword('user-1', {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      });

      expect(res.message).toContain('Password changed successfully');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refreshTokenHash: null }),
        }),
      );
    });
  });
});
