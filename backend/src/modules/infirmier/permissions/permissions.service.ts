import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { agentDuCompte } from '../../../common/agent-sante';

export interface CreerPermissionDto {
  beging_date: string;
  end_date: string;
  beging_time?: string;
  end_time?: string;
  description: string;
  piece_url?: string;
}

type Ligne = Record<string, unknown>;

@Injectable()
export class InfirmierPermissionsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Infirmier·ère OU médecin connecté (services partagés par les deux espaces) */
  private async getInfirmier(userId: number) {
    const a = await agentDuCompte(this.db, userId);
    return { infirmierId: a.infirmierId, hospitalId: a.hospitalId, hospitalNom: a.hospitalNom, typePermission: a.typePermission, role: a.role };
  }

  /** Liste des demandes de permissions de l'infirmier */
  async getPermissions(userId: number) {
    const rows = await this.db.query(
      `SELECT p.id, p.code, p.user_id, p.hospital_id, p.type,
              p.beging_date, p.end_date, p.beging_time, p.end_time,
              p.description, p._url AS piece_url, p.status, p.created_at, p.updated_at
         FROM permissions p
        WHERE p.user_id = ?
        ORDER BY p.id DESC`,
      [userId],
    );

    return rows.map((r: Ligne) => ({
      id: Number(r.id),
      code: (r.code as string) || `PERM-${r.id}`,
      debutDate: (r.beging_date as string) ?? null,
      finDate: (r.end_date as string) ?? null,
      debutHeure: (r.beging_time as string) ?? null,
      finHeure: (r.end_time as string) ?? null,
      description: (r.description as string) ?? '',
      pieceUrl: (r.piece_url as string) ?? null,
      statut: (r.status as 'pending' | 'agree' | 'reject') || 'pending',
      createdAt: r.created_at,
    }));
  }

  /** Soumettre une nouvelle demande de permission d'absence */
  async creerPermission(userId: number, dto: CreerPermissionDto) {
    const { hospitalId, typePermission } = await this.getInfirmier(userId);

    if (!dto.beging_date || !dto.end_date) {
      throw new BadRequestException('Les dates de début et de fin sont obligatoires.');
    }
    if (!dto.description || !dto.description.trim()) {
      throw new BadRequestException('Veuillez renseigner le motif de la demande.');
    }

    // Vérifier si une demande est déjà en attente
    const [existPending] = await this.db.query(
      `SELECT id FROM permissions WHERE user_id = ? AND status = 'pending' LIMIT 1`,
      [userId],
    );
    if (existPending) {
      throw new BadRequestException(
        'Vous avez déjà une demande de permission en attente de validation par la direction.',
      );
    }

    const code = `PERM-${Date.now().toString().slice(-6)}`;

    await this.db.query(
      `INSERT INTO permissions (
         code, user_id, hospital_id, type, beging_date, end_date,
         beging_time, end_time, description, _url, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [
        code,
        userId,
        hospitalId,
        typePermission,
        dto.beging_date,
        dto.end_date,
        dto.beging_time || null,
        dto.end_time || null,
        dto.description.trim(),
        dto.piece_url || null,
      ],
    );

    return {
      success: true,
      message: 'Votre demande de permission a été transmise à l’administration de l’hôpital.',
    };
  }
}

