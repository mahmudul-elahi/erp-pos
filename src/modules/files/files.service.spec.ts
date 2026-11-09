import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FilesService } from './files.service.js';

describe('FilesService', () => {
  let filesService: FilesService;
  let prismaMock: any;
  let minioMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      fileRecord: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };

    minioMock = {
      getBucketName: vi.fn().mockReturnValue('pos-erp'),
      getPresignedUploadUrl: vi.fn().mockResolvedValue('https://minio.test/upload-url'),
      getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://minio.test/download-url'),
      objectExists: vi.fn(),
      getObjectMetadata: vi.fn(),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    filesService = new FilesService(prismaMock, minioMock, auditLogsMock);
  });

  describe('generatePresignedUpload', () => {
    it('should reject unpermitted MIME types', async () => {
      await expect(
        filesService.generatePresignedUpload(
          {
            fileName: 'malicious.exe',
            mimeType: 'application/x-msdownload',
            sizeBytes: 1024,
            module: 'products',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject dangerous file extensions', async () => {
      await expect(
        filesService.generatePresignedUpload(
          {
            fileName: 'script.sh',
            mimeType: 'text/plain',
            sizeBytes: 1024,
            module: 'products',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should generate valid presigned upload URL and unique objectKey for allowed types', async () => {
      const res = await filesService.generatePresignedUpload(
        {
          fileName: 'smartphone.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 204800,
          module: 'products',
          entityId: 'phone-123',
        },
        'user-1',
      );

      expect(res.uploadUrl).toBe('https://minio.test/upload-url');
      expect(res.objectKey).toMatch(/^products\/phone-123\/[a-f0-9-]+\.jpg$/);
      expect(res.bucket).toBe('pos-erp');
    });
  });

  describe('completeUpload', () => {
    it('should throw BadRequestException if object does not exist in storage', async () => {
      minioMock.objectExists.mockResolvedValue(false);

      await expect(
        filesService.completeUpload(
          {
            objectKey: 'products/phone-123/img.jpg',
            originalName: 'img.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 2048,
            module: 'products',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should persist file record if object exists in storage', async () => {
      minioMock.objectExists.mockResolvedValue(true);
      minioMock.getObjectMetadata.mockResolvedValue({ size: 2048 });
      prismaMock.fileRecord.create.mockResolvedValue({
        id: 'file-1',
        objectKey: 'products/phone-123/img.jpg',
        sizeBytes: 2048,
      });

      const res = await filesService.completeUpload(
        {
          objectKey: 'products/phone-123/img.jpg',
          originalName: 'img.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
          module: 'products',
        },
        'user-1',
      );

      expect(res.id).toBe('file-1');
      expect(prismaMock.fileRecord.create).toHaveBeenCalled();
      expect(auditLogsMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'files.upload_completed' }),
      );
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('should throw NotFoundException if file is not found', async () => {
      prismaMock.fileRecord.findFirst.mockResolvedValue(null);

      await expect(filesService.getPresignedDownloadUrl('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return presigned download url for existing file', async () => {
      prismaMock.fileRecord.findFirst.mockResolvedValue({
        id: 'file-1',
        objectKey: 'products/general/img.jpg',
        isPrivate: false,
      });

      const res = await filesService.getPresignedDownloadUrl('file-1');
      expect(res.downloadUrl).toBe('https://minio.test/download-url');
    });
  });
});
