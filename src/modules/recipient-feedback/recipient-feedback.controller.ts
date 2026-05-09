import { Controller, Get, Param } from '@nestjs/common';
import { RecipientFeedbackAccessService } from './recipient-feedback-access.service';

/**
 * Public, token-scoped access for recipients (no JWT).
 * Planning: `GET /recipient-feedback/{token}` (global prefix `api`).
 */
@Controller('recipient-feedback')
export class RecipientFeedbackController {
  constructor(
    private readonly recipientFeedbackAccess: RecipientFeedbackAccessService,
  ) {}

  @Get(':token')
  getAccess(@Param('token') token: string) {
    return this.recipientFeedbackAccess.getAccessByRawToken(token);
  }
}
