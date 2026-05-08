import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ListTransactionsQueryDto } from '../transactions/dto/list-transactions.query.dto';
import { TransactionsService } from '../transactions/transactions.service';

@Controller('broker-a/transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BROKER_A)
export class BrokerATransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.transactions.listForBrokerA(user, {
      offset: query.offset,
      limit: query.limit,
    });
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.transactions.getDetailForBrokerA(user, id);
  }
}
