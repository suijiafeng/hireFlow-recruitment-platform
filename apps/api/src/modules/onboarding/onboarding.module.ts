import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { OnboardingPortalController } from './onboarding-portal.controller';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { WebhookService } from './providers/webhook.service';

@Module({
  imports: [ApplicationsModule],
  controllers: [OnboardingController, OnboardingPortalController],
  providers: [OnboardingService, WebhookService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
