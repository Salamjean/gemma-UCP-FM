import { fichierUploads, uploadUrl } from '../../services/api';
import type { DeclarationDecesDetail, DeclarationNaissanceDetail, DocumentsConsultation } from '../../types';
import s from './DocumentsLaravel.module.css';

/**
 * DOCUMENTS IMPRIMABLES — reproduction fidèle des PDF de Laravel (DomPDF, A4 portrait) :
 *   - users/doctor/consultation/formulaire/post-consultation/pdf/ordonnance.blade.php
 *   - users/doctor/consultation/formulaire/post-consultation/pdf/examen.blade.php
 *   - users/doctor/consultation/formulaire/post-consultation/pdf/arret.blade.php
 *   - users/doctor/declaration/pdf/naissance.blade.php
 *   - users/doctor/declaration/pdf/deces.blade.php
 * Mêmes textes, mêmes polices, mêmes images (public/assets/uploads de Laravel), mêmes formats de date.
 * Seule différence volontaire : la localité de l'hôpital est écrite en toutes lettres (Laravel affichait son identifiant).
 */

const ARTICLE_285 =
  "Art. 285. Quiconque se rend coupable de fraude ou de fausse déclaration ou se fait délivrer un des documents prévus à l'article précédent, soit en faisant de fausses déclarations, soit en prenant un faux nom ou une fausse qualité, soit en fournissant de faux renseignements, certificats ou attestations est puni de deux(02) à dix(10) ans et d'une amende de 200.000 à 2.000.000 de francs Franc CFA selon Art 281 et 223";

// ---------- Formats de date de Laravel (Carbon, fr_FR) ----------
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** Date (ISO, « AAAA-MM-JJ » ou « JJ/MM/AAAA ») → Date en UTC (les dates de la base sont en UTC, comme Laravel) */
function lire(x: string | null | undefined): Date | null {
  if (!x) return null;
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(x);
  if (fr) return new Date(Date.UTC(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1])));
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const d = new Date(x);
  return isNaN(d.getTime()) ? null : d;
}
/** dateCompletFr : « jeudi 12 novembre 2026 » */
const dateCompletFr = (x: string | null | undefined) => {
  const d = lire(x);
  return d ? `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
};
/** dateFr : « jeu. 12 novembre 2026 » */
const dateFr = (x: string | null | undefined) => {
  const d = lire(x);
  return d ? `${JOURS_COURTS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
};
/** heureFr : « 8:5 » (format H:m de Laravel) */
const heureFr = (x: string | null | undefined) => {
  const d = lire(x);
  return d ? `${d.getUTCHours()}:${d.getUTCMinutes()}` : '';
};
/** format('d/m/Y - H:i:s') */
const dateHeureSec = (x: string | null | undefined) => {
  const d = lire(x);
  return d ? `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} - ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}` : '';
};
/** format('d-m-Y') */
const dateTirets = (x: string | null | undefined) => {
  const d = lire(x);
  return d ? `${p2(d.getUTCDate())}-${p2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}` : '';
};
/** date('d-m-Y') : jour de l'impression */
const aujourdhui = () => {
  const d = new Date();
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`;
};
/** Âge en années (Carbon diffInYears) depuis « JJ/MM/AAAA » */
function ageAns(naissance: string | null | undefined) {
  const d = lire(naissance);
  if (!d) return '';
  const n = new Date();
  let a = n.getFullYear() - d.getUTCFullYear();
  if (n.getMonth() < d.getUTCMonth() || (n.getMonth() === d.getUTCMonth() && n.getDate() < d.getUTCDate())) a--;
  return String(Math.max(a, 0));
}
/** Heure de naissance (Carbon::parse(...)->format('H:i')) ; naissance multiple : heures telles quelles */
const heureMinutes = (h: string | null | undefined) => {
  if (!h) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(h.trim());
  return m && !h.includes(',') ? `${p2(Number(m[1]))}:${m[2]}` : h;
};

const Pied = () => <footer className={s.pied}>{ARTICLE_285}</footer>;

/** Logo de l'hôpital (assets/uploads/hospital) sinon logo du ministère, comme Laravel */
const LogoHopital = ({ logo, ministere = true }: { logo: string | null; ministere?: boolean }) =>
  logo ? <img src={uploadUrl('hospital', logo)} alt="hôpital" width={100} /> : ministere ? <div><img src={fichierUploads('ministere.jpg')} alt="" /></div> : null;

/** Filigrane : celui de l'hôpital s'il existe, sinon celui du document */
const filigrane = (propre: string | null, defaut: string) => (propre ? uploadUrl('hospital', propre) : fichierUploads(defaut));

// =====================================================================
// ORDONNANCE MÉDICALE (pdf/ordonnance.blade.php)
// =====================================================================
export function OrdonnanceLaravel({ doc }: { doc: DocumentsConsultation }) {
  const o = doc.ordonnance!;
  return (
    <div className={`${s.page} ${s.ordonnance}`}>
      <div className={s.filigraneOrdonnance}>
        <img className={s.imgOrdonnance} src={filigrane(doc.hopital.filigrane, 'ordonnance.jpg')} alt="" />
      </div>
      <Pied />
      <div className={s.contenu}>
        <div className={s.hospitalInfo}>
          {doc.hopital.logo && <img src={uploadUrl('hospital', doc.hopital.logo)} alt="hôpital" width={100} />}
          <h3>{doc.hopital.nom}</h3>
          <p>Adresse: {doc.hopital.localiteNom ?? doc.hopital.localite}</p>
          <p>Tel: {doc.hopital.contact}</p>
          <p> Date d’édition : {dateCompletFr(o.creeLe ?? o.date)} </p>
        </div>
        <div className={s.ministryLogo}>
          <img src={fichierUploads('republique.png')} alt="" />
        </div>
        <div style={{ clear: 'both' }} />

        <div className={s.headerOrdonnance}>
          <h1>Ordonnance médicale</h1>
        </div>
        <div>
          <p className={s.patientName}>Code du patient : {doc.patient.code}</p>
          <p>
            <strong>Ordonnance n° : </strong> {o.reference}{' '}
          </p>
          <p>
            <strong>Nom du patient : </strong> {doc.patient.nomSeul} {doc.patient.prenom}
          </p>
          <p>
            <strong>Date de naissance :</strong> {doc.patient.naissanceBrute} à {doc.patient.lieuNaissance}{' '}
          </p>
          <p>
            <strong>Adresse :</strong> {doc.patient.adresse}
          </p>
        </div>
        <div className={s.prescriptions}>
          <h2>Médicaments prescrits :</h2>
          <table className={s.prescriptionTable}>
            <thead>
              <tr>
                <th>Nom du médicament</th>
                <th>Dosage</th>
                <th>Quantité</th>
              </tr>
            </thead>
            <tbody>
              {o.medicaments.length === 0 ? (
                <tr>
                  <td colSpan={3}>vide...</td>
                </tr>
              ) : (
                o.medicaments.map((m, i) => (
                  <tr key={i}>
                    <td>{m.nom}</td>
                    <td>{m.posologie}</td>
                    <td>{m.quantite}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className={s.doctorSignature}>
          <p>
            <strong>
              {doc.medecin.nomSeul} {doc.medecin.prenom}
            </strong>
          </p>
          <p>Médecin traitant</p>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// BULLETIN D'EXAMEN MÉDICAL (pdf/examen.blade.php)
// =====================================================================
export function BulletinLaravel({ doc }: { doc: DocumentsConsultation }) {
  const b = doc.examens!;
  return (
    <div className={`${s.page} ${s.arial}`}>
      <div className={s.container}>
        <div className={s.headerSection}>
          <LogoHopital logo={doc.hopital.logo} />
          <div>
            <div style={{ fontSize: 18 }}>
              <h5 className={s.h5}>{doc.hopital.nom}</h5>
            </div>
          </div>
          <br />
          <br />
          <br />
          <h1 className={s.h1}>BULLETIN D’EXAMEN MEDICAL</h1>
          <div className={s.republique}>
            <img src={fichierUploads('republique.png')} alt="" />
          </div>
        </div>

        <div className={s.filigraneBulletin}>
          <img src={filigrane(doc.hopital.filigrane, 'bulletin_examen.png')} alt="" />
        </div>
        <div className={s.section} style={{ marginTop: 20 }}>
          <div className={s.sectionContent}>
            <table className={s.tableBulletin}>
              <tbody>
                <tr>
                  <td>
                    <div>
                      <div style={{ fontSize: 18, marginTop: 7 }}>
                        N° Bulletin : <span style={{ fontWeight: 900 }}>{b.code}</span>
                      </div>
                      <div style={{ fontSize: 18, marginTop: 7 }}>
                        Date : <b>{dateHeureSec(b.date)}</b>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>
                      N° Dossier Médical : <b>{doc.patient.code}</b>
                    </div>
                    <div style={{ marginTop: 7 }}>Nom : {doc.patient.nomSeul}</div>
                    <div style={{ marginTop: 7 }}>Prénom(s) : {doc.patient.prenom}</div>
                    <div style={{ marginTop: 7 }}>
                      <span> Age : {ageAns(doc.patient.naissanceBrute)} ans</span>&nbsp;&nbsp;&nbsp;<span> Sexe : {doc.patient.genre}</span>{' '}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <h4 style={{ marginTop: -30 }}>
                      <u>NATURE DE L&apos;EXAMEN</u>
                    </h4>
                    {b.liste.length === 0 ? (
                      <li className={s.examen}>Liste d&apos;examen vide !</li>
                    ) : (
                      b.liste.map((e, i) => (
                        <ul key={i} className={s.listeExamen}>
                          <li className={s.examen}>{e}</li>
                        </ul>
                      ))
                    )}
                  </td>
                  <td>
                    {Array.from({ length: 8 }, (_, i) => (
                      <p key={i}>&nbsp;&nbsp;</p>
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
            <br />
            <div>
              <p style={{ float: 'right', marginRight: 50 }}>
                <u>Signature et Cachet du Médecin</u>
              </p>
            </div>
            <br />
            <br />
            <br />
          </div>
        </div>
        <Pied />
      </div>
    </div>
  );
}

// =====================================================================
// ARRÊT DE TRAVAIL (pdf/arret.blade.php)
// =====================================================================
export function ArretLaravel({ doc }: { doc: DocumentsConsultation }) {
  const a = doc.arret!;
  const localite = doc.hopital.localiteNom ?? doc.hopital.localite;
  return (
    <div className={`${s.page} ${s.verdana}`}>
      <div className={s.filigraneArret}>
        <img className={s.imgArret} src={filigrane(doc.hopital.filigrane, 'arret.jpg')} alt="" />
      </div>
      <Pied />
      <div className={s.container}>
        <div className={s.headerSection}>
          <LogoHopital logo={doc.hopital.logo} />
          <h1 className={s.h1}>Arrêt de travail</h1>
          <div className={s.republique}>
            <img src={fichierUploads('republique.png')} alt="" />
          </div>
        </div>

        <div className={s.section} style={{ marginTop: 30 }}>
          <div className={s.paragraphes}>
            <p>Formation Sanitaire :&nbsp;&nbsp;&nbsp; {doc.hopital.nom}</p>
            <p>Commune de Naissance : {localite}</p>
            <p>Date : {dateHeureSec(doc.consultation.date)}</p>
            <p>N° Déclaration : {doc.consultation.code}</p>
            <p>
              N° Dossier Medical :<b> {doc.patient.code}</b>
            </p>
          </div>
        </div>

        <div className={s.section} style={{ marginTop: 30 }}>
          <div className={s.sectionContent}>
            <p className={s.content} style={{ marginTop: 20 }}>
              Le {dateCompletFr(a.date)} , à {heureFr(a.date)} à &quot; {doc.hopital.nom} &quot;.
            </p>
            <br />
            <p>
              Je, soussigné(e) Docteur {doc.medecin.nomSeul} , certifie avoir examiner : {doc.patient.genre === 'masculin' ? 'Mr' : 'Mme'} {doc.patient.nomSeul} {doc.patient.prenom} et lui avoir
              prescrit un arrêt de travail de {a.nbJour} jours allant du {dateFr(a.debut)} au {dateFr(a.fin)}, inclus.
            </p>
            <br />
            <br />
            <br />
            <div>
              <p style={{ float: 'right', marginRight: 50 }}>
                Fait à {localite} . Le {aujourdhui()}.
              </p>
            </div>
            <br />
            <br />
            <br />
            <br />
            <div>
              <p style={{ float: 'right', marginRight: 150 }}>Le Médecin :</p>
              <br />
              <br />
              <div style={{ color: 'gray', float: 'right', marginRight: 150 }}>
                {doc.medecin.nomSeul} {doc.medecin.prenom}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Titre du signataire selon le type d'agent (comme Laravel) */
const signataire = (titre: string | null | undefined, defaut = '') =>
  titre === 'Médecin' ? 'Le Médecin :' : titre === 'Sage femme' ? 'La sage femme :' : titre === 'Infirmier' ? "L'infirmier :" : defaut;

// =====================================================================
// CERTIFICAT MÉDICAL DE NAISSANCE (declaration/pdf/naissance.blade.php)
// =====================================================================
export function CertificatNaissanceLaravel({ d }: { d: DeclarationNaissanceDetail }) {
  const italique = { fontSize: 18, fontStyle: 'italic' as const, color: 'rgb(9, 16, 24)' };
  return (
    <div className={`${s.page} ${s.arial}`}>
      <div className={s.filigraneNaissance}>
        <img className={s.imgNaissance} src={fichierUploads('femme.jpg')} alt="" />
      </div>
      <Pied />
      <div className={s.container}>
        <div className={s.headerSection}>
          <div>
            <img src={fichierUploads('ministere.jpg')} alt="" />
          </div>
          <h1 className={s.h1}>Certificat médical de naissance</h1>
          <div className={s.republique}>
            <img src={fichierUploads('republique.png')} alt="" />
          </div>
        </div>

        <div className={s.section} style={{ marginTop: 30 }}>
          <div className={s.paragraphes}>
            <p>Formation Sanitaire : {d.hopital.nom}</p>
            <p>Ville/Commune de Naissance : {d.hopital.localite}</p>
            <p>Date : {dateTirets(d.createdAt)}</p>
            <p>Numéro de Déclaration : {d.referenceCmn}</p>
          </div>
        </div>

        <div className={s.section} style={{ marginTop: 30 }}>
          <div className={s.sectionContent}>
            <p className={s.content} style={{ marginTop: 20 }}>
              Je soussigné(e) <span style={italique}>{d.medecin.nom}</span>,
            </p>
            <p className={s.content} style={{ marginTop: 20 }}>
              certifie que Mme : <span style={italique}>{d.mere.nom}</span>, numéro de dossier médical : {d.mere.code}
            </p>
            <p className={s.content} style={{ marginTop: 20 }}>
              a accouché dans notre établissement sanitaire le : <span style={italique}>{dateTirets(d.dateNaissance)}</span> à{' '}
              <span style={italique}>{heureMinutes(d.heureNaissance)}</span>,
            </p>
            <p className={s.content} style={{ marginTop: 20 }}>
              {d.nombreEnfants === 1
                ? `De ${d.nombreEnfants} enfant ${d.etatNaissance ?? ''}, de sexe ${d.genreEnfant ?? ''}.`
                : `De ${d.nombreEnfants} enfants qui sont du genre de sexe ${d.genreEnfant ?? ''}. Etat des enfants : ${d.etatNaissance ?? ''}.`}
            </p>
            <br />
            <br />
            <br />
            <div>
              <p style={{ float: 'right', marginRight: 50 }}>
                Fait à {d.hopital.localite} . Le {aujourdhui()}.
              </p>
            </div>
            <br />
            <br />
            <br />
            <br />
            <div>
              <p style={{ float: 'right', marginRight: 150 }}>{signataire(d.medecin.titre)}</p>
              <br />
              <br />
              <div style={{ color: 'gray', float: 'right', marginRight: 150 }}>{d.medecin.nom}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// CERTIFICAT MÉDICAL DE DÉCÈS (declaration/pdf/deces.blade.php)
// =====================================================================
export function CertificatDecesLaravel({ d }: { d: DeclarationDecesDetail }) {
  const feminin = (d.patient.genre ?? '').toLowerCase().startsWith('f');
  return (
    <div className={`${s.page} ${s.arial}`}>
      <div className={s.filigraneDeces}>
        <img className={s.imgDeces} src={fichierUploads('deces.jpg')} alt="" />
      </div>
      <Pied />
      <div className={s.container}>
        <div className={s.headerSection}>
          <div>
            <img src={fichierUploads('ministere.jpg')} alt="" />
          </div>
          <h1 className={s.h1}>Certificat médical de décès</h1>
          <div className={s.republique}>
            <img src={fichierUploads('republique.png')} alt="" />
          </div>
        </div>

        <div className={s.section} style={{ marginTop: 30 }}>
          <div className={s.paragraphes}>
            <p>Formation Sanitaire : {d.hopital.nom ?? 'Centre Hospitalier'}</p>
            <p>Ville/Commune de Décès : {d.hopital.localite ?? 'N/A'}</p>
            <p>Date : {dateTirets(d.createdAt)}</p>
            <p>Numéro de Déclaration : {d.reference}</p>
          </div>
        </div>

        <div className={s.section} style={{ marginTop: 30 }}>
          <div className={s.sectionContent}>
            <p className={s.content} style={{ marginTop: 20 }}>
              Le {dateFr(d.createdAt)} à {heureFr(d.createdAt)} - {d.hopital.nom ?? 'Centre Hospitalier'}
            </p>
            {d.personne === 'patient' ? (
              <>
                <p className={s.content} style={{ marginTop: 20 }}>
                  {feminin ? 'est décédée :' : 'est décédé :'} {d.patient.nom}
                  {d.patient.dateNaissance ? ` né(e) le ${d.patient.dateNaissance}` : ''}
                  {d.patient.lieuNaissance ? ` à ${d.patient.lieuNaissance},` : ''}
                </p>
                <p className={s.content} style={{ marginTop: 20 }}>
                  Numéro de dossier médical : {d.patient.code ?? 'N/A'}
                </p>
                <p className={s.content} style={{ marginTop: 20 }}>
                  Circonstance du décès : {d.decesMaternel ? 'Accouchement Difficile' : (d.causeInitiale ?? 'Non précisée')}
                </p>
              </>
            ) : (
              <>
                {(d.genre ?? '').toLowerCase() === 'masculin' ? 'est décédé le nouveau née de :' : 'est décédée le nouveau née de :'} {d.patient.nom}
                {d.patient.dateNaissance ? ` née le ${d.patient.dateNaissance}` : ''}
                {d.patient.lieuNaissance ? ` à ${d.patient.lieuNaissance},` : ''}
              </>
            )}
            <p className={s.content} style={{ marginTop: 20 }}>
              <br />
              Médecin déclarant(e) : {d.medecin.nom}
            </p>
            <br />
            <br />
            <br />
            <div>
              <p style={{ float: 'right', marginRight: 50 }}>
                Fait à {d.hopital.localite ?? "l'hôpital"} . Le {aujourdhui()}.
              </p>
            </div>
            <br />
            <br />
            <br />
            <br />
            <div>
              <p style={{ float: 'right', marginRight: 150 }}>{signataire(d.medecin.titre, 'Le Praticien :')}</p>
              <br />
              <br />
              <div style={{ color: 'gray', float: 'right', marginRight: 150 }}>{d.medecin.nom}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
