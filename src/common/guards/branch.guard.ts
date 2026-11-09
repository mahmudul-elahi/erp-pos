import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../decorators/current-user.decorator.js';

export const CHECK_BRANCH_KEY = 'checkBranch';
export const CheckBranch = () => SetMetadata(CHECK_BRANCH_KEY, true);

@Injectable()
export class BranchGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const shouldCheck = this.reflector.getAllAndOverride<boolean>(
      CHECK_BRANCH_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!shouldCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new ForbiddenException('User authentication required');
    }

    if (user.isSuperAdmin) {
      return true;
    }

    const branchId =
      request.headers['x-branch-id'] ||
      request.params?.branchId ||
      request.query?.branchId ||
      request.body?.branchId;

    if (branchId && !user.branchIds.includes(branchId)) {
      throw new ForbiddenException('Access to the specified branch is not authorized for your user profile');
    }

    return true;
  }
}
