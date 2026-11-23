export type HateSpeechSeverity = 'alto' | 'medio' | 'bajo' | 'ninguno';

export type HateSpeechCategoryId =
  | 'insultos_agresiones'
  | 'odio_politico_partidario'
  | 'discriminacion_xenofobia'
  | 'amenazas_violencia'
  | 'acoso_deshumanizacion';

export interface HateSpeechCategoryDef {
  id: HateSpeechCategoryId;
  name: string;
  shortName: string;
  description: string;
  keywords: string[];
}

export interface HateTargetGroupDef {
  id: string;
  label: string;
  keywords: string[];
  inherentHateSlurs: string[]; // Slurs that both name the group/person and express hate simultaneously
}

export interface AnalyzedVideoMessage {
  id: string;
  author_id: string;
  comment_text: string;
  created_at: string;
  source: 'comment' | 'superchat';
  amount?: number;
  currency?: string;
  is_hate_speech: boolean;
  severity: HateSpeechSeverity;
  hate_score: number; // 0 to 100
  categories: HateSpeechCategoryId[];
  matched_terms: string[];
  hate_targets: string[]; // Grupos o personas explícitamente mencionados en el mensaje de odio
  reason?: string;
}

export interface HateSpeechCategoryBreakdown {
  id: HateSpeechCategoryId;
  name: string;
  shortName: string;
  count: number;
  percentage_of_hate: number;
  percentage_of_total: number;
}

export interface HateSpeechTargetBreakdown {
  target: string;
  count: number;
  percentage_of_hate: number;
  percentage_of_total: number;
}

export interface HateSpeechAuthorSummary {
  author_id: string;
  total_messages: number;
  hate_messages: number;
  hate_percentage: number;
  max_severity: HateSpeechSeverity;
  targets: string[];
}

export interface HateSpeechAnalysisResult {
  video_id: string;
  video_title: string;
  channel_name: string;
  channel: string;
  is_eternal: boolean;
  start_date?: string | null;
  end_date?: string | null;
  analyzed_at: string;
  summary: {
    total_messages: number;
    total_comments: number;
    total_superchats: number;
    hate_messages_count: number;
    clean_messages_count: number;
    hate_percentage: number;
    toxicity_index: number; // 0 to 100
    toxicity_level: 'Bajo' | 'Moderado' | 'Alto' | 'Crítico';
    high_severity_count: number;
    medium_severity_count: number;
    low_severity_count: number;
    executive_summary: string;
  };
  categories_breakdown: HateSpeechCategoryBreakdown[];
  targets_breakdown: HateSpeechTargetBreakdown[];
  top_hate_authors: HateSpeechAuthorSummary[];
  messages: AnalyzedVideoMessage[];
}

/**
 * Grupos o personas destinatarias del discurso de odio.
 * Un mensaje SOLO se contabiliza como mensaje de odio si:
 *  1) Menciona explícitamente a un grupo o persona destinataria (por nombre, colectivo, @mención o epíteto grupal directo), Y
 *  2) Contiene una expresión de odio, insulto, amenaza, deshumanización o discriminación dirigida contra ese grupo o persona.
 */
export const HATE_TARGET_GROUPS: HateTargetGroupDef[] = [
  {
    id: 'milei_libertarios',
    label: 'Milei / Libertarios / Gobierno',
    keywords: [
      'milei',
      'javier milei',
      'peluca',
      'javo',
      'karina',
      'karina milei',
      'adorni',
      'caputo',
      'toto caputo',
      'santiago caputo',
      'bullrich',
      'patricia bullrich',
      'sturzenegger',
      'villarruel',
      'espert',
      'mondino',
      'menem',
      'martin menem',
      'lule menem',
      'libertario',
      'libertarios',
      'libertaria',
      'libertarias',
      'lla',
      'la libertad avanza',
      'oficialismo',
      'oficialistas',
      'gobierno',
      'presidente',
    ],
    inherentHateSlurs: [
      'libervirgo',
      'libervirgos',
      'libertarado',
      'libertarados',
      'libertonto',
      'libertontos',
      'liberotario',
      'liberotarios',
      'virgocho',
      'virgochos',
      'troll libertario',
      'trolls libertarios',
    ],
  },
  {
    id: 'kirchnerismo_peronismo',
    label: 'Kirchnerismo / Peronismo / CFK',
    keywords: [
      'kirchner',
      'nestor',
      'cristina',
      'cfk',
      'kirchnerismo',
      'kirchnerista',
      'kirchneristas',
      'peronismo',
      'peronista',
      'peronistas',
      'peroncho',
      'peronchos',
      'kicillof',
      'axel',
      'maximo',
      'maximo kirchner',
      'massa',
      'sergio massa',
      'alberto',
      'alberto fernandez',
      'grabois',
      'moreno',
      'guillermo moreno',
      'mayra',
      'insaurralde',
      'zaracho',
      'belliboni',
      'campora',
      'la campora',
      'camporista',
      'camporistas',
      'pj',
      'union por la patria',
      'uxp',
    ],
    inherentHateSlurs: [
      'kuka',
      'kukas',
      'kukardo',
      'kukardos',
      'kukaracha',
      'kukarachas',
      'polentero',
      'polenteros',
      'kircho',
      'kirchos',
    ],
  },
  {
    id: 'macrismo_pro',
    label: 'Macri / PRO',
    keywords: [
      'macri',
      'mauricio macri',
      'macrismo',
      'macrista',
      'macristas',
      'pro',
      'larreta',
      'jorge macri',
      'vidal',
      'maria eugenia vidal',
      'santilli',
      'ritondo',
      'lospennato',
      'juntos por el cambio',
      'jxc',
    ],
    inherentHateSlurs: [
      'globoludo',
      'globoludos',
      'amarillo',
      'amarillos',
    ],
  },
  {
    id: 'ucr_radicalismo',
    label: 'UCR / Radicales',
    keywords: [
      'ucr',
      'radical',
      'radicales',
      'radicalismo',
      'lousteau',
      'martin lousteau',
      'morales',
      'gerardo morales',
      'manoe',
      'manes',
      'facundo manes',
      'tetaz',
      'de loredo',
      'cobos',
    ],
    inherentHateSlurs: [
      'radicheta',
      'radichetas',
    ],
  },
  {
    id: 'izquierda_fit',
    label: 'Izquierda / Zurdos / Sindicatos',
    keywords: [
      'izquierda',
      'fit',
      'frente de izquierda',
      'bregman',
      'myriam bregman',
      'del cano',
      'nicolas del cano',
      'solano',
      'biasi',
      'castillo',
      'polo obrero',
      'piquetero',
      'piqueteros',
      'sindicalista',
      'sindicalistas',
      'cgt',
      'moyano',
      'baradel',
      'comunista',
      'comunistas',
      'socialista',
      'socialistas',
      'trosko',
      'troskos',
      'zurdo',
      'zurdos',
      'zurda',
      'zurdas',
      'progre',
      'progres',
      'wokismo',
      'woke',
    ],
    inherentHateSlurs: [
      'zurdo de mierda',
      'zurdos de mierda',
      'zurdaje',
      'planero',
      'planeros',
      'planera',
      'planeras',
    ],
  },
  {
    id: 'periodistas_conductores',
    label: 'Periodistas / Conductores / Panelistas',
    keywords: [
      'periodista',
      'periodistas',
      'periodismo',
      'conductor',
      'conductora',
      'conductores',
      'panelista',
      'panelistas',
      'operador',
      'operadores',
      'medios',
      'canal',
      'rebord',
      'tomas rebord',
      'fantino',
      'alejandro fantino',
      'feinmann',
      'viale',
      'jonatan viale',
      'majul',
      'novaresio',
      'trebucq',
      'pelado',
      'pagni',
      'lanata',
      'longobardi',
      'canosa',
      'viviana canosa',
      'riial',
      'rial',
      'jorge rial',
      'navarro',
      'roberto navarro',
      'donda',
      'mengolini',
      'julia mengolini',
      'occhiato',
      'nico occhiato',
      'migue granados',
      'granados',
      'leuco',
      'sylvestre',
      'gato sylvestre',
      'dugas',
      'tenembaum',
      'odonnell',
      'maria odonnell',
      'novillo',
      'gelatina',
      'carajo',
      'olga',
      'luzu',
      'blender',
      'neura',
      'el destape',
      'c5n',
      'ln+',
      'tn',
    ],
    inherentHateSlurs: [
      'ensobrado',
      'ensobrados',
      'ensobrada',
      'pautero',
      'pauteros',
      'periodista militante',
      'mercenario',
      'mercenarios',
    ],
  },
  {
    id: 'clase_politica_estado',
    label: 'Políticos / Casta / Justicia / Policías',
    keywords: [
      'politico',
      'politicos',
      'casta',
      'diputado',
      'diputados',
      'senador',
      'senadores',
      'congreso',
      'juez',
      'jueces',
      'fiscales',
      'justicia',
      'corte suprema',
      'policia',
      'policias',
      'milicos',
      'militar',
      'militares',
      'gendarmeria',
      'intendente',
      'gobernador',
      'funcionario',
      'funcionarios',
      'munipa',
      'munipas',
      'noqui',
      'noquis',
      'ñoqui',
      'ñoquis',
    ],
    inherentHateSlurs: [],
  },
  {
    id: 'colectivos_sociales_demograficos',
    label: 'Colectivos Sociales / Nacionalidades / Género /Edad',
    keywords: [
      'jubilado',
      'jubilados',
      'mujer',
      'mujeres',
      'feminista',
      'feministas',
      'feminismo',
      'lgbt',
      'gay',
      'gays',
      'trans',
      'travesti',
      'travestis',
      'inmigrante',
      'inmigrantes',
      'extranjero',
      'extranjeros',
      'boliviano',
      'bolivianos',
      'paraguayo',
      'paraguayos',
      'peruano',
      'peruanos',
      'venezolano',
      'venezolanos',
      'chileno',
      'chilenos',
      'judio',
      'judios',
      'sionista',
      'sionistas',
      'musulman',
      'musulmanes',
      'catolico',
      'catolicos',
      'evangelico',
      'evangelicos',
      'pobre',
      'pobres',
      'porteño',
      'porteños',
      'bonaerense',
      'bonaerenses',
      'conurbano',
    ],
    inherentHateSlurs: [
      'negro de mierda',
      'negros de mierda',
      'marron',
      'marrones',
      'marronazo',
      'villero',
      'villeros',
      'villera',
      'boliguayo',
      'boliguayos',
      'peruca',
      'perucas',
      'feminazi',
      'feminazis',
      'viejo meado',
      'viejos meados',
      'vieja meada',
      'viejas meadas',
      'gorila',
      'gorilas',
      'mandril',
      'mandriles',
    ],
  },
];

export const HATE_SPEECH_CATEGORIES: HateSpeechCategoryDef[] = [
  {
    id: 'insultos_agresiones',
    name: 'Insultos y Agresiones Directas a Personas/Grupos',
    shortName: 'Insultos / Agravios',
    description: 'Descalificaciones personales, agravios directos y ataques contra una persona o colectivo mencionado.',
    keywords: [
      'idiota',
      'idiotas',
      'imbecil',
      'imbécil',
      'imbeciles',
      'estupido',
      'estúpido',
      'estupidos',
      'pelotudo',
      'pelotuda',
      'pelotudos',
      'boludo',
      'boluda',
      'boludos',
      'hdp',
      'hijo de puta',
      'hijos de puta',
      'hija de puta',
      'forro',
      'forra',
      'forros',
      'tarado',
      'tarada',
      'tarados',
      'basura',
      'basuras',
      'lacra',
      'lacras',
      'inutil',
      'inútil',
      'inutiles',
      'enfermo mental',
      'enfermos mentales',
      'descerebrado',
      'descerebrados',
      'mogolico',
      'mogólico',
      'mogolicos',
      'retrasado',
      'retrasados',
      'payaso',
      'payasos',
      'sinverguenza',
      'sinvergüenza',
      'sinverguenzas',
      'caradura',
      'caraduras',
      'sorete',
      'soretes',
      'cagon',
      'cagón',
      'cagones',
      'garca',
      'garcas',
      'chanta',
      'chantas',
      'infeliz',
      'infelices',
      'asqueroso',
      'asquerosa',
      'asquerosos',
      'repugnante',
      'repugnantes',
      'nefasto',
      'nefasta',
      'nefastos',
      'psiquiatrico',
      'psiquiátrico',
      'delirante',
      'impresentable',
      'impresentables',
      'patetico',
      'patético',
      'pateticos',
    ],
  },
  {
    id: 'odio_politico_partidario',
    name: 'Odio Político y Estigmatización Partidaria',
    shortName: 'Odio Político',
    description: 'Hostilidad extrema, criminalización o desprecio deshumanizante hacia grupos o líderes políticos mencionados.',
    keywords: [
      'kuka',
      'kukas',
      'kukardo',
      'kukardos',
      'kukaracha',
      'kukarachas',
      'mandril',
      'mandriles',
      'libervirgo',
      'libervirgos',
      'libertarado',
      'libertarados',
      'libertonto',
      'libertontos',
      'liberotario',
      'liberotarios',
      'polentero',
      'polenteros',
      'planero',
      'planeros',
      'planera',
      'gorila',
      'gorilas',
      'fascista',
      'fascistas',
      'facho',
      'fachos',
      'nazi',
      'nazis',
      'zurdo de mierda',
      'zurdos de mierda',
      'kuka de mierda',
      'kukas de mierda',
      'chorro',
      'chorra',
      'chorros',
      'ladron',
      'ladrón',
      'ladrones',
      'ladrona',
      'corrupto',
      'corruptos',
      'corrupta',
      'traidor',
      'traidores',
      'vendepatria',
      'vendepatrias',
      'cipayo',
      'cipayos',
      'ensobrado',
      'ensobrados',
      'pautero',
      'pauteros',
      'mercenario',
      'mercenarios',
      'valijero',
      'delincuente',
      'delincuentes',
      'mafioso',
      'mafiosos',
      'dictador',
      'genocida',
      'golpista',
      'golpistas',
      'terrorista',
      'terroristas',
    ],
  },
  {
    id: 'amenazas_violencia',
    name: 'Incitación a la Violencia y Amenazas',
    shortName: 'Violencia / Amenazas',
    description: 'Deseos de muerte, llamados a la agresión física, persecución, cárcel o represión violenta contra personas/grupos.',
    keywords: [
      'bala',
      'paredon',
      'paredón',
      'hay que matarlos',
      'matarlos a todos',
      'que se mueran',
      'ojala se muera',
      'ojalá se muera',
      'mueran todos',
      'a la carcel',
      'a la cárcel',
      'presos todos',
      'presa',
      'preso',
      'hay que colgarlos',
      'guillotina',
      'prender fuego',
      'quemarlos',
      'linchar',
      'cagar a trompadas',
      'cagar a palos',
      'exterminar',
      'eliminar',
      'desaparecer',
      'falcon verde',
      'fusilar',
    ],
  },
  {
    id: 'acoso_deshumanizacion',
    name: 'Deshumanización y Lenguaje Degradante',
    shortName: 'Deshumanización',
    description: 'Comparación de personas o colectivos mencionados con parásitos, plagas, enfermedades o animales.',
    keywords: [
      'parasito',
      'parásito',
      'parasitos',
      'parásitos',
      'rata',
      'ratas',
      'cucaracha',
      'cucarachas',
      'larva',
      'larvas',
      'cancer',
      'cáncer',
      'escoria',
      'plaga',
      'engendro',
      'subhumano',
      'bestia',
      'simio',
      'simios',
      'mono',
      'monos',
      'zombi',
      'zombies',
      'termo',
      'termos',
      'cabeza de termo',
      'esclavo',
      'esclavos',
      'arrastrado',
      'arrastrados',
    ],
  },
  {
    id: 'discriminacion_xenofobia',
    name: 'Discriminación, Clasismo, Racismo o Misoginia',
    shortName: 'Discriminación / Odio',
    description: 'Ataques contra personas o grupos mencionados por su origen social, nacionalidad, género, edad o condición física.',
    keywords: [
      'negro de mierda',
      'negros de mierda',
      'villero',
      'villeros',
      'villera',
      'marron',
      'marrón',
      'marrones',
      'marronazo',
      'boliguayo',
      'boliguayos',
      'peruca',
      'vieja loca',
      'viejo meado',
      'viejos meados',
      'vieja meada',
      'viejas meadas',
      'feminazi',
      'feminazis',
      'puta',
      'puto',
      'trola',
      'trava',
      'sidoso',
      'falopero',
      'merquero',
      'drogadicto',
    ],
  },
];

function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const PRECOMPILED_PATTERNS = HATE_SPEECH_CATEGORIES.map((cat) => ({
  id: cat.id,
  name: cat.name,
  shortName: cat.shortName,
  patterns: cat.keywords.map((kw) => {
    const normKw = normalizeText(kw).trim();
    const escaped = normKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      original: kw.trim(),
      normalized: normKw,
      regex: new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i'),
    };
  }),
}));

const PRECOMPILED_TARGETS = HATE_TARGET_GROUPS.map((grp) => ({
  id: grp.id,
  label: grp.label,
  keywordPatterns: grp.keywords.map((kw) => {
    const normKw = normalizeText(kw).trim();
    const escaped = normKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      original: kw.trim(),
      regex: new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i'),
    };
  }),
  slurPatterns: grp.inherentHateSlurs.map((slur) => {
    const normSlur = normalizeText(slur).trim();
    const escaped = normSlur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      original: slur.trim(),
      regex: new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i'),
    };
  }),
}));

// Expresiones explícitas de direccionamiento hacia una persona o grupo en el mensaje
const DIRECT_TARGET_ADDRESS_REGEX = /(@[a-zA-Z0-9_.-]{2,}|ustedes\s+los\s+[a-záéíóúñ]+|todos\s+estos\s+[a-záéíóúñ]+|todos\s+los\s+[a-záéíóúñ]+|esa\s+gente|estos\s+tipos|ese\s+tipo|esa\s+mina|este\s+tipo)/i;

/**
 * Detecta qué grupos o personas están siendo mencionados explícitamente en un mensaje.
 */
export function extractMentionedTargets(text: string): {
  targetLabels: string[];
  matchedTargetTerms: string[];
  hasInherentGroupSlur: boolean;
} {
  const norm = normalizeText(text);
  const targetLabelsSet = new Set<string>();
  const matchedTargetTermsSet = new Set<string>();
  let hasInherentGroupSlur = false;

  for (const grp of PRECOMPILED_TARGETS) {
    for (const pat of grp.keywordPatterns) {
      if (pat.regex.test(norm)) {
        targetLabelsSet.add(grp.label);
        matchedTargetTermsSet.add(pat.original);
      }
    }
    for (const slurPat of grp.slurPatterns) {
      if (slurPat.regex.test(norm)) {
        targetLabelsSet.add(grp.label);
        matchedTargetTermsSet.add(slurPat.original);
        hasInherentGroupSlur = true;
      }
    }
  }

  // Detectar @menciones directas a usuarios o personas específicas en el chat
  const atMentions = text.match(/@[a-zA-Z0-9_.-]{2,}/g);
  if (atMentions && atMentions.length > 0) {
    for (const handle of atMentions) {
      targetLabelsSet.add(`Usuario/Persona (${handle})`);
      matchedTargetTermsSet.add(handle);
    }
  }

  // Detectar nombres propios explícitos precedidos por "contra / para / de / vos / che" + Nombre Propio si hay insulto
  if (targetLabelsSet.size === 0 && DIRECT_TARGET_ADDRESS_REGEX.test(text)) {
    const match = text.match(DIRECT_TARGET_ADDRESS_REGEX);
    if (match && match[0]) {
      targetLabelsSet.add(`Destinatario directo ("${match[0].trim()}")`);
      matchedTargetTermsSet.add(match[0].trim());
    }
  }

  return {
    targetLabels: Array.from(targetLabelsSet),
    matchedTargetTerms: Array.from(matchedTargetTermsSet),
    hasInherentGroupSlur,
  };
}

export function evaluateMessageHateSpeech(
  rawItem: {
    id: string;
    author_id?: string;
    comment_text?: string;
    created_at?: string;
    source: 'comment' | 'superchat';
    amount?: number;
    currency?: string;
  }
): AnalyzedVideoMessage {
  const text = String(rawItem.comment_text || '').trim();
  const norm = normalizeText(text);

  // 1. Verificar qué expresiones de odio/agresión existen en el mensaje
  const matchedCategories = new Set<HateSpeechCategoryId>();
  const matchedTermsSet = new Set<string>();

  for (const cat of PRECOMPILED_PATTERNS) {
    for (const pat of cat.patterns) {
      if (pat.regex.test(norm)) {
        matchedCategories.add(cat.id);
        matchedTermsSet.add(pat.original);
      }
    }
  }

  // 2. Verificar OBLIGATORIAMENTE si se menciona al grupo o persona a la que se está odiando
  const { targetLabels, matchedTargetTerms } = extractMentionedTargets(text);

  // REGLA ESTRICTA PEDIDA POR EL USUARIO:
  // Solo contar como mensaje de odio si se menciona explícitamente el grupo o persona al que se está odiando
  const hasExplicitTarget = targetLabels.length > 0;
  const hasHateExpression = matchedCategories.size > 0;

  if (!hasExplicitTarget || !hasHateExpression) {
    return {
      id: rawItem.id,
      author_id: rawItem.author_id || (rawItem.source === 'superchat' ? 'Superchat' : 'Anónimo'),
      comment_text: text,
      created_at: rawItem.created_at || '',
      source: rawItem.source,
      ...(rawItem.amount !== undefined ? { amount: rawItem.amount } : {}),
      ...(rawItem.currency !== undefined ? { currency: rawItem.currency } : {}),
      is_hate_speech: false,
      severity: 'ninguno',
      hate_score: 0,
      categories: [],
      matched_terms: [],
      hate_targets: [],
    };
  }

  const upperLetters = (text.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
  const allLetters = (text.match(/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/g) || []).length;
  const isShouting = allLetters >= 10 && upperLetters / allLetters >= 0.75;

  const categories = Array.from(matchedCategories);
  const matched_terms = Array.from(new Set([...matchedTargetTerms, ...Array.from(matchedTermsSet)]));

  let hate_score = 0;
  if (categories.includes('amenazas_violencia')) hate_score += 55;
  if (categories.includes('discriminacion_xenofobia')) hate_score += 45;
  if (categories.includes('acoso_deshumanizacion')) hate_score += 40;
  if (categories.includes('insultos_agresiones')) hate_score += 35;
  if (categories.includes('odio_politico_partidario')) hate_score += 30;

  if (matchedTermsSet.size > 1) {
    hate_score += Math.min(30, (matchedTermsSet.size - 1) * 12);
  }
  if (hate_score > 0 && isShouting) {
    hate_score += 10;
  }

  hate_score = Math.min(100, hate_score);

  let severity: HateSpeechSeverity = 'bajo';
  if (hate_score >= 65 || categories.includes('amenazas_violencia')) {
    severity = 'alto';
    hate_score = Math.max(70, hate_score);
  } else if (hate_score >= 40) {
    severity = 'medio';
  }

  const catLabels = categories
    .map((cid) => HATE_SPEECH_CATEGORIES.find((c) => c.id === cid)?.shortName || cid)
    .join(' + ');
  const reason = `Dirigido contra [${targetLabels.join(', ')}] (${catLabels})`;

  return {
    id: rawItem.id,
    author_id: rawItem.author_id || (rawItem.source === 'superchat' ? 'Superchat' : 'Anónimo'),
    comment_text: text,
    created_at: rawItem.created_at || '',
    source: rawItem.source,
    ...(rawItem.amount !== undefined ? { amount: rawItem.amount } : {}),
    ...(rawItem.currency !== undefined ? { currency: rawItem.currency } : {}),
    is_hate_speech: true,
    severity,
    hate_score,
    categories,
    matched_terms,
    hate_targets: targetLabels,
    reason,
  };
}

export function buildDeterministicHateSpeechAnalysis(params: {
  video_id: string;
  video_title: string;
  channel_name: string;
  channel: string;
  is_eternal: boolean;
  start_date?: string | null;
  end_date?: string | null;
  comments: any[];
  superchats: any[];
}): HateSpeechAnalysisResult {
  const analyzedMessages: AnalyzedVideoMessage[] = [];

  for (let i = 0; i < params.superchats.length; i++) {
    const sc = params.superchats[i];
    analyzedMessages.push(
      evaluateMessageHateSpeech({
        id: sc.id || `sc_${params.video_id}_${i}`,
        author_id: sc.author_id || `Superchat (${sc.currency || 'ARS'} ${sc.amount || 0})`,
        comment_text: sc.superchat_text || '',
        created_at: sc.created_at,
        source: 'superchat',
        amount: Number(sc.amount || 0),
        currency: sc.currency || 'ARS',
      })
    );
  }

  for (let i = 0; i < params.comments.length; i++) {
    const c = params.comments[i];
    analyzedMessages.push(
      evaluateMessageHateSpeech({
        id: c.id || `cmt_${params.video_id}_${i}`,
        author_id: c.author_id || 'Usuario',
        comment_text: c.comment_text || '',
        created_at: c.created_at,
        source: 'comment',
      })
    );
  }

  return recomputeHateSpeechSummary({
    video_id: params.video_id,
    video_title: params.video_title,
    channel_name: params.channel_name,
    channel: params.channel,
    is_eternal: params.is_eternal,
    start_date: params.start_date,
    end_date: params.end_date,
    messages: analyzedMessages,
    total_comments: params.comments.length,
    total_superchats: params.superchats.length,
  });
}

export function recomputeHateSpeechSummary(params: {
  video_id: string;
  video_title: string;
  channel_name: string;
  channel: string;
  is_eternal: boolean;
  start_date?: string | null;
  end_date?: string | null;
  messages: AnalyzedVideoMessage[];
  total_comments: number;
  total_superchats: number;
  custom_executive_summary?: string;
}): HateSpeechAnalysisResult {
  const total_messages = params.messages.length;
  // Garantizar que ningún mensaje sin hate_targets explícito sea contabilizado como odio
  const normalizedMessages = params.messages.map((m) => {
    if (m.is_hate_speech && (!m.hate_targets || m.hate_targets.length === 0)) {
      return {
        ...m,
        is_hate_speech: false,
        severity: 'ninguno' as HateSpeechSeverity,
        hate_score: 0,
        categories: [],
        matched_terms: [],
        hate_targets: [],
        reason: undefined,
      };
    }
    return m;
  });

  const hateMessages = normalizedMessages.filter((m) => m.is_hate_speech);
  const hate_messages_count = hateMessages.length;
  const clean_messages_count = Math.max(0, total_messages - hate_messages_count);
  const hate_percentage =
    total_messages > 0 ? Number(((hate_messages_count / total_messages) * 100).toFixed(1)) : 0;

  let high_severity_count = 0;
  let medium_severity_count = 0;
  let low_severity_count = 0;

  const catCounts = new Map<HateSpeechCategoryId, number>();
  for (const cat of HATE_SPEECH_CATEGORIES) {
    catCounts.set(cat.id, 0);
  }

  const targetCounts = new Map<string, number>();

  const authorMap = new Map<
    string,
    { total: number; hate: number; maxSev: HateSpeechSeverity; targets: Set<string> }
  >();

  const sevRank: Record<HateSpeechSeverity, number> = {
    ninguno: 0,
    bajo: 1,
    medio: 2,
    alto: 3,
  };

  for (const msg of normalizedMessages) {
    if (msg.is_hate_speech) {
      if (msg.severity === 'alto') high_severity_count++;
      else if (msg.severity === 'medio') medium_severity_count++;
      else low_severity_count++;

      for (const cid of msg.categories) {
        catCounts.set(cid, (catCounts.get(cid) || 0) + 1);
      }

      for (const t of msg.hate_targets) {
        targetCounts.set(t, (targetCounts.get(t) || 0) + 1);
      }
    }

    const authorKey = msg.author_id || 'Anónimo';
    const curr = authorMap.get(authorKey) || {
      total: 0,
      hate: 0,
      maxSev: 'ninguno' as HateSpeechSeverity,
      targets: new Set<string>(),
    };
    curr.total += 1;
    if (msg.is_hate_speech) {
      curr.hate += 1;
      if (sevRank[msg.severity] > sevRank[curr.maxSev]) {
        curr.maxSev = msg.severity;
      }
      for (const t of msg.hate_targets) {
        curr.targets.add(t);
      }
    }
    authorMap.set(authorKey, curr);
  }

  const weightedHateSum =
    high_severity_count * 1.6 + medium_severity_count * 1.1 + low_severity_count * 0.7;
  const rawToxicity =
    total_messages > 0 ? Math.min(100, Math.round((weightedHateSum / total_messages) * 180)) : 0;
  const toxicity_index = Math.max(0, Math.min(100, rawToxicity));

  let toxicity_level: 'Bajo' | 'Moderado' | 'Alto' | 'Crítico' = 'Bajo';
  if (toxicity_index >= 60 || hate_percentage >= 30) {
    toxicity_level = 'Crítico';
  } else if (toxicity_index >= 35 || hate_percentage >= 18) {
    toxicity_level = 'Alto';
  } else if (toxicity_index >= 15 || hate_percentage >= 7) {
    toxicity_level = 'Moderado';
  }

  const categories_breakdown: HateSpeechCategoryBreakdown[] = HATE_SPEECH_CATEGORIES.map((cat) => {
    const count = catCounts.get(cat.id) || 0;
    return {
      id: cat.id,
      name: cat.name,
      shortName: cat.shortName,
      count,
      percentage_of_hate:
        hate_messages_count > 0 ? Number(((count / hate_messages_count) * 100).toFixed(1)) : 0,
      percentage_of_total:
        total_messages > 0 ? Number(((count / total_messages) * 100).toFixed(1)) : 0,
    };
  }).sort((a, b) => b.count - a.count);

  const targets_breakdown: HateSpeechTargetBreakdown[] = Array.from(targetCounts.entries())
    .map(([target, count]) => ({
      target,
      count,
      percentage_of_hate:
        hate_messages_count > 0 ? Number(((count / hate_messages_count) * 100).toFixed(1)) : 0,
      percentage_of_total:
        total_messages > 0 ? Number(((count / total_messages) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const top_hate_authors: HateSpeechAuthorSummary[] = Array.from(authorMap.entries())
    .filter(([, stats]) => stats.hate > 0)
    .map(([author_id, stats]) => ({
      author_id,
      total_messages: stats.total,
      hate_messages: stats.hate,
      hate_percentage: Number(((stats.hate / stats.total) * 100).toFixed(1)),
      max_severity: stats.maxSev,
      targets: Array.from(stats.targets).slice(0, 3),
    }))
    .sort((a, b) => b.hate_messages - a.hate_messages || b.total_messages - a.total_messages)
    .slice(0, 10);

  const topTarget = targets_breakdown[0];
  const topCategory = categories_breakdown[0];
  const defaultSummary =
    total_messages === 0
      ? `No se encontraron mensajes registrados en la base de datos para la emisión "${params.video_title}".`
      : hate_messages_count === 0
      ? `Se analizaron los ${total_messages} mensajes de la emisión "${params.video_title}" (${params.channel_name}) sin detectarse mensajes de odio que mencionen a un grupo o persona destinataria.`
      : `Sobre un total de ${total_messages} mensajes analizados en "${params.video_title}" (${params.channel_name}), se contabilizaron ${hate_messages_count} mensajes de odio dirigidos explícitamente contra un grupo o persona (${hate_percentage}% del chat). El principal blanco mencionado es "${topTarget?.target || 'Figuras políticas'}" (${topTarget?.count || 0} mensajes) y la modalidad predominante es "${topCategory?.name || 'Agresiones'}" (${topCategory?.count || 0} menciones).`;

  return {
    video_id: params.video_id,
    video_title: params.video_title,
    channel_name: params.channel_name,
    channel: params.channel,
    is_eternal: params.is_eternal,
    start_date: params.start_date || null,
    end_date: params.end_date || null,
    analyzed_at: new Date().toISOString(),
    summary: {
      total_messages,
      total_comments: params.total_comments,
      total_superchats: params.total_superchats,
      hate_messages_count,
      clean_messages_count,
      hate_percentage,
      toxicity_index,
      toxicity_level,
      high_severity_count,
      medium_severity_count,
      low_severity_count,
      executive_summary: params.custom_executive_summary || defaultSummary,
    },
    categories_breakdown,
    targets_breakdown,
    top_hate_authors,
    messages: normalizedMessages,
  };
}
