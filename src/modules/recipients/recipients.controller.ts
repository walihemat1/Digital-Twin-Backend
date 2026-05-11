import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateRecipientDto } from './dto/create-recipient.dto';
import { SearchRecipientsQueryDto } from './dto/search-recipients.query.dto';
import { RecipientsService } from './recipients.service';

@Controller('recipients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COORDINATOR_SENDER, UserRole.ADMIN)
export class RecipientsController {
  constructor(private readonly recipients: RecipientsService) {}

  @Get('search')
  search(@Query() query: SearchRecipientsQueryDto) {
    const limit = query.limit ?? 10;
    const page = query.page ?? 1;
    const q = typeof query.q === 'string' ? query.q.trim() : '';
    return this.recipients.searchPaged(q, { limit, page });
  }

  @Post()
  create(@Body() body: CreateRecipientDto) {
    return this.recipients.create(body);
  }
}
