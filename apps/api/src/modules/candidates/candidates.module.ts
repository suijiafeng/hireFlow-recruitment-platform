import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { ResumesController } from './resumes.controller';

@Module({
  controllers: [CandidatesController, ResumesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
