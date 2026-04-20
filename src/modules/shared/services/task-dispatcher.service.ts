import { Injectable } from '@nestjs/common';

@Injectable()
export class TaskDispatcherService {
  async dispatch(taskName: string, payload: Record<string, unknown>): Promise<void> {
    // Intentionally synchronous for initial scaffold.
    // This contract allows later migration to queue-backed jobs (BullMQ/Redis).
    void taskName;
    void payload;
  }
}
