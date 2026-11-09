import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FilesService } from './files.service.js';
import { CompleteUploadDto, PresignUploadDto } from './dto/file.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Files & Object Storage')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('presign')
  @RequirePermissions('files.manage')
  @ApiOperation({ summary: 'Obtain presigned upload URL for direct upload to MinIO' })
  async presign(
    @Body() dto: PresignUploadDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.filesService.generatePresignedUpload(dto, actor.id);
  }

  @Post('complete')
  @RequirePermissions('files.manage')
  @ApiOperation({ summary: 'Confirm completed upload and persist file metadata' })
  async complete(
    @Body() dto: CompleteUploadDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.filesService.completeUpload(dto, actor.id);
  }

  @Get(':id/download-url')
  @RequirePermissions('files.view')
  @ApiOperation({ summary: 'Generate presigned short-lived download URL' })
  async downloadUrl(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.filesService.getPresignedDownloadUrl(id, user);
  }

  @Delete(':id')
  @RequirePermissions('files.manage')
  @ApiOperation({ summary: 'Soft delete file record' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.filesService.remove(id, actor.id);
  }
}
