import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { VerificationStatus } from '../../../common/enums/verification-status.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';

@Entity('recipients')
@Index('IDX_recipients_normalized_phone', ['normalizedPhone'])
@Index('IDX_recipients_verification_status', ['verificationStatus'])
@Index('IDX_recipients_created_by_user_id', ['createdByUserId'])
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

  @Column({ name: 'organization_name', type: 'varchar', length: 255, nullable: true })
  organizationName!: string | null;

  @Column({ name: 'email', type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ name: 'whatsapp_number', type: 'varchar', length: 32, nullable: true })
  whatsappNumber!: string | null;

  @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
  countryCode!: string | null;

  @Column({ name: 'state_province_code', type: 'varchar', length: 32, nullable: true })
  stateProvinceCode!: string | null;

  @Column({ name: 'address_line_1', type: 'varchar', length: 500, nullable: true })
  addressLine1!: string | null;

  @Column({ name: 'address_line_2', type: 'varchar', length: 500, nullable: true })
  addressLine2!: string | null;

  @Column({ name: 'city_town', type: 'varchar', length: 255, nullable: true })
  cityTown!: string | null;

  @Column({ name: 'zip_code', type: 'varchar', length: 32, nullable: true })
  zipCode!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy?: User | null;
}
