import {
  Body,
  Controller,
  DefaultValuePipe,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { BrokerADeclineDto } from '../transactions/dto/broker-a-decline.dto';
import { BrokerALocalAgentDetailsDto } from '../transactions/dto/broker-a-local-agent-details.dto';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * Broker A response actions under the global `transactions` path (see backend_planning API outline).
 */
@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BROKER_A)
export class BrokerATransactionResponseController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post(':id/broker-a/accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.transactions.brokerAAccept(user, id);
  }

  @Post(':id/broker-a/decline')
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new DefaultValuePipe({})) body: BrokerADeclineDto,
  ) {
    return this.transactions.brokerADecline(user, id, body);
  }

  @Post(':id/broker-a/local-agent-details')
  submitLocalAgentDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: BrokerALocalAgentDetailsDto,
  ) {
    return this.transactions.brokerASubmitLocalAgentDetails(user, id, body);
  }
}
