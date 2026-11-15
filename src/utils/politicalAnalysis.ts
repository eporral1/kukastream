export type PoliticalSectorId =
  | 'milei'
  | 'kirchnerismo'
  | 'cristina_kirchner'
  | 'pro'
  | 'macri'
  | 'peronismo'
  | 'ucr'
  | 'izquierda';

export type PoliticalStance = 'defendido' | 'atacado' | 'neutral' | 'no_mencionado';

export interface PoliticalSectorAnalysis {
  id: PoliticalSectorId;
  name: string;
  shortName: string;
  stance: PoliticalStance;
  /** De -100 (fuertemente atacado) a +100 (fuertemente defendido) */
  score: number;
  /** De 0 a 100 (protagonismo / intensidad en la transmisión) */
  intensity: number;
  /** Cantidad de menciones directas o implícitas en título y chat */
  mentions: number;
  /** Explicación de cómo es defendido o atacado en el video */
  summary: string;
  /** Coordenadas de referencia del sector en el compás (-100 a +100) */
  refX: number;
  refY: number;
}

export interface PoliticalCompassData {
  /** Eje X (-100 Izquierda / Nac&Pop a +100 Derecha / Libertario) */
  x: number;
  /** Eje Y (-100 Opositor duro a +100 Oficialista / Pro-Gobierno) */
  y: number;
  /** Coordenada X del chat en vivo */
  chat_x: number;
  /** Coordenada Y del chat en vivo */
  chat_y: number;
  /** Etiqueta de la tendencia dominante del video */
  tendency_label: string;
  /** Nivel de polarización del discurso (0 a 100) */
  polarization_score: number;
  /** Confianza del análisis (0 a 100) */
  confidence: number;
}

export interface PoliticalAnalysisResult {
  video_id: string;
  video_title: string;
  channel_name: string;
  channel: string;
  analyzed_at: string;
  compass: PoliticalCompassData;
  executive_summary: string;
  defended_sectors: string[];
  attacked_sectors: string[];
  sectors: PoliticalSectorAnalysis[];
  stats: {
    comments_analyzed: number;
    superchats_analyzed: number;
  };
}

export interface SectorDefinition {
  id: PoliticalSectorId;
  name: string;
  shortName: string;
  refX: number;
  refY: number;
  keywords: string[];
}

export const POLITICAL_SECTORS: SectorDefinition[] = [
  {
    id: 'milei',
    name: 'Javier Milei / La Libertad Avanza',
    shortName: 'Milei',
    refX: 82,
    refY: 85,
    keywords: [
      'milei',
      'javier milei',
      'peluca',
      'leon',
      'león',
      'lla',
      'libertad avanza',
      'libertario',
      'libertarios',
      'vllc',
      'caputo',
      'adorni',
      'karina',
      'motosierra',
      'casta',
      'gobierno',
    ],
  },
  {
    id: 'kirchnerismo',
    name: 'Kirchnerismo',
    shortName: 'Kirchnerismo',
    refX: -68,
    refY: -78,
    keywords: [
      'kirchnerismo',
      'kirchnerista',
      'kirchneristas',
      'kuka',
      'kukas',
      'campora',
      'cámpora',
      'maximo',
      'máximo',
      'kicillof',
      'axel',
      'union por la patria',
      'uxp',
      'frente de todos',
    ],
  },
  {
    id: 'cristina_kirchner',
    name: 'Cristina Kirchner (CFK)',
    shortName: 'Cristina Kirchner',
    refX: -72,
    refY: -82,
    keywords: [
      'cristina',
      'cfk',
      'cristina kirchner',
      'cristina fernandez',
      'jefa',
      'condenada',
      'expresidenta',
      'institutopatria',
    ],
  },
  {
    id: 'pro',
    name: 'PRO (Propuesta Republicana)',
    shortName: 'PRO',
    refX: 48,
    refY: 38,
    keywords: [
      'pro',
      'propuesta republicana',
      'amarillos',
      'bullrich',
      'patricia bullrich',
      'ritondo',
      'santilli',
      'larreta',
      'juntos por el cambio',
      'jxc',
    ],
  },
  {
    id: 'macri',
    name: 'Mauricio Macri',
    shortName: 'Macri',
    refX: 55,
    refY: 30,
    keywords: ['macri', 'mauricio macri', 'macrismo', 'macrista', 'mauricio', 'gato', 'calabrese'],
  },
  {
    id: 'peronismo',
    name: 'Peronismo (PJ)',
    shortName: 'Peronismo',
    refX: -45,
    refY: -55,
    keywords: [
      'peronismo',
      'peronista',
      'peronistas',
      'peron',
      'perón',
      'pj',
      'justicialismo',
      'justicialista',
      'moreno',
      'guillermo moreno',
      'massa',
      'cgt',
      'sindicalismo',
    ],
  },
  {
    id: 'ucr',
    name: 'UCR (Unión Cívica Radical)',
    shortName: 'UCR',
    refX: -5,
    refY: -20,
    keywords: [
      'ucr',
      'radical',
      'radicales',
      'radicalismo',
      'lousteau',
      'lustó',
      'morales',
      'maneke',
      'manes',
      'alfonsin',
      'alfonsín',
      'tetaz',
    ],
  },
  {
    id: 'izquierda',
    name: 'Izquierda (FIT-U)',
    shortName: 'Izquierda',
    refX: -90,
    refY: -88,
    keywords: [
      'izquierda',
      'fit',
      'frente de izquierda',
      'bregman',
      'myriam',
      'del caño',
      'del cano',
      'solano',
      'belliboni',
      'polo obrero',
      'trosko',
      'troskos',
      'socialismo',
    ],
  },
];

interface ChannelBaseline {
  /** Base X (-100 izquierda a +100 derecha/libertario) */
  x: number;
  /** Base Y (-100 opositor a +100 oficialista) */
  y: number;
  tendency: string;
  stances: Record<PoliticalSectorId, number>;
}

/**
 * Perfiles editoriales de referencia conocidos en el ecosistema de streaming argentino,
 * usados para calibrar y complementar el análisis del título y comentarios del video.
 */
const CHANNEL_EDITORIAL_BASELINES: Record<string, ChannelBaseline> = {
  '@carajostream': {
    x: 82,
    y: 86,
    tendency: 'Derecha Libertaria / Oficialista Pro-Milei',
    stances: {
      milei: 88,
      kirchnerismo: -92,
      cristina_kirchner: -90,
      pro: 35,
      macri: 40,
      peronismo: -78,
      ucr: -65,
      izquierda: -94,
    },
  },
  '@neura': {
    x: 52,
    y: 48,
    tendency: 'Liberal / Centro-Derecha Analítico',
    stances: {
      milei: 55,
      kirchnerismo: -75,
      cristina_kirchner: -78,
      pro: 30,
      macri: 32,
      peronismo: -55,
      ucr: -35,
      izquierda: -70,
    },
  },
  '@neuramedia': {
    x: 52,
    y: 48,
    tendency: 'Liberal / Centro-Derecha Analítico',
    stances: {
      milei: 55,
      kirchnerismo: -75,
      cristina_kirchner: -78,
      pro: 30,
      macri: 32,
      peronismo: -55,
      ucr: -35,
      izquierda: -70,
    },
  },
  '@agustinlajeok': {
    x: 88,
    y: 84,
    tendency: 'Nueva Derecha / Libertario Oficialista',
    stances: {
      milei: 92,
      kirchnerismo: -94,
      cristina_kirchner: -92,
      pro: 25,
      macri: 28,
      peronismo: -82,
      ucr: -68,
      izquierda: -96,
    },
  },
  '@breakpointmp': {
    x: 80,
    y: 82,
    tendency: 'Libertario / Pro-Milei',
    stances: {
      milei: 88,
      kirchnerismo: -90,
      cristina_kirchner: -88,
      pro: 30,
      macri: 32,
      peronismo: -80,
      ucr: -60,
      izquierda: -90,
    },
  },
  '@tipitoenojado': {
    x: 74,
    y: 72,
    tendency: 'Liberal / Libertario Crítico de la Oposición',
    stances: {
      milei: 76,
      kirchnerismo: -88,
      cristina_kirchner: -86,
      pro: 20,
      macri: 22,
      peronismo: -75,
      ucr: -55,
      izquierda: -88,
    },
  },
  '@elprestook': {
    x: 68,
    y: 35,
    tendency: 'Derecha Liberal / Anti-Kirchnerista',
    stances: {
      milei: 42,
      kirchnerismo: -92,
      cristina_kirchner: -94,
      pro: 15,
      macri: 18,
      peronismo: -80,
      ucr: -62,
      izquierda: -90,
    },
  },
  '@eldestapetv': {
    x: -72,
    y: -85,
    tendency: 'Nacional y Popular / Kirchnerista Opositor',
    stances: {
      milei: -90,
      kirchnerismo: 82,
      cristina_kirchner: 85,
      pro: -76,
      macri: -84,
      peronismo: 75,
      ucr: -25,
      izquierda: 18,
    },
  },
  '@somosgelatina': {
    x: -66,
    y: -80,
    tendency: 'Progresista / Peronista-Kirchnerista Opositor',
    stances: {
      milei: -86,
      kirchnerismo: 78,
      cristina_kirchner: 82,
      pro: -72,
      macri: -78,
      peronismo: 72,
      ucr: -20,
      izquierda: 22,
    },
  },
  '@futurock': {
    x: -74,
    y: -82,
    tendency: 'Progresismo / Izquierda y Nacional-Popular Opositor',
    stances: {
      milei: -88,
      kirchnerismo: 68,
      cristina_kirchner: 70,
      pro: -75,
      macri: -80,
      peronismo: 58,
      ucr: -30,
      izquierda: 48,
    },
  },
  '@estoesblender': {
    x: -52,
    y: -64,
    tendency: 'Progresista / Centro-Izquierda Opositor',
    stances: {
      milei: -74,
      kirchnerismo: 45,
      cristina_kirchner: 48,
      pro: -58,
      macri: -64,
      peronismo: 42,
      ucr: -15,
      izquierda: 30,
    },
  },
  '@cenitalcom': {
    x: -28,
    y: -45,
    tendency: 'Centro-Progresista / Periodismo Analítico Crítico',
    stances: {
      milei: -58,
      kirchnerismo: 20,
      cristina_kirchner: 15,
      pro: -35,
      macri: -42,
      peronismo: 25,
      ucr: 12,
      izquierda: 15,
    },
  },
  '@radioconvos89.9': {
    x: -22,
    y: -40,
    tendency: 'Centro / Progresismo Moderado Crítico',
    stances: {
      milei: -55,
      kirchnerismo: -15,
      cristina_kirchner: -20,
      pro: -20,
      macri: -28,
      peronismo: -10,
      ucr: 22,
      izquierda: 10,
    },
  },
  '@elobservador107.9': {
    x: 56,
    y: 52,
    tendency: 'Centro-Derecha / Republicano y Liberal',
    stances: {
      milei: 58,
      kirchnerismo: -82,
      cristina_kirchner: -85,
      pro: 64,
      macri: 66,
      peronismo: -68,
      ucr: -10,
      izquierda: -78,
    },
  },
  '@longobardim': {
    x: 35,
    y: -25,
    tendency: 'Centro-Derecha Institucional / Republicano Crítico',
    stances: {
      milei: -38,
      kirchnerismo: -78,
      cristina_kirchner: -82,
      pro: 52,
      macri: 48,
      peronismo: -65,
      ucr: 30,
      izquierda: -70,
    },
  },
  '@santiagocuneo_oficial': {
    x: -35,
    y: -78,
    tendency: 'Nacionalismo Peronista Opositor',
    stances: {
      milei: -88,
      kirchnerismo: 15,
      cristina_kirchner: 20,
      pro: -80,
      macri: -85,
      peronismo: 82,
      ucr: -60,
      izquierda: -35,
    },
  },
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

export function scoreToStance(score: number, mentions: number, intensity: number): PoliticalStance {
  if (intensity < 12 && mentions === 0 && Math.abs(score) < 18) {
    return 'no_mencionado';
  }
  if (score >= 20) return 'defendido';
  if (score <= -20) return 'atacado';
  return 'neutral';
}

export function buildSectorSummary(
  sector: SectorDefinition,
  stance: PoliticalStance,
  score: number,
  channelName: string,
  videoTitle: string
): string {
  const abs = Math.abs(score);
  const strength = abs >= 70 ? 'fuerte' : abs >= 40 ? 'clara' : 'moderada';

  if (stance === 'defendido') {
    switch (sector.id) {
      case 'milei':
        return `Defensa ${strength} a la gestión de Javier Milei, el rumbo económico oficialista y las reformas de La Libertad Avanza en "${videoTitle}".`;
      case 'kirchnerismo':
        return `Postura ${strength} de respaldo a las banderas del Kirchnerismo y reivindicación de su espacio político frente al oficialismo.`;
      case 'cristina_kirchner':
        return `Defensa ${strength} a la figura y liderazgo político de Cristina Fernández de Kirchner en las intervenciones de ${channelName}.`;
      case 'pro':
        return `Valoración positiva y defensa ${strength} de dirigentes y posturas legislativas/institucionales del PRO.`;
      case 'macri':
        return `Respaldo y valoración ${strength} hacia la figura de Mauricio Macri y su visión económica e institucional.`;
      case 'peronismo':
        return `Defensa ${strength} de la doctrina, gobernadores o referentes del Peronismo como alternativa política.`;
      case 'ucr':
        return `Defensa ${strength} de la institucionalidad radical (UCR), universidades públicas y posturas de centro republicano.`;
      case 'izquierda':
        return `Acompañamiento y defensa ${strength} a los reclamos sociales, gremiales y parlamentarios del Frente de Izquierda.`;
    }
  }

  if (stance === 'atacado') {
    switch (sector.id) {
      case 'milei':
        return `Cuestionamiento y crítica ${strength} a las medidas económicas, estilo discursivo y gestión del gobierno de Javier Milei.`;
      case 'kirchnerismo':
        return `Crítica ${strength} y cuestionamientos directos al Kirchnerismo, su gestión histórica y sus referentes actuales.`;
      case 'cristina_kirchner':
        return `Cuestionamiento ${strength} a Cristina Fernández de Kirchner, sus causas judiciales y su rol en la política nacional.`;
      case 'pro':
        return `Críticas de intensidad ${strength} al rol político del PRO, sus alianzas parlamentarias y su interna partidaria.`;
      case 'macri':
        return `Cuestionamiento ${strength} a Mauricio Macri, su gobierno 2015-2019 y sus posicionamientos políticos actuales.`;
      case 'peronismo':
        return `Crítica ${strength} al Peronismo tradicional, dirigencia sindical y estructura partidaria del PJ.`;
      case 'ucr':
        return `Cuestionamiento ${strength} a la dirigencia de la UCR por sus votaciones legislativas y posturas consideradas ambiguas.`;
      case 'izquierda':
        return `Rechazo y crítica ${strength} a las propuestas económicas, cortes de calle y posturas del Frente de Izquierda.`;
    }
  }

  if (stance === 'neutral') {
    return `Abordaje analítico o con opiniones divididas sobre ${sector.name} durante el debate del programa y la participación del chat.`;
  }

  return `Sin menciones centrales ni ataques/defensas directas hacia ${sector.name} en el corte analizado.`;
}

/**
 * Genera un análisis político completo y determinístico a partir de los metadatos del video
 * y los comentarios/superchats reales de la base de datos.
 */
export function buildDeterministicPoliticalAnalysis(params: {
  video_id: string;
  video_title: string;
  channel_name: string;
  channel: string;
  channel_description?: string;
  comments: Array<{ comment_text?: string }>;
  superchats: Array<{ superchat_text?: string }>;
}): PoliticalAnalysisResult {
  const {
    video_id,
    video_title,
    channel_name,
    channel,
    channel_description = '',
    comments = [],
    superchats = [],
  } = params;

  const handleKey = (channel || '').toLowerCase().trim();
  const baseline: ChannelBaseline = CHANNEL_EDITORIAL_BASELINES[handleKey] || {
    x: 0,
    y: 0,
    tendency: 'Debate Plural / Analítico de Actualidad',
    stances: {
      milei: 0,
      kirchnerismo: 0,
      cristina_kirchner: 0,
      pro: 0,
      macri: 0,
      peronismo: 0,
      ucr: 0,
      izquierda: 0,
    },
  };

  const fullTextCorpus = [
    video_title,
    video_title, // Doble peso al título del video
    channel_description,
    ...comments.map((c) => c.comment_text || ''),
    ...superchats.map((s) => s.superchat_text || ''),
  ]
    .join(' \n ')
    .toLowerCase();

  const positiveWords = [
    'grande',
    'genio',
    'vllc',
    'vamos',
    'aguante',
    'mejor',
    'apoyo',
    'bien',
    'excelente',
    'crack',
    'fenomeno',
    'fenómeno',
    'verdad',
    'libertad',
    'jefa',
    'conductor',
  ];
  const negativeWords = [
    'chorro',
    'chorros',
    'kuka',
    'kukas',
    'casta',
    'desastre',
    'mentira',
    'basura',
    'corrupto',
    'corrupta',
    'vende patria',
    'vendepatria',
    'ajuste',
    'hambre',
    'circo',
    'fracaso',
    'traidor',
    'delincuente',
  ];

  const sectors: PoliticalSectorAnalysis[] = POLITICAL_SECTORS.map((def) => {
    let mentions = 0;
    for (const kw of def.keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = fullTextCorpus.match(regex);
      if (matches) {
        mentions += matches.length;
      }
    }

    // Score base del perfil editorial del canal + ajuste por título/comentarios
    let score = baseline.stances[def.id] ?? 0;

    // Si no hay baseline fuerte para el canal, inferir por palabras clave del título y chat
    if (score === 0 && mentions > 0) {
      let posHits = 0;
      let negHits = 0;
      for (const pw of positiveWords) {
        if (fullTextCorpus.includes(pw)) posHits++;
      }
      for (const nw of negativeWords) {
        if (fullTextCorpus.includes(nw)) negHits++;
      }
      if (def.id === 'milei' && fullTextCorpus.includes('vllc')) {
        score += 55;
      } else if ((def.id === 'kirchnerismo' || def.id === 'cristina_kirchner') && fullTextCorpus.includes('kuka')) {
        score -= 55;
      } else {
        score = clamp((posHits - negHits) * 14, -75, 75);
      }
    } else if (mentions > 0) {
      // Amplificar levemente si el sector es muy mencionado en este video específico
      const boost = Math.min(12, Math.floor(mentions * 1.5));
      score = score >= 0 ? clamp(score + boost, -100, 100) : clamp(score - boost, -100, 100);
    }

    const intensity = clamp(
      Math.max(Math.abs(score) * 0.85, Math.min(100, mentions * 12 + (Math.abs(score) > 25 ? 30 : 10))),
      5,
      100
    );

    const stance = scoreToStance(score, mentions, intensity);
    const summary = buildSectorSummary(def, stance, score, channel_name, video_title);

    return {
      id: def.id,
      name: def.name,
      shortName: def.shortName,
      stance,
      score,
      intensity,
      mentions,
      summary,
      refX: def.refX,
      refY: def.refY,
    };
  });

  // Calcular coordenadas del compás en base a los puntajes de los 8 sectores
  let weightedX = baseline.x;
  let weightedY = baseline.y;

  const mileiScore = sectors.find((s) => s.id === 'milei')?.score || 0;
  const kScore = sectors.find((s) => s.id === 'kirchnerismo')?.score || 0;
  const cfkScore = sectors.find((s) => s.id === 'cristina_kirchner')?.score || 0;
  const proScore = sectors.find((s) => s.id === 'pro')?.score || 0;
  const macriScore = sectors.find((s) => s.id === 'macri')?.score || 0;
  const pjScore = sectors.find((s) => s.id === 'peronismo')?.score || 0;
  const izqScore = sectors.find((s) => s.id === 'izquierda')?.score || 0;

  if (weightedX === 0 && weightedY === 0) {
    weightedX = clamp(
      mileiScore * 0.45 +
        proScore * 0.2 +
        macriScore * 0.2 -
        kScore * 0.35 -
        cfkScore * 0.25 -
        pjScore * 0.2 -
        izqScore * 0.3,
      -95,
      95
    );
    weightedY = clamp(
      mileiScore * 0.65 + proScore * 0.15 - kScore * 0.4 - cfkScore * 0.3 - izqScore * 0.25,
      -95,
      95
    );
  }

  const chatX = clamp(weightedX + (fullTextCorpus.includes('vllc') ? 10 : 0) - (fullTextCorpus.includes('ajuste') ? 10 : 0), -98, 98);
  const chatY = clamp(weightedY + (fullTextCorpus.includes('leon') ? 8 : 0) - (fullTextCorpus.includes('paro') ? 8 : 0), -98, 98);

  const defended = sectors.filter((s) => s.stance === 'defendido').map((s) => s.shortName);
  const attacked = sectors.filter((s) => s.stance === 'atacado').map((s) => s.shortName);

  const maxAbsScore = Math.max(...sectors.map((s) => Math.abs(s.score)), 20);
  const polarization = clamp(maxAbsScore, 15, 96);

  let tendencyLabel = baseline.tendency;
  if (weightedX >= 45 && weightedY >= 40) {
    tendencyLabel = 'Derecha Libertaria / Oficialista (Pro-Milei)';
  } else if (weightedX >= 25 && weightedY < 40) {
    tendencyLabel = 'Centro-Derecha / Republicano (Afín a PRO-Macri)';
  } else if (weightedX <= -40 && weightedY <= -40) {
    tendencyLabel = 'Nacional y Popular / Kirchnerista Opositor';
  } else if (weightedX <= -20 && weightedY < 0) {
    tendencyLabel = 'Centro-Izquierda / Progresismo Crítico';
  } else if (Math.abs(weightedX) < 25 && Math.abs(weightedY) < 25) {
    tendencyLabel = 'Centro / Debate Plural y Analítico';
  }

  const defendedStr =
    defended.length > 0 ? `defiende principalmente a **${defended.join(', ')}**` : 'mantiene una postura sin defensa partidaria explícita';
  const attackedStr =
    attacked.length > 0 ? `mientras que cuestiona o ataca a **${attacked.join(', ')}**` : 'con bajo nivel de confrontación directa';

  const executiveSummary = `El análisis del video "${video_title}" en ${channel_name} ubica la línea de opinión en el cuadrante "${tendencyLabel}" (Eje Izquierda-Derecha: ${weightedX > 0 ? `+${weightedX}` : weightedX}, Eje Oposición-Oficialismo: ${weightedY > 0 ? `+${weightedY}` : weightedY}). El discurso ${defendedStr}, ${attackedStr}.`;

  return {
    video_id,
    video_title,
    channel_name,
    channel,
    analyzed_at: new Date().toISOString(),
    compass: {
      x: weightedX,
      y: weightedY,
      chat_x: chatX,
      chat_y: chatY,
      tendency_label: tendencyLabel,
      polarization_score: polarization,
      confidence: comments.length > 10 ? 92 : 84,
    },
    executive_summary: executiveSummary,
    defended_sectors: defended,
    attacked_sectors: attacked,
    sectors,
    stats: {
      comments_analyzed: comments.length,
      superchats_analyzed: superchats.length,
    },
  };
}
