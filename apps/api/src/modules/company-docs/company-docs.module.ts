import { Module } from '@nestjs/common';
import { CompanyDocsController } from './company-docs.controller';
import { CompanyDocsService } from './company-docs.service';

@Module({
  controllers: [CompanyDocsController],
  providers: [CompanyDocsService],
})
export class CompanyDocsModule {}
