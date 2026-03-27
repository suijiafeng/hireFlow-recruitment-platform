import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

@Module({
  imports: [ApplicationsModule],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
