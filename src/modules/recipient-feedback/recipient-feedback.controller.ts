import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SubmitRecipientFeedbackDto } from './dto/submit-recipient-feedback.dto';
import { RecipientFeedbackAccessService } from './recipient-feedback-access.service';
import { RecipientFeedbackSubmissionService } from './recipient-feedback-submission.service';

/**
 * Public, token-scoped access for recipients (no JWT).
 * Planning: `GET /recipient-feedback/{token}`, `POST /recipient-feedback/{token}/submit` (global prefix `api`).
 */
@Controller('recipient-feedback')
export class RecipientFeedbackController {
  constructor(
    private readonly recipientFeedbackAccess: RecipientFeedbackAccessService,
    private readonly recipientFeedbackSubmission: RecipientFeedbackSubmissionService,
  ) {}

  @Get(':token')
  getAccess(@Param('token') token: string) {
    return this.recipientFeedbackAccess.getAccessByRawToken(token);
  }

  @Post(':token/submit')
  submitFeedback(
    @Param('token') token: string,
    @Body() dto: SubmitRecipientFeedbackDto,
  ) {
    return this.recipientFeedbackSubmission.submitFeedback(token, dto);
  }
}
