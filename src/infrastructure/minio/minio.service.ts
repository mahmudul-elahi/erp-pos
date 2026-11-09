import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client!: Minio.Client;
  private bucket!: string;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const endPoint = this.configService.get<string>('minio.endpoint', 'localhost');
    const port = this.configService.get<number>('minio.port', 9000);
    const useSSL = this.configService.get<boolean>('minio.useSSL', false);
    const accessKey = this.configService.get<string>('minio.accessKey', 'minioadmin');
    const secretKey = this.configService.get<string>('minio.secretKey', 'minioadmin_dev_password');
    this.bucket = this.configService.get<string>('minio.bucket', 'pos-erp');

    this.client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, this.configService.get<string>('minio.region', 'us-east-1'));
        this.logger.log(`Created private MinIO bucket: ${this.bucket}`);
      } else {
        this.logger.log(`MinIO bucket "${this.bucket}" ready`);
      }
    } catch (err: any) {
      this.logger.warn(`MinIO bucket initialization notice: ${err.message}`);
    }
  }

  getBucketName(): string {
    return this.bucket;
  }

  async uploadObject(
    objectKey: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<any> {
    return this.client.putObject(this.bucket, objectKey, buffer, buffer.length, {
      'Content-Type': mimeType,
    });
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }

  async getPresignedUploadUrl(objectKey: string, expirySeconds = 900): Promise<string> {
    return this.client.presignedPutObject(this.bucket, objectKey, expirySeconds);
  }

  async getPresignedDownloadUrl(objectKey: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectKey, expirySeconds);
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, objectKey);
      return true;
    } catch {
      return false;
    }
  }

  async getObjectMetadata(objectKey: string): Promise<Minio.BucketItemStat> {
    return this.client.statObject(this.bucket, objectKey);
  }
}
