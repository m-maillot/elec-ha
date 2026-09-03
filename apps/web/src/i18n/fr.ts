/** Chaînes de l'interface (français). Externalisées pour une éventuelle traduction. */
export const t = {
  app: {
    title: 'elec-ha',
    subtitle: 'Comparateur Base / HP-HC / Tempo',
    nav: { home: 'Comparateur', settings: 'Configuration' },
    loading: 'Chargement…',
    save: 'Enregistrer',
    saved: 'Enregistré.',
    test: 'Tester',
    add: 'Ajouter',
    remove: 'Supprimer',
    errorPrefix: 'Erreur : ',
  },
  options: { base: 'Base', hphc: 'HP / HC', tempo: 'Tempo' } as const,
  colors: { blue: 'Bleu', white: 'Blanc', red: 'Rouge' } as const,
  home: {
    title: 'Comparateur',
    placeholder: 'L’écran principal arrive au lot 5.',
  },
  settings: {
    title: 'Configuration',
    welcome:
      'Bienvenue ! Pour commencer, connectez votre instance Home Assistant, choisissez l’entité de consommation et renseignez votre grille tarifaire.',
    ha: {
      title: 'Connexion Home Assistant',
      description: 'URL de l’instance et token longue durée (créé dans votre profil HA).',
      url: 'URL de l’instance',
      urlPlaceholder: 'http://homeassistant.local:8123',
      token: 'Token longue durée',
      tokenSet: 'Token défini – laissez vide pour le conserver',
      tokenPlaceholder: 'Collez le token ici',
      testButton: 'Tester la connexion',
      testing: 'Test en cours…',
      testOk: (version: string, n: number, total: number) =>
        `Connecté à Home Assistant ${version} – ${n} entité(s) éligible(s) sur ${total} statistique(s).`,
      entities: 'Entités de consommation',
      entitiesHelp:
        'Cochez une ou plusieurs entités (statistiques long terme en kWh / Wh). Plusieurs entités sont additionnées heure par heure, par exemple un index HP et un index HC.',
      entitiesEmpty: 'Testez la connexion pour lister les entités éligibles.',
      entitiesSelected: (n: number) => `${n} entité(s) sélectionnée(s)`,
      entitiesNone: 'Aucune entité sélectionnée : la synchronisation ne pourra pas démarrer.',
    },
    tariff: {
      title: 'Puissance souscrite et grille tarifaire',
      description: 'Prix en € TTC : 4 décimales pour le kWh, 2 pour l’abonnement annuel.',
      power: 'Puissance souscrite',
      validFrom: 'En vigueur depuis (informatif)',
      prefill: 'Pré-remplir avec le Tarif Bleu au 01/08/2026',
      prefillNone: 'Pas de valeurs par défaut pour cette puissance.',
      prefillWarning:
        'Valeurs publiques indicatives, à vérifier : vous restez responsable de votre grille.',
      subscription: 'Abonnement annuel (€)',
      kwh: 'Prix du kWh (€)',
      hp: 'kWh HP (€)',
      hc: 'kWh HC (€)',
      tempo: {
        blueHp: 'Bleu HP',
        blueHc: 'Bleu HC',
        whiteHp: 'Blanc HP',
        whiteHc: 'Blanc HC',
        redHp: 'Rouge HP',
        redHc: 'Rouge HC',
      },
      invalid: 'Tous les prix doivent être des nombres positifs.',
    },
    offpeak: {
      title: 'Créneaux heures creuses',
      description:
        'Plages [début, fin[ au pas de 30 minutes, en heure locale. Elles peuvent chevaucher minuit.',
      hphc: 'Créneaux HC de l’option HP / HC',
      tempo: 'Créneaux HC de l’option Tempo (national : 22:00–06:00)',
      start: 'Début',
      end: 'Fin',
      addRange: 'Ajouter une plage',
      total: (d: string) => `Total : ${d} par jour`,
    },
    tempo: {
      title: 'Source des couleurs Tempo',
      description:
        'L’API officielle RTE est recommandée (compte gratuit sur data.rte-france.com, abonnement à l’API « Tempo Like Supply Contract », puis création d’une application).',
      source: 'Source',
      sources: {
        rte: 'API RTE (recommandé)',
        csv: 'Import CSV uniquement',
      },
      clientId: 'client_id',
      clientSecret: 'client_secret',
      secretSet: 'Secret défini – laissez vide pour le conserver',
      testRte: 'Tester l’API RTE',
      testRteOk: (date: string, color: string | null) =>
        color
          ? `Jeton obtenu – couleur du ${date} : ${color}.`
          : `Jeton obtenu – couleur du ${date} non publiée.`,
      csv: {
        title: 'Import CSV (mode de secours)',
        help: 'Une ligne par jour : date;couleur (ex. 2026-01-15;rouge). Formats acceptés : AAAA-MM-JJ ou JJ/MM/AAAA, bleu/blanc/rouge.',
        placeholder: '2026-01-15;rouge\n2026-01-16;blanc',
        overwrite: 'Écraser les dates déjà connues',
        import: 'Importer',
        result: (imported: number, skipped: number) =>
          `${imported} jour(s) importé(s), ${skipped} ignoré(s) (déjà connus).`,
      },
    },
    advanced: {
      title: 'Paramètres avancés',
      description: 'Les valeurs par défaut conviennent dans la plupart des cas.',
      currentOption: 'Option tarifaire actuelle',
      colorSwitchHour: 'Heure de bascule de la couleur Tempo',
      smoothingRefDays: 'Jours de référence de chaque côté (lissage)',
      smoothingSearchWindowDays: 'Fenêtre de recherche (jours, lissage)',
    },
  },
  errors: {
    generic: 'Une erreur est survenue.',
    network: 'Le serveur est injoignable.',
    codes: {
      ha_unauthorized: 'Token Home Assistant refusé (401). Vérifiez le token.',
      ha_unreachable: 'Home Assistant est injoignable. Vérifiez l’URL et le réseau.',
      ha_protocol: 'Réponse inattendue de Home Assistant.',
      rte_unauthorized: 'Identifiants RTE refusés.',
      rte_quota: 'Quota de l’API RTE dépassé, réessayez plus tard.',
      rte_unreachable: 'API RTE injoignable.',
      not_configured: 'Configuration incomplète.',
      validation: 'Données invalides.',
    } as Record<string, string>,
  },
};
