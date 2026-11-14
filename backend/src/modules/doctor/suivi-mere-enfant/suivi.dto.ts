import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OUI_NON = ['Oui', 'Non'];
const POS_NEG = ['Positif', 'Négatif'];

/**
 * SUIVI PRÉNATAL DE LA MÈRE (PTME) — mêmes règles que Laravel (SuivieController@storePrenatale)
 */
export class SuiviPrenatalDto {
  @Type(() => Number) @IsInt() patientId: number;

  @Matches(DATE, { message: 'La date de la visite est obligatoire.' }) dateVisite: string;
  @IsString() @IsNotEmpty({ message: 'L’âge gestationnel est obligatoire (ou NA).' }) @MaxLength(20) ageGestationnel: string;
  @IsIn(['Positif sans ARV', 'Positif déjà sous ARV', 'Nouvellement diagnostiquée VIH Positif au cours du mois'], { message: 'Choisissez le statut ARV à l’enregistrement.' })
  statutArv: string;
  @Matches(DATE, { message: 'La date d’initiation du traitement ARV est obligatoire.' }) dateInitiationArv: string;
  @IsIn(OUI_NON, { message: 'Indiquez si la mère est toujours sous ARV.' }) mereSousArv: string;
  @IsIn(OUI_NON, { message: 'Indiquez le cotrimoxazole.' }) cotrimoxazole: string;

  @IsIn(OUI_NON, { message: 'Indiquez le prélèvement pour charge virale.' }) prelevementChargeVirale: string;
  @ValidateIf((o: SuiviPrenatalDto) => o.prelevementChargeVirale === 'Oui')
  @IsString() @IsNotEmpty({ message: 'Indiquez le résultat de la charge virale.' }) @MaxLength(100)
  resultatChargeVirale?: string;
  @ValidateIf((o: SuiviPrenatalDto) => o.prelevementChargeVirale === 'Oui')
  @Matches(DATE, { message: 'Indiquez la date de prélèvement de la charge virale.' })
  datePrelevementVirale?: string;
  @ValidateIf((o: SuiviPrenatalDto) => o.prelevementChargeVirale === 'Oui')
  @Matches(DATE, { message: 'Indiquez la date de réception du résultat.' })
  dateReceptionResultat?: string;

  @IsIn([...OUI_NON, 'NA'], { message: 'Indiquez le dépistage VIH du conjoint.' }) depistageVihConjoint: string;
  @ValidateIf((o: SuiviPrenatalDto) => o.depistageVihConjoint === 'Oui')
  @IsIn([...POS_NEG, 'NA'], { message: 'Indiquez le résultat du dépistage du conjoint.' })
  resultatVihConjoint?: string;
  @ValidateIf((o: SuiviPrenatalDto) => o.depistageVihConjoint === 'Oui')
  @Matches(DATE, { message: 'Indiquez la date du dépistage du conjoint.' })
  dateDepistageVihConjoint?: string;

  @IsIn(['Consultation prénatale', 'Accouchement', 'Postnatales'], { message: 'Choisissez la porte d’entrée.' }) porteEntree: string;
  @IsIn(['VIH 1', 'VIH 2', 'VIH 3'], { message: 'Choisissez le type de VIH.' }) typeVih: string;
  @Matches(DATE, { message: 'La date probable d’accouchement est obligatoire.' }) dateProbableAccouchement: string;
  @IsIn(['A terme', 'Prématuré', 'Avortement / Fausse couche'], { message: 'Choisissez l’issue de la grossesse.' }) issueGrossesse: string;
  @IsIn(OUI_NON, { message: 'Indiquez l’accouchement gémellaire.' }) accouchementGemellaire: string;
  @IsIn(OUI_NON, { message: 'Indiquez la méthode de contraception moderne.' }) contraceptionModerne: string;
}

/** Un PCR / une sérologie : date, âge, résultat, annonce aux parents (+ date d'annonce si Oui) */
const RESULTATS_FINAUX = ['Négatif sorti du programme', 'Perdu de vue', 'Décédé', 'Positif adressé pour la PEC', 'Positif non mis sous ARV', 'Transferé', 'Réferé'];

/**
 * SUIVI POSTNATAL DE L'ENFANT EXPOSÉ (PTME) — mêmes règles que Laravel (SuivieController@storePostnatale)
 */
export class SuiviPostnatalDto {
  @Type(() => Number) @IsInt() enfantId: number;

  /** Nom et prénoms de l'enfant (mis à jour si les deux sont renseignés, comme Laravel) */
  @IsOptional() @IsString() @MaxLength(191) nomEnfant?: string;
  @IsOptional() @IsString() @MaxLength(191) prenomEnfant?: string;

  @IsIn(OUI_NON, { message: 'Indiquez la prophylaxie ARV remise à l’enfant.' }) prophylaxieArvEnfant: string;
  @ValidateIf((o: SuiviPostnatalDto) => o.prophylaxieArvEnfant === 'Oui') @Matches(DATE, { message: 'Indiquez la date de remise.' }) dateRemise?: string;
  @Matches(DATE, { message: 'La date de la visite est obligatoire.' }) dateVisite: string;
  @IsString() @IsNotEmpty({ message: 'L’âge au moment de la visite est obligatoire.' }) @MaxLength(50) ageVisite: string;
  @IsIn(['Allaitement exclusif', 'Alimentation de remplacement exclusif', 'Alimentation de complément'], { message: 'Choisissez le type d’alimentation.' })
  typeAlimentation: string;

  // 1er, 2e et 3e PCR
  @Matches(DATE, { message: '1er PCR : date du prélèvement obligatoire.' }) pcr1Date: string;
  @IsString() @IsNotEmpty({ message: '1er PCR : âge au prélèvement obligatoire.' }) @MaxLength(50) pcr1Age: string;
  @IsIn(POS_NEG, { message: '1er PCR : résultat obligatoire.' }) pcr1Resultat: string;
  @IsIn(OUI_NON, { message: '1er PCR : annonce aux parents obligatoire.' }) pcr1Annonce: string;
  @ValidateIf((o: SuiviPostnatalDto) => o.pcr1Annonce === 'Oui') @Matches(DATE, { message: '1er PCR : date d’annonce obligatoire.' }) pcr1DateAnnonce?: string;

  @Matches(DATE, { message: '2e PCR : date du prélèvement obligatoire.' }) pcr2Date: string;
  @IsString() @IsNotEmpty({ message: '2e PCR : âge au prélèvement obligatoire.' }) @MaxLength(50) pcr2Age: string;
  @IsIn(POS_NEG, { message: '2e PCR : résultat obligatoire.' }) pcr2Resultat: string;
  @IsIn(OUI_NON, { message: '2e PCR : annonce aux parents obligatoire.' }) pcr2Annonce: string;
  @ValidateIf((o: SuiviPostnatalDto) => o.pcr2Annonce === 'Oui') @Matches(DATE, { message: '2e PCR : date d’annonce obligatoire.' }) pcr2DateAnnonce?: string;

  @Matches(DATE, { message: '3e PCR : date du prélèvement obligatoire.' }) pcr3Date: string;
  @IsString() @IsNotEmpty({ message: '3e PCR : âge au prélèvement obligatoire.' }) @MaxLength(50) pcr3Age: string;
  @IsIn(POS_NEG, { message: '3e PCR : résultat obligatoire.' }) pcr3Resultat: string;
  @IsIn(OUI_NON, { message: '3e PCR : annonce aux parents obligatoire.' }) pcr3Annonce: string;
  @ValidateIf((o: SuiviPostnatalDto) => o.pcr3Annonce === 'Oui') @Matches(DATE, { message: '3e PCR : date d’annonce obligatoire.' }) pcr3DateAnnonce?: string;

  // Cotrimoxazole (CTX) et isoniazide (INH)
  @IsIn(OUI_NON, { message: 'Indiquez si l’enfant est sous CTX.' }) sousCtx: string;
  @ValidateIf((o: SuiviPostnatalDto) => o.sousCtx === 'Oui') @Matches(DATE, { message: 'Indiquez la date d’initiation du CTX.' }) ctxDate?: string;
  @ValidateIf((o: SuiviPostnatalDto) => o.sousCtx === 'Oui') @IsString() @IsNotEmpty({ message: 'Indiquez l’âge à l’initiation du CTX.' }) @MaxLength(50) ctxAge?: string;
  @IsIn(OUI_NON, { message: 'Indiquez si l’enfant est sous INH.' }) sousInh: string;
  @ValidateIf((o: SuiviPostnatalDto) => o.sousInh === 'Oui') @Matches(DATE, { message: 'Indiquez la date d’initiation de l’INH.' }) inhDate?: string;
  @ValidateIf((o: SuiviPostnatalDto) => o.sousInh === 'Oui') @IsString() @IsNotEmpty({ message: 'Indiquez l’âge à l’initiation de l’INH.' }) @MaxLength(50) inhAge?: string;

  // Sérologies VIH 1 et 2
  @Matches(DATE, { message: 'Sérologie 1 : date obligatoire.' }) sero1Date: string;
  @IsString() @IsNotEmpty({ message: 'Sérologie 1 : âge au test obligatoire.' }) @MaxLength(50) sero1Age: string;
  @IsIn(POS_NEG, { message: 'Sérologie 1 : résultat obligatoire.' }) sero1Resultat: string;
  @IsIn(OUI_NON, { message: 'Sérologie 1 : annonce aux parents obligatoire.' }) sero1Annonce: string;
  @ValidateIf((o: SuiviPostnatalDto) => o.sero1Annonce === 'Oui') @Matches(DATE, { message: 'Sérologie 1 : date d’annonce obligatoire.' }) sero1DateAnnonce?: string;

  @Matches(DATE, { message: 'Sérologie 2 : date obligatoire.' }) sero2Date: string;
  @IsString() @IsNotEmpty({ message: 'Sérologie 2 : âge au test obligatoire.' }) @MaxLength(50) sero2Age: string;
  @IsIn(POS_NEG, { message: 'Sérologie 2 : résultat obligatoire.' }) sero2Resultat: string;
  @IsIn(OUI_NON, { message: 'Sérologie 2 : annonce aux parents obligatoire.' }) sero2Annonce: string;
  @ValidateIf((o: SuiviPostnatalDto) => o.sero2Annonce === 'Oui') @Matches(DATE, { message: 'Sérologie 2 : date d’annonce obligatoire.' }) sero2DateAnnonce?: string;

  // Résultat final
  @IsIn(RESULTATS_FINAUX, { message: 'Choisissez le résultat final du suivi.' }) resultatFinal: string;
  @IsOptional() @IsString() @MaxLength(191) siteTransfert?: string;
  @IsOptional() @Matches(DATE, { message: 'Date du statut final invalide.' }) dateStatutFinal?: string;
}
