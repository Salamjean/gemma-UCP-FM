import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

/**
 * AGENT DE SANTÉ CONNECTÉ (infirmier·ère ou médecin / sage-femme)
 * Services partagés par les deux espaces : accueil des patients, permissions, planning.
 *   - infirmierId : renseigné pour un infirmier (sinon null) ;
 *   - doctorId    : renseigné pour un médecin (sinon null) ;
 *   - typePermission : valeur Laravel de permissions.type ('male_nurse' | 'doctor').
 */
export interface AgentSante {
  role: 'infirmier' | 'doctor';
  infirmierId: number | null;
  doctorId: number | null;
  hospitalId: number;
  hospitalNom: string;
  typePermission: 'male_nurse' | 'doctor';
}

export async function agentDuCompte(db: DataSource, userId: number): Promise<AgentSante> {
  const [inf] = await db.query(
    `SELECT i.id, i.hospital_id, h.label FROM infirmiers i LEFT JOIN hospitals h ON h.id = i.hospital_id
      WHERE i.user_id = ? AND i.\`delete\` = 0 LIMIT 1`,
    [userId],
  );
  if (inf) {
    return { role: 'infirmier', infirmierId: Number(inf.id), doctorId: null, hospitalId: Number(inf.hospital_id), hospitalNom: inf.label || 'Hôpital', typePermission: 'male_nurse' };
  }
  const [doc] = await db.query(
    `SELECT d.id, d.hospital_id, h.label FROM doctors d LEFT JOIN hospitals h ON h.id = d.hospital_id
      WHERE d.user_id = ? AND d.\`delete\` = 0 AND d.deleted_at IS NULL LIMIT 1`,
    [userId],
  );
  if (doc) {
    return { role: 'doctor', infirmierId: null, doctorId: Number(doc.id), hospitalId: Number(doc.hospital_id), hospitalNom: doc.label || 'Hôpital', typePermission: 'doctor' };
  }
  throw new NotFoundException('Profil d’agent de santé introuvable.');
}
