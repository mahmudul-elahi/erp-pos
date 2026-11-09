import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { PrismaService } from '../../database/prisma.service.js';
import { MinioService } from '../../infrastructure/minio/minio.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CompleteUploadDto, PresignUploadDto } from './dto/file.dto.js';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.php',
  '.py',
  '.js',
  '.ts',
  '.html',
  '.svg',
]);

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
    private auditLogsService: AuditLogsService,
  ) {}

  async generatePresignedUpload(dto: PresignUploadDto, _actorId?: string) {
    if (!ALLOWED_MIME_TYPES.has(dto.mimeType.toLowerCase())) {
      throw new BadRequestException(`MIME type "${dto.mimeType}" is not permitted`);
    }

    const ext = path.extname(dto.fileName).toLowerCase();
    if (!ext || DANGEROUS_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`File extension "${ext}" is not permitted`);
    }

    const fileUuid = uuidv4();
    const cleanModule = dto.module.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanEntityId = (dto.entityId || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
    const objectKey = `${cleanModule}/${cleanEntityId}/${fileUuid}${ext}`;

    const uploadUrl = await this.minioService.getPresignedUploadUrl(objectKey, 900);

    return {
      uploadUrl,
      objectKey,
      bucket: this.minioService.getBucketName(),
      expiresInSeconds: 900,
    };
  }

  async completeUpload(dto: CompleteUploadDto, actorId: string) {
    const exists = await this.minioService.objectExists(dto.objectKey);
    if (!exists) {
      throw new BadRequestException('Object was not found in storage. Upload may have failed or expired');
    }

    const stat = await this.minioService.getObjectMetadata(dto.objectKey);
    const ext = path.extname(dto.originalName).toLowerCase();

    const file = await this.prisma.fileRecord.create({
      data: {
        originalName: dto.originalName,
        objectKey: dto.objectKey,
        bucket: this.minioService.getBucketName(),
        mimeType: dto.mimeType,
        sizeBytes: stat.size,
        extension: ext,
        uploadedById: actorId,
        module: dto.module,
        entityType: dto.entityType || null,
        entityId: dto.entityId || null,
        isPrivate: dto.isPrivate ?? false,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'files.upload_completed',
      entityType: 'File',
      entityId: file.id,
      newValues: { objectKey: file.objectKey, sizeBytes: file.sizeBytes },
    });

    return file;
  }

  async getPresignedDownloadUrl(id: string, user?: AuthenticatedUser) {
    const file = await this.prisma.fileRecord.findFirst({
      where: { id, deletedAt: null },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.isPrivate && (!user || (!user.isSuperAdmin && file.uploadedById !== user.id))) {
      throw new ForbiddenException('Access to this private file is restricted');
    }

    const downloadUrl = await this.minioService.getPresignedDownloadUrl(file.objectKey, 3600);

    return {
      downloadUrl,
      expiresInSeconds: 3600,
      file,
    };
  }

  async remove(id: string, actorId: string) {
    const file = await this.prisma.fileRecord.findFirst({
      where: { id, deletedAt: null },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    await this.prisma.fileRecord.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'files.delete',
      entityType: 'File',
      entityId: id,
    });

    return { message: 'File deleted successfully' };
  }
}
