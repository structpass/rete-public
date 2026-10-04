import { Module } from '@nestjs/common';
import { ReferenceObjectTypesController } from './reference-integration.controller';
import { ReferenceObjectTypesService } from './reference-integration.service';
import { ReferenceObjectTypesRepository } from './repositories/reference-object-types.repository';

@Module({
  controllers: [ReferenceObjectTypesController],
  providers: [ReferenceObjectTypesService, ReferenceObjectTypesRepository],
})
export class ReferenceIntegrationModule {}
