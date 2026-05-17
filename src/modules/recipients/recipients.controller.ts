import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateRecipientDto } from './dto/create-recipient.dto';
import { ListRecipientsQueryDto } from './dto/list-recipients.query.dto';
import { UpdateRecipientDto } from './dto/update-recipient.dto';
import { RecipientsService } from './recipients.service';

@Controller('recipients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COORDINATOR_SENDER, UserRole.ADMIN)
export class RecipientsController {
  constructor(private readonly recipients: RecipientsService) {}

  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRecipientsQueryDto,
  ) {
    const limit = query.limit ?? 10;
    const page = query.page ?? 1;
    const q = typeof query.q === 'string' ? query.q.trim() : '';
    return this.recipients.searchPaged(
      q,
      {
        limit,
        page,
        status: query.status ?? 'active',
        sortBy: query.sortBy,
        sortDir: query.sortDir,
      },
      user,
    );
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.recipients.getById(id, user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateRecipientDto,
  ) {
    return this.recipients.create(body, user);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateRecipientDto,
  ) {
    return this.recipients.update(id, body, user);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.recipients.remove(id, user);
  }

  @Post(':id/deactivate')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.recipients.deactivate(id, user);
  }

  @Post(':id/reactivate')
  reactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.recipients.reactivate(id, user);
  }
}
