import { Column, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Table `users` de Laravel (lecture seule côté NestJS).
 * Seules les colonnes utiles sont déclarées ; les autres restent intactes.
 */
@Entity({ name: 'users', synchronize: false })
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'varchar', nullable: true })
  prenom: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  /** Rôle Laravel : super, hospital, doctor, infirmier, pharmacy, secretariat, accountant, cashier, patient */
  @Column({ name: 'role_as', type: 'varchar' })
  role: string;

  /** Hash bcrypt Laravel ($2y$...) — jamais renvoyé par l'API (select: false) */
  @Column({ type: 'varchar', select: false })
  password: string;

  /** SoftDeletes de Laravel : les utilisateurs supprimés sont exclus automatiquement */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
