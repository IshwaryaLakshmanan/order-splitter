import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('orders')
@Index(['orderType'])
@Index(['createdAt'])
@Index(['executionDate'])
export class OrderEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 10 })
  orderType!: 'BUY' | 'SELL';
  
  @Column({ type: 'date' })
  executionDate!: string;

  @Column({ type: 'varchar', length: 100 })
  portfolioName!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: 'Created' | 'Executed' | 'Cancelled';

  @Column({ type: 'jsonb' })
  orders!: {
    symbol: string;
    amount: number;
    price: number;
    quantity: number;
  }[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}