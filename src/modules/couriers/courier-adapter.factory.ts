import { Injectable, BadRequestException } from '@nestjs/common';
import { CourierProvider } from '@prisma/client';
import type { CourierAdapter } from './interfaces/courier-adapter.interface.js';
import { SteadfastAdapter } from './adapters/steadfast.adapter.js';
import { PathaoAdapter } from './adapters/pathao.adapter.js';
import { RedxAdapter } from './adapters/redx.adapter.js';
import { ManualCourierAdapter } from './adapters/manual.adapter.js';

@Injectable()
export class CourierAdapterFactory {
  constructor(
    private readonly steadfastAdapter: SteadfastAdapter,
    private readonly pathaoAdapter: PathaoAdapter,
    private readonly redxAdapter: RedxAdapter,
    private readonly manualAdapter: ManualCourierAdapter,
  ) {}

  getAdapter(provider: CourierProvider): CourierAdapter {
    switch (provider) {
      case CourierProvider.STEADFAST:
        return this.steadfastAdapter;
      case CourierProvider.PATHAO:
        return this.pathaoAdapter;
      case CourierProvider.REDX:
        return this.redxAdapter;
      case CourierProvider.MANUAL:
        return this.manualAdapter;
      default:
        throw new BadRequestException(`Unsupported courier provider: ${provider as string}`);
    }
  }
}
