import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ApprovalRequestsService } from '../../approval/approval-requests.service';
import { ListApprovalRequestsQueryDto } from '../dto/list-approval-requests.query.dto';
import { RejectApprovalRequestDto } from '../dto/reject-approval-request.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminApprovalRequestsController {
  constructor(private readonly approvalRequests: ApprovalRequestsService) {}

  @Get('approval-requests')
  list(@Query() query: ListApprovalRequestsQueryDto) {
    return this.approvalRequests.listForAdmin(query.status);
  }

  @Post('approval-requests/:id/approve')
  approve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.approvalRequests.approve(id, actor.userId).then(() => ({
      ok: true,
    }));
  }

  @Post('approval-requests/:id/reject')
  reject(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: RejectApprovalRequestDto,
  ) {
    return this.approvalRequests
      .reject(id, actor.userId, body.rejectionReason)
      .then(() => ({ ok: true }));
  }
}
