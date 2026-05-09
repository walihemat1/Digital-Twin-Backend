import {
  Body,
  Controller,
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
import { BrokerBConfirmDeliveryDto } from '../transactions/dto/broker-b-confirm-delivery.dto';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * Broker B workflow actions under the global `transactions` path (backend_planning §9.3).
 */
@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BROKER_B)
export class BrokerBTransactionResponseController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post(':id/broker-b/confirm-delivery')
  confirmDelivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: BrokerBConfirmDeliveryDto,
  ) {
    return this.transactions.brokerBConfirmDelivery(user, id, body);
  }
}
