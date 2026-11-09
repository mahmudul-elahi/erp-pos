import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: any;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseEnvelope<T>> {
    return next.handle().pipe(
      map((res) => {
        // If already framed or null/undefined
        if (res && typeof res === 'object' && 'data' in res && 'meta' in res) {
          return {
            success: true,
            message: res.message || 'Operation successful',
            data: res.data,
            meta: res.meta,
          };
        }

        if (res && typeof res === 'object' && 'data' in res && 'message' in res) {
          return {
            success: true,
            message: res.message,
            data: res.data,
            meta: res.meta,
          };
        }

        return {
          success: true,
          message: (res && typeof res === 'object' && res.message) ? res.message : 'Operation successful',
          data: (res && typeof res === 'object' && 'message' in res && Object.keys(res).length === 1) ? null : res,
        };
      }),
    );
  }
}
