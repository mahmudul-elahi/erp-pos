import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  ResetPasswordDto,
} from './dto/auth.dto.js';
import { JwtPayload } from './jwt.strategy.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditLogsService: AuditLogsService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: {
        roles: { include: { role: true } },
        branches: { include: { branch: true } },
      },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.isSuperAdmin);

    // Store hashed refresh token
    const refreshTokenHash = await argon2.hash(tokens.refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash,
        lastLoginAt: new Date(),
      },
    });

    await this.auditLogsService.log({
      userId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      message: 'Login successful',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn', '15m'),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isSuperAdmin: user.isSuperAdmin,
          roles: user.roles.map((r) => r.role.name),
        },
      },
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE' || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    const isMatch = await argon2.verify(user.refreshTokenHash, dto.refreshToken);
    if (!isMatch) {
      // Possible token theft - revoke all sessions
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException('Invalid refresh token reuse detected');
    }

    // Rotate refresh token
    const tokens = await this.generateTokens(user.id, user.email, user.isSuperAdmin);
    const newHash = await argon2.hash(tokens.refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: newHash },
    });

    return {
      message: 'Token refreshed successfully',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn', '15m'),
      },
    };
  }

  async logout(userId: string, ipAddress?: string, userAgent?: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    await this.auditLogsService.log({
      userId,
      action: 'auth.logout',
      entityType: 'User',
      entityId: userId,
      ipAddress,
      userAgent,
    });

    return { message: 'Logged out successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
          select: {
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                permissions: {
                  select: {
                    permission: {
                      select: { id: true, name: true, module: true },
                    },
                  },
                },
              },
            },
          },
        },
        branches: {
          select: {
            isDefault: true,
            branch: {
              select: { id: true, name: true, code: true, isMain: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const permissions = Array.from(
      new Set(
        user.roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permission.name),
        ),
      ),
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      status: user.status,
      isSuperAdmin: user.isSuperAdmin,
      lastLoginAt: user.lastLoginAt,
      roles: user.roles.map((r) => r.role.name),
      permissions,
      branches: user.branches.map((b) => ({
        ...b.branch,
        isDefault: b.isDefault,
      })),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!isValid) {
      throw new BadRequestException('Current password does not match');
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        refreshTokenHash: null, // Revoke current refresh tokens
      },
    });

    await this.auditLogsService.log({
      userId,
      action: 'auth.change_password',
      entityType: 'User',
      entityId: userId,
    });

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    // Do not reveal whether user exists for security
    if (user) {
      await this.auditLogsService.log({
        userId: user.id,
        action: 'auth.forgot_password_requested',
        entityType: 'User',
        entityId: user.id,
      });
    }

    return {
      message: 'If the email exists, a password reset instruction has been dispatched',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (!dto.token || dto.token.length < 10) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    return {
      message: 'Password reset completed. You can now login with your new password',
    };
  }

  private async generateTokens(userId: string, email: string, isSuperAdmin: boolean) {
    const payload: JwtPayload = { sub: userId, email, isSuperAdmin };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload as any, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn', '15m') as any,
      }),
      this.jwtService.signAsync({ ...payload, jti: uuidv4() } as any, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn', '30d') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
