import { Column, Entity } from 'typeorm';
import { NotificationChannel } from '../../../common/enums/notification-channel.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';

@Entity('external_contacts')
export class ExternalContact extends BaseEntity {
  @Column({ name: 'contact_type', type: 'varchar', length: 120 })
  contactType!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 255 })
  displayName!: string;

  @Column({ name: 'organization_name', type: 'varchar', length: 255, nullable: true })
  organizationName!: string | null;

  @Column({ name: 'phone_number', type: 'varchar', length: 40, nullable: true })
  phoneNumber!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({
    name: 'preferred_channel',
    type: 'enum',
    enum: NotificationChannel,
    enumName: 'notification_channel_enum',
    nullable: true,
  })
  preferredChannel!: NotificationChannel | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  status!: string | null;
}
