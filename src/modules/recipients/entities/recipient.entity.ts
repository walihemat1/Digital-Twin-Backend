import { Column, Entity, Index } from 'typeorm';
import { VerificationStatus } from '../../../common/enums/verification-status.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';

@Entity('recipients')
@Index('IDX_recipients_normalized_phone', ['normalizedPhone'])
@Index('IDX_recipients_verification_status', ['verificationStatus'])
export class Recipient extends BaseEntity {
  @Column({ name: 'first_name', type: 'varchar', length: 255 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 255 })
  lastName!: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 32 })
  phoneNumber!: string;

  @Column({ name: 'normalized_phone', type: 'varchar', length: 32 })
  normalizedPhone!: string;

  @Column({ name: 'issuing_country', type: 'varchar', length: 120, nullable: true })
  issuingCountry!: string | null;

  @Column({
    name: 'identification_number_encrypted',
    type: 'text',
    nullable: true,
  })
  identificationNumberEncrypted!: string | null;

  @Column({
    name: 'verification_status',
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status_enum',
    default: VerificationStatus.UNVERIFIED,
  })
  verificationStatus!: VerificationStatus;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
