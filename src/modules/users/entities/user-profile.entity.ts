import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { User } from './user.entity';

@Entity('user_profiles')
export class UserProfile extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @OneToOne(() => User, (user) => user.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'organization_name', type: 'varchar', nullable: true })
  organizationName!: string | null;

  @Column({ type: 'varchar', nullable: true })
  country!: string | null;

  @Column({ name: 'state_province', type: 'varchar', nullable: true })
  stateProvince!: string | null;

  @Column({ name: 'address_line_1', type: 'varchar', nullable: true })
  addressLine1!: string | null;

  @Column({ name: 'address_line_2', type: 'varchar', nullable: true })
  addressLine2!: string | null;

  @Column({ name: 'city_town', type: 'varchar', nullable: true })
  cityTown!: string | null;

  @Column({ name: 'zip_code', type: 'varchar', nullable: true })
  zipCode!: string | null;

  @Column({ name: 'phone_number', type: 'varchar', nullable: true })
  phoneNumber!: string | null;

  @Column({ name: 'whatsapp_country_code', type: 'varchar', nullable: true })
  whatsappCountryCode!: string | null;

  @Column({ name: 'whatsapp_number', type: 'varchar', nullable: true })
  whatsappNumber!: string | null;

  @Column({
    name: 'normalized_whatsapp_number',
    type: 'varchar',
    nullable: true,
  })
  normalizedWhatsappNumber!: string | null;
}
