import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { FaSave, FaSpinner } from 'react-icons/fa';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, localAssetUrl } from '../../../services/api';
import { chargerIcones } from '../../../services/icones';
import type { IconesInfo } from '../../../types';
import styles from './Icones.module.css';

/**
 * SUPER > RÉGLAGES > ICÔNES
 * Équivalent Laravel : super.setting.icon (users/super/setting/logo.blade.php)
 * Gestion du logo, de l'icône de chargement et du favicon.
 */
export default function Icones() {
  const [icones, setIcones] = useState<IconesInfo | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);

  // Fichiers sélectionnés pour modification
  const [logoFichier, setLogoFichier] = useState<File | null>(null);
  const [loadingFichier, setLoadingFichier] = useState<File | null>(null);
  const [faviconFichier, setFaviconFichier] = useState<File | null>(null);

  // URL d'aperçu temporaire
  const [logoApercu, setLogoApercu] = useState<string | null>(null);
  const [loadingApercu, setLoadingApercu] = useState<string | null>(null);
  const [faviconApercu, setFaviconApercu] = useState<string | null>(null);

  const inputLogoRef = useRef<HTMLInputElement>(null);
  const inputLoadingRef = useRef<HTMLInputElement>(null);
  const inputFaviconRef = useRef<HTMLInputElement>(null);

  // Charger les icônes actuelles
  const recharger = () => {
    setChargement(true);
    api.super.reglages
      .getIcones()
      .then((data: IconesInfo) => {
        setIcones(data);
      })
      .catch((e: unknown) => {
        alerte.echec(`Impossible de charger les icônes : ${messageErreur(e)}`);
      })
      .finally(() => setChargement(false));
  };

  useEffect(() => {
    recharger();
  }, []);

  // Gestion du choix de fichier avec aperçu
  const onChoisirFichier = (type: 'logo' | 'loading' | 'favicon', file: File | null) => {
    if (type === 'logo') {
      if (logoApercu) URL.revokeObjectURL(logoApercu);
      setLogoFichier(file);
      setLogoApercu(file ? URL.createObjectURL(file) : null);
    } else if (type === 'loading') {
      if (loadingApercu) URL.revokeObjectURL(loadingApercu);
      setLoadingFichier(file);
      setLoadingApercu(file ? URL.createObjectURL(file) : null);
    } else {
      if (faviconApercu) URL.revokeObjectURL(faviconApercu);
      setFaviconFichier(file);
      setFaviconApercu(file ? URL.createObjectURL(file) : null);
    }
  };

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!logoFichier && !loadingFichier && !faviconFichier) {
      alerte.echec('Veuillez sélectionner au moins un fichier à enregistrer.');
      return;
    }

    const formData = new FormData();
    if (logoFichier) formData.append('logo', logoFichier);
    if (loadingFichier) formData.append('loading', loadingFichier);
    if (faviconFichier) formData.append('favicon', faviconFichier);

    setEnCours(true);
    try {
      const res = await api.super.reglages.updateIcones(formData);
      alerte.succes(res.message);

      // Réinitialiser les champs de fichiers
      if (inputLogoRef.current) inputLogoRef.current.value = '';
      if (inputLoadingRef.current) inputLoadingRef.current.value = '';
      if (inputFaviconRef.current) inputFaviconRef.current.value = '';

      if (logoApercu) URL.revokeObjectURL(logoApercu);
      if (loadingApercu) URL.revokeObjectURL(loadingApercu);
      if (faviconApercu) URL.revokeObjectURL(faviconApercu);

      setLogoFichier(null);
      setLoadingFichier(null);
      setFaviconFichier(null);
      setLogoApercu(null);
      setLoadingApercu(null);
      setFaviconApercu(null);

      // Met à jour les icônes actuelles avec timestamp pour forcer le rafraîchissement
      setIcones(res.icons);
      // Applique tout de suite les nouvelles icônes à tout le site (favicon, logo, loader)
      chargerIcones();
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const formatTaille = (octets: number) => {
    if (octets < 1024) return `${octets} o`;
    if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
    return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
  };

  return (
    <motion.section
      className={styles.page}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={styles.carte}>
        <div className={styles.carteHeader}>Changer le logo et favicon</div>

        <div className={styles.carteBody}>
          {/* --- 1. Informations actuelles --- */}
          <div className={styles.section}>
            <div className={styles.sectionTitre}>Informations actuelles</div>

            {chargement ? (
              <p className={styles.chargement}>Chargement des icônes…</p>
            ) : (
              <div className={styles.grille3}>
                {/* Icône de la page */}
                <div className={styles.boiteIcone}>
                  <div className={styles.titreIcone}>Icône de la page</div>
                  <div className={styles.zoneImage}>
                    {icones?.logo ? (
                      <img
                        className={styles.imageActuelle}
                        src={`${localAssetUrl(icones.logo)}?v=${icones.updatedAt}`}
                        alt="Logo de la page"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className={styles.placeholder}>Aucun logo défini</span>
                    )}
                  </div>
                </div>

                {/* Icône de chargement */}
                <div className={styles.boiteIcone}>
                  <div className={styles.titreIcone}>Icône pendant le chargement des pages</div>
                  <div className={styles.zoneImage}>
                    {icones?.loading ? (
                      <img
                        className={styles.imageActuelle}
                        src={`${localAssetUrl(icones.loading)}?v=${icones.updatedAt}`}
                        alt="Icône chargement"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className={styles.placeholder}>Aucune icône définie</span>
                    )}
                  </div>
                </div>

                {/* Favicon */}
                <div className={styles.boiteIcone}>
                  <div className={styles.titreIcone}>Favicon</div>
                  <div className={styles.zoneImage}>
                    {icones?.favicon ? (
                      <img
                        className={styles.imageActuelle}
                        src={`${localAssetUrl(icones.favicon)}?v=${icones.updatedAt}`}
                        alt="Favicon"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className={styles.placeholder}>Aucun favicon défini</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* --- 2. Modifier les données --- */}
          <form onSubmit={soumettre} className={styles.section}>
            <div className={styles.sectionTitre}>Modifier les données</div>

            <div className={styles.grille3}>
              {/* Modifier Icône de la page */}
              <div className={styles.boiteIcone}>
                <div className={styles.titreIcone}>Icône de la page</div>
                <div className={styles.zoneUpload}>
                  <input
                    ref={inputLogoRef}
                    type="file"
                    name="logo"
                    accept="image/png"
                    className={styles.champFichier}
                    onChange={(e) => onChoisirFichier('logo', e.target.files?.[0] ?? null)}
                    aria-label="Choisir l'icône de la page (PNG)"
                  />
                  <span className={styles.aideFichier}>Format accepté : PNG</span>

                  {logoApercu && logoFichier && (
                    <div className={styles.apercuNouveau}>
                      <img src={logoApercu} alt="Aperçu logo" className={styles.miniature} />
                      <div className={styles.infosFichier}>
                        <span className={styles.nomFichier}>{logoFichier.name}</span>
                        <span className={styles.tailleFichier}>{formatTaille(logoFichier.size)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modifier Icône chargement */}
              <div className={styles.boiteIcone}>
                <div className={styles.titreIcone}>Icône pendant le chargement des pages</div>
                <div className={styles.zoneUpload}>
                  <input
                    ref={inputLoadingRef}
                    type="file"
                    name="loading"
                    accept="image/png"
                    className={styles.champFichier}
                    onChange={(e) => onChoisirFichier('loading', e.target.files?.[0] ?? null)}
                    aria-label="Choisir l'icône de chargement (PNG)"
                  />
                  <span className={styles.aideFichier}>Format accepté : PNG</span>

                  {loadingApercu && loadingFichier && (
                    <div className={styles.apercuNouveau}>
                      <img src={loadingApercu} alt="Aperçu chargement" className={styles.miniature} />
                      <div className={styles.infosFichier}>
                        <span className={styles.nomFichier}>{loadingFichier.name}</span>
                        <span className={styles.tailleFichier}>{formatTaille(loadingFichier.size)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modifier Favicon */}
              <div className={styles.boiteIcone}>
                <div className={styles.titreIcone}>Favicon</div>
                <div className={styles.zoneUpload}>
                  <input
                    ref={inputFaviconRef}
                    type="file"
                    name="favicon"
                    accept=".ico,image/png,image/jpeg,image/svg+xml"
                    className={styles.champFichier}
                    onChange={(e) => onChoisirFichier('favicon', e.target.files?.[0] ?? null)}
                    aria-label="Choisir le favicon (.ico, PNG, JPG, SVG)"
                  />
                  <span className={styles.aideFichier}>Formats : ICO, PNG, JPG, JPEG, SVG</span>

                  {faviconApercu && faviconFichier && (
                    <div className={styles.apercuNouveau}>
                      <img src={faviconApercu} alt="Aperçu favicon" className={styles.miniature} />
                      <div className={styles.infosFichier}>
                        <span className={styles.nomFichier}>{faviconFichier.name}</span>
                        <span className={styles.tailleFichier}>{formatTaille(faviconFichier.size)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.actionsFooter}>
              <button
                type="submit"
                className={styles.boutonEnregistrer}
                disabled={enCours || (!logoFichier && !loadingFichier && !faviconFichier)}
              >
                {enCours ? (
                  <>
                    <FaSpinner className="spin" aria-hidden="true" /> Enregistrement…
                  </>
                ) : (
                  <>
                    <FaSave aria-hidden="true" /> Enregistrer
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </motion.section>
  );
}
