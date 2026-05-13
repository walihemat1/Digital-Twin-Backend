import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('recipient_user_access')
@Unique('UQ_recipient_user_access_recipient_user', ['recipientId', 'userId'])
@Index('IDX_recipient_user_access_user_id', ['userId'])
@Index('IDX_recipient_user_access_recipient_id', ['recipientId'])
export class RecipientUserAccess {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;
}
