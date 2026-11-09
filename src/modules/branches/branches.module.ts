import { Module } from '@nestjs/common';
import { BranchesService } from './branches.service.js';
import { BranchesController } from './branches.controller.js';

@Module({
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
