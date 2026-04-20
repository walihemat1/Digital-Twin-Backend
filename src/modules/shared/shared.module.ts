import { Global, Module } from '@nestjs/common';
import { TaskDispatcherService } from './services/task-dispatcher.service';

@Global()
@Module({
  providers: [TaskDispatcherService],
  exports: [TaskDispatcherService],
})
export class SharedModule {}
