import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt } from 'class-validator';
import { DataSource } from 'typeorm';
import type { ContexteAudit } from '../../../common/audit/audit.service';
import { InfirmierAccueilService } from '../../infirmier/gestion-patients/accueil.service';
import { DoctorConsultationsService } from './consultations.service';
import { ConsultationCurativeDto } from './dto/consultation.dto';

/** Issues possibles d'une programmation directe */
export const ISSUES_PROGRAMMATION = ['teleconsultation', 'refere-interne', 'refere-externe'];

/**
 * Programmation directe depuis l'onglet Télémédecine : patient + mêmes champs que l'issue du formulaire de consultation
 * (téléconsultation, ou télé-expertise interne / externe, urgente ou programmée).
 */
export class ProgrammationTelemedecineDto extends ConsultationCurativeDto {
  @Type(() => Number)
  @IsInt({ message: 'Patient invalide.' })
  patientId: number;

  @IsIn(ISSUES_PROGRAMMATION, { message: 'Choisissez une téléconsultation ou une télé-expertise.' })
  modeSortie!: string;
}

/**
 * MÉDECIN / INFIRMIER·ÈRE > TÉLÉMÉDECINE > PROGRAMMER
 * Sans passer par le formulaire complet : la consultation du jour est ouverte dans le service de l'agent (comme « Consulter »),
 * puis terminée avec l'issue choisie — mêmes contrôles et mêmes écritures que le formulaire
 * (consultation du médecin distant, fm_references avec délai de réponse, etc.).
 */
@Injectable()
export class ProgrammationTelemedecineService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly accueil: InfirmierAccueilService,
    private readonly consultations: DoctorConsultationsService,
  ) {}

  async programmer(userId: number, role: 'doctor' | 'infirmier', dto: ProgrammationTelemedecineDto, ctx: ContexteAudit) {
    if (!ISSUES_PROGRAMMATION.includes(dto.modeSortie)) throw new BadRequestException('Choisissez une téléconsultation ou une télé-expertise.');
    const { patientId, ...reste } = dto;
    const saisie = Object.assign(new ConsultationCurativeDto(), reste);
    // La justification de l'issue reprend le motif de la demande
    saisie.justification = saisie.justification?.trim() || saisie.motif;

    const ouverte = await this.accueil.consulter(userId, patientId, ctx);
    const nouvelle = !ouverte.message.startsWith('Reprise');
    try {
      const r = await this.consultations.enregistrer(userId, ouverte.consultationId, saisie, role);
      // Télé-expertise sans consultation préalable : l'expert joindra seulement son résultat (pas de formulaire de consultation)
      if (saisie.modeSortie === 'refere-interne' || saisie.modeSortie === 'refere-externe') {
        await this.db.query('UPDATE fm_references SET programmation_directe = 1 WHERE consultation_origine_id = ?', [ouverte.consultationId]);
      }
      return { ...r, consultationId: ouverte.consultationId };
    } catch (e) {
      // Programmation refusée : la consultation ouverte pour l'occasion est retirée (suppression logique, comme Laravel)
      if (nouvelle) {
        await this.db.query('UPDATE consultations SET deleted_at = UTC_TIMESTAMP() WHERE id = ? AND status = 0', [ouverte.consultationId]).catch(() => undefined);
      }
      throw e;
    }
  }
}
