import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { PrescreenPortalController } from './prescreen-portal.controller';

@Module({
  controllers: [ApplicationsController, PrescreenPortalController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
