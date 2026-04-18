import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

// 全局模块：简历、入职材料、合同等多处需要对象存储
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
