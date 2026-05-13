import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { GrantRecipientCoordinatorAccessDto } from '../../recipients/dto/grant-recipient-coordinator-access.dto';
import { RecipientsService } from '../../recipients/recipients.service';

@Controller('admin/recipients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminRecipientsController {
  constructor(private readonly recipients: RecipientsService) {}

  /**
   * Grants a Coordinator/Sender visibility of an existing recipient (search, selection, transactions).
   */
  @Post(':recipientId/coordinator-access')
  grantCoordinatorAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recipientId', new ParseUUIDPipe({ version: '4' })) recipientId: string,
    @Body() body: GrantRecipientCoordinatorAccessDto,
  ) {
    return this.recipients.grantRecipientCoordinatorAccess(
      user,
      recipientId,
      body.userId,
    );
  }
}
