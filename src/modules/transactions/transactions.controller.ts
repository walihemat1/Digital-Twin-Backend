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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AffirmRecipientFeedbackDto } from './dto/affirm-recipient-feedback.dto';
import { CoordinatorChangeBrokerADto } from './dto/coordinator-change-broker-a.dto';
import { CoordinatorChangeRecipientDto } from './dto/coordinator-change-recipient.dto';
import { ListEligibleBrokerAQueryDto } from './dto/list-eligible-broker-a.query.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.dto';
import { SubmitTransactionDto } from './dto/submit-transaction.dto';
import { TransactionCompletionService } from './transaction-completion.service';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COORDINATOR_SENDER)
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly transactionCompletion: TransactionCompletionService,
  ) {}

  @Post()
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubmitTransactionDto,
  ) {
    return this.transactions.submit(user, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.transactions.listForCoordinator(user, {
      offset: query.offset,
      limit: query.limit,
      status: query.status,
    });
  }

  @Get('eligible-broker-a')
  listEligibleBrokerA(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListEligibleBrokerAQueryDto,
  ) {
    return this.transactions.listEligibleBrokerA(user, {
      q: query.q,
      limit: query.limit,
      page: query.page,
    });
  }

  @Get(':id/history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.transactions.getStatusHistoryForCoordinator(user, id);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.transactions.getDetailForCoordinator(user, id);
  }

  @Post(':id/coordinator/affirm-feedback')
  async affirmRecipientFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: AffirmRecipientFeedbackDto,
  ) {
    await this.transactionCompletion.affirmFeedbackAndComplete(user, id, body);
    return this.transactions.getDetailForCoordinator(user, id);
  }

  @Post(':id/coordinator/cancel')
  coordinatorCancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.transactions.coordinatorCancel(user, id);
  }

  @Post(':id/coordinator/change-recipient')
  coordinatorChangeRecipient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: CoordinatorChangeRecipientDto,
  ) {
    return this.transactions.coordinatorChangeRecipient(user, id, body);
  }

  @Post(':id/coordinator/change-broker-a')
  coordinatorChangeBrokerA(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: CoordinatorChangeBrokerADto,
  ) {
    return this.transactions.coordinatorChangeBrokerA(user, id, body);
  }
}
