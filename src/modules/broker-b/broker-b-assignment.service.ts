import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { BrokerBAssignmentStatus } from '../../common/enums/broker-b-assignment-status.enum';
import { BrokerBAssignmentType } from '../../common/enums/broker-b-assignment-type.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ExternalContact } from '../external-contacts/entities/external-contact.entity';
import { TransactionBrokerBAssignment } from '../transactions/entities/transaction-broker-b-assignment.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../users/entities/user.entity';
import { BrokerBAssignDto } from './dto/broker-b-assign.dto';
import { assertMajorWorkflowFieldsUnlocked } from '../transactions/transaction-workflow-lock.rules';
import { assertBrokerBAssignmentTargetsValid } from './broker-b-assignment.validation';

export type BrokerBAssignmentView = {
  id: string;
  transaction_id: string;
  assignment_type: BrokerBAssignmentType;
  internal_user_id: string | null;
  external_contact_id: string | null;
  assignment_status: BrokerBAssignmentStatus;
  assigned_at: Date;
  responded_at: Date | null;
  decline_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class BrokerBAssignmentService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(TransactionBrokerBAssignment)
    private readonly assignments: Repository<TransactionBrokerBAssignment>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(ExternalContact)
    private readonly externalContacts: Repository<ExternalContact>,
  ) {}

  private assertCoordinatorFundsAccess(actor: User): void {
    if (actor.role !== UserRole.COORDINATOR_SENDER) {
      throw new ForbiddenException('Only a coordinator/sender may assign Broker B.');
    }
    if (actor.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is not approved for this action.');
    }
  }

  private toView(row: TransactionBrokerBAssignment): BrokerBAssignmentView {
    return {
      id: row.id,
      transaction_id: row.transactionId,
      assignment_type: row.assignmentType,
      internal_user_id: row.internalUserId,
      external_contact_id: row.externalContactId,
      assignment_status: row.assignmentStatus,
      assigned_at: row.assignedAt,
      responded_at: row.respondedAt,
      decline_reason: row.declineReason,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  async assign(
    authUser: AuthenticatedUser,
    transactionId: string,
    dto: BrokerBAssignDto,
  ): Promise<BrokerBAssignmentView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertCoordinatorFundsAccess(actor);

    assertBrokerBAssignmentTargetsValid(
      dto.assignmentType,
      dto.internalUserId,
      dto.externalContactId,
    );

    const tx = await this.transactions.findOne({ where: { id: transactionId } });
    if (!tx || tx.coordinatorId !== authUser.userId) {
      throw new NotFoundException('Transaction not found.');
    }
    assertMajorWorkflowFieldsUnlocked(tx);
    if (tx.status !== TransactionStatus.AWAITING_BROKER_B) {
      throw new BadRequestException(
        'Broker B can only be assigned while the transaction is awaiting Broker B.',
      );
    }

    const existingOpen = await this.assignments.findOne({
      where: {
        transactionId: tx.id,
        assignmentStatus: BrokerBAssignmentStatus.ASSIGNED,
      },
    });
    if (existingOpen) {
      throw new BadRequestException(
        'This transaction already has an active Broker B assignment.',
      );
    }

    if (dto.assignmentType === BrokerBAssignmentType.INTERNAL_USER) {
      const brokerB = await this.users.findOne({
        where: { id: dto.internalUserId },
      });
      if (!brokerB) {
        throw new BadRequestException('Broker B user not found.');
      }
      if (brokerB.role !== UserRole.BROKER_B) {
        throw new BadRequestException('Selected user is not an eligible Broker B.');
      }
      if (brokerB.accountStatus !== AccountStatus.ACTIVE) {
        throw new BadRequestException('Broker B account is not active.');
      }
    } else {
      const contact = await this.externalContacts.findOne({
        where: { id: dto.externalContactId },
      });
      if (!contact) {
        throw new BadRequestException('External contact not found.');
      }
    }

    const assignedAt = new Date();
    const row = this.assignments.create({
      transactionId: tx.id,
      assignmentType: dto.assignmentType,
      internalUserId:
        dto.assignmentType === BrokerBAssignmentType.INTERNAL_USER
          ? dto.internalUserId!
          : null,
      externalContactId:
        dto.assignmentType === BrokerBAssignmentType.EXTERNAL_CONTACT
          ? dto.externalContactId!
          : null,
      assignmentStatus: BrokerBAssignmentStatus.ASSIGNED,
      assignedAt,
      respondedAt: null,
      declineReason: null,
    });
    const saved = await this.assignments.save(row);
    return this.toView(saved);
  }
}
