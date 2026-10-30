import { Channel, Stream, AvgDataPoint, HourDayData, MinuteDataPoint, CommentItem } from '../types';

export const CHANNELS: Channel[] = [
  {
    channel_id: 'UCnZidingmuqNkaT9Wm64Xxg',
    channel: '@luzutv',
    channel_name: 'LUZU TV',
    description: 'El medio de streaming líder de Argentina. Programación en vivo: Nadie Dice Nada, Antes Que Nadie, Patria y Familia, Tarde de Tertulia.',
    subs: 1650000,
    thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'stream, entretenimiento, radio',
    twitter: '@luzutv',
    avg_viewers: 58240,
    avg_likes: 24500,
    superchats_count: 38,
    superchats_total_ars: 420000,
    comments_sample: [
      { id: 'c1', author: 'MatiasG', content: 'Que buen programa loco, saludos desde Córdoba!', timestamp: 'hace 2 min' },
      { id: 'c2', author: 'Agustina Lopez', content: 'Genios totales! Flor y Nico los mejores ❤️', timestamp: 'hace 3 min', is_superchat: true, superchat_amount: 15000, superchat_currency: 'ARS' },
      { id: 'c3', author: 'JoaquinV', content: 'Momi no puede ser tan graciosa jajaja', timestamp: 'hace 5 min' },
      { id: 'c4', author: 'Lucas_BsAs', content: 'Apoyo para todo el equipo de LUZU!', timestamp: 'hace 7 min', is_superchat: true, superchat_amount: 25000, superchat_currency: 'ARS' },
      { id: 'c5', author: 'Sofia22', content: 'Conectada desde el laburo disimulando 😂', timestamp: 'hace 9 min' },
      { id: 'c6', author: 'Brian_Miami', content: 'Saludos desde Miami no me lo pierdo nunca!', timestamp: 'hace 11 min', is_superchat: true, superchat_amount: 20, superchat_currency: 'USD' },
    ]
  },
  {
    channel_id: 'UCg1X0KSoLhM5z9z_74L9tXw',
    channel: '@olgaenvivo',
    channel_name: 'OLGA',
    description: 'Canal de streaming y entretenimiento argentino creado por Migue Granados. Soñé Que Volaba, Sería Increíble, Paraíso Fiscal, Generación Dorada.',
    subs: 1520000,
    thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'stream, entretenimiento, radio',
    twitter: '@olgaenvivo',
    avg_viewers: 63890,
    avg_likes: 28400,
    superchats_count: 52,
    superchats_total_ars: 580000,
    comments_sample: [
      { id: 'co1', author: 'Esteban_P', content: 'Migue sos un animal de la comedia jajajaj', timestamp: 'hace 1 min' },
      { id: 'co2', author: 'Camila Rossi', content: 'Aguante Olga y todo el equipo de Soñé Que Volaba!', timestamp: 'hace 3 min', is_superchat: true, superchat_amount: 30000, superchat_currency: 'ARS' },
      { id: 'co3', author: 'Pablo_Rosario', content: 'Fridman tirando data histórica como siempre', timestamp: 'hace 4 min' },
      { id: 'co4', author: 'Santiago_K', content: 'Gran streaming, el mejor de la mañana!', timestamp: 'hace 6 min', is_superchat: true, superchat_amount: 10000, superchat_currency: 'ARS' },
      { id: 'co5', author: 'Mariana_MDQ', content: 'Saludos desde Mar del Plata tomando mates!', timestamp: 'hace 8 min', is_superchat: true, superchat_amount: 15000, superchat_currency: 'ARS' },
    ]
  },
  {
    channel_id: 'UCvorterix_id_554',
    channel: '@VorterixOficial',
    channel_name: 'Vorterix',
    description: 'Multimedio de Mario Pergolini. Transmisiones en vivo de Paren La Mano, Maldición Va A Ser Un Día Hermoso y coberturas de música y eventos.',
    subs: 1080000,
    thumb: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'stream, entretenimiento, radio, deportes',
    twitter: '@Vorterix',
    avg_viewers: 34500,
    avg_likes: 15200,
    superchats_count: 24,
    superchats_total_ars: 230000,
    comments_sample: [
      { id: 'cv1', author: 'German_Fan', content: 'Paren La Mano el mejor programa de la historia', timestamp: 'hace 2 min' },
      { id: 'cv2', author: 'Martin_912', content: 'Luquitas crack total saludos desde La Plata', timestamp: 'hace 4 min', is_superchat: true, superchat_amount: 12000, superchat_currency: 'ARS' },
      { id: 'cv3', author: 'Rober_G', content: 'Alfre tirando anécdotas insuperables jaja', timestamp: 'hace 7 min' },
    ]
  },
  {
    channel_id: 'UCblender_id_772',
    channel: '@estoesblender',
    channel_name: 'Blender',
    description: 'La nueva televisión por internet. Hay Algo Ahí con Tomás Rebord, Dinamarca, Pelotazo y Desayuno Intermitente.',
    subs: 620000,
    thumb: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'stream, política, entretenimiento',
    twitter: '@estoesblender',
    avg_viewers: 21400,
    avg_likes: 11300,
    superchats_count: 19,
    superchats_total_ars: 185000,
    comments_sample: [
      { id: 'cb1', author: 'Hagovista', content: 'Rebord es el único que entiende todo', timestamp: 'hace 2 min' },
      { id: 'cb2', author: 'Nico_Peroncho', content: 'Para el café de Rebord y Ruffo!', timestamp: 'hace 5 min', is_superchat: true, superchat_amount: 20000, superchat_currency: 'ARS' },
      { id: 'cb3', author: 'Lucia_LP', content: 'Excelente editorial de hoy', timestamp: 'hace 8 min' },
    ]
  },
  {
    channel_id: 'UCgelatina_id_881',
    channel: '@somosgelatina',
    channel_name: 'Gelatina',
    description: 'Streaming político, humor y actualidad conducido por Pedro Rosemblat, Ivana Szerman y Marcos Aramburu. Industria Nacional y Fábrica de Jingles.',
    subs: 440000,
    thumb: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'stream, política, entretenimiento',
    twitter: '@somosgelatina',
    avg_viewers: 19800,
    avg_likes: 9800,
    superchats_count: 22,
    superchats_total_ars: 210000,
    comments_sample: [
      { id: 'cg1', author: 'PedroFan', content: 'La fábrica de jingles no para jajajaj', timestamp: 'hace 1 min' },
      { id: 'cg2', author: 'Micaela_S', content: 'Aporte para la causa de Gelatina!', timestamp: 'hace 3 min', is_superchat: true, superchat_amount: 15000, superchat_currency: 'ARS' },
      { id: 'cg3', author: 'Javier_VillaUrquiza', content: 'Ivana y Marcos dupla de oro', timestamp: 'hace 6 min' },
    ]
  },
  {
    channel_id: 'UCneura_id_990',
    channel: '@NeuraMedia',
    channel_name: 'Neura',
    description: 'Canal de Alejandro Fantino. Actualidad, debates, política, entrevistas y deportes en vivo las 24 horas.',
    subs: 710000,
    thumb: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'stream, política, radio',
    twitter: '@NeuraMedia',
    avg_viewers: 24600,
    avg_likes: 12400,
    superchats_count: 15,
    superchats_total_ars: 160000,
    comments_sample: [
      { id: 'cn1', author: 'Ale_Tucuman', content: 'Fantino diciendo las cosas como son', timestamp: 'hace 3 min' },
      { id: 'cn2', author: 'Dario_SanJuan', content: 'Excelente mesa de debate hoy', timestamp: 'hace 6 min', is_superchat: true, superchat_amount: 10000, superchat_currency: 'ARS' },
    ]
  },
  {
    channel_id: 'UCcarajo_id_112',
    channel: '@carajostream',
    channel_name: 'Carajo Stream',
    description: 'Canal de streaming con debate político y cultural. La Misa de Dan, Toda con Alex Caniggia y Furia.',
    subs: 395000,
    thumb: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'stream, política',
    twitter: '@carajostream',
    avg_viewers: 17200,
    avg_likes: 13100,
    superchats_count: 18,
    superchats_total_ars: 175000,
    comments_sample: [
      { id: 'cc1', author: 'GordoDan_Fan', content: 'La misa de Dan arrancó con todo!', timestamp: 'hace 2 min' },
      { id: 'cc2', author: 'Maxi_Libertad', content: 'Bancando el proyecto Carajo!', timestamp: 'hace 5 min', is_superchat: true, superchat_amount: 18000, superchat_currency: 'ARS' },
    ]
  },
  {
    channel_id: 'UCurbanaplay_id_339',
    channel: '@UrbanaPlayFM',
    channel_name: 'Urbana Play 104.3 FM',
    description: 'Somos la radio que ves. Perros de la Calle con Andy Kusnetzoff, Todo Pasa con Matías Martin y Vuelta y Media con Seba Wainraich.',
    subs: 1210000,
    thumb: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'radio, entretenimiento, stream',
    twitter: '@UrbanaPlayFM',
    avg_viewers: 15800,
    avg_likes: 6200,
    superchats_count: 0,
    superchats_total_ars: 0,
    comments_sample: [
      { id: 'cu1', author: 'Sofi_Belgrano', content: 'Los escucho todas las mañanas mientras laburo!', timestamp: 'hace 4 min' },
      { id: 'cu2', author: 'Gonzalo_Caballito', content: 'Andy y Harry los mejores', timestamp: 'hace 10 min' },
    ]
  },
  {
    channel_id: 'UCbondi_id_441',
    channel: '@bondi_liveok',
    channel_name: 'Bondi Live',
    description: 'Streaming de espectáculos, entretenimiento y farándula con Ángel de Brito, Beto Casella y Yanina Latorre.',
    subs: 260000,
    thumb: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'stream, entretenimiento, tv',
    twitter: '@bondi_liveok',
    avg_viewers: 12500,
    avg_likes: 5600,
    superchats_count: 8,
    superchats_total_ars: 72000,
    comments_sample: [
      { id: 'cbd1', author: 'Laura_Quilmes', content: 'Ángel tirando primicias como siempre!', timestamp: 'hace 3 min' },
      { id: 'cbd2', author: 'Vane_M', content: 'Aguante Bondi! Me hacen reír mucho', timestamp: 'hace 7 min', is_superchat: true, superchat_amount: 5000, superchat_currency: 'ARS' },
    ]
  },
  {
    channel_id: 'UCtn_id_001',
    channel: '@todonoticias',
    channel_name: 'Todo Noticias (TN)',
    description: 'Transmisión ininterrumpida las 24 horas del canal líder de noticias de Argentina.',
    subs: 5450000,
    thumb: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'tv, noticias',
    twitter: '@todonoticias',
    avg_viewers: 31200,
    avg_likes: 10400,
    superchats_count: 0,
    superchats_total_ars: 0,
    comments_sample: [
      { id: 'ct1', author: 'Carlos_Mendoza', content: 'Información al instante siempre con TN', timestamp: 'hace 1 min' },
    ]
  },
  {
    channel_id: 'UCazz_id_661',
    channel: '@azzstream',
    channel_name: 'AZZ Stream',
    description: 'Canal de deportes y debate futbolero sin filtro conducido por Flavio Azzaro y Andrés Ducatenzeiler en El Loco y el Cuerdo.',
    subs: 235000,
    thumb: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'deportes, stream',
    twitter: '@FlavioAzzaro',
    avg_viewers: 26800,
    avg_likes: 14200,
    superchats_count: 31,
    superchats_total_ars: 350000,
    comments_sample: [
      { id: 'ca1', author: 'Racinguista_Akd', content: 'Duka desquiciado hablando de la AFA jajajaj', timestamp: 'hace 1 min' },
      { id: 'ca2', author: 'Franco_Avellaneda', content: 'Flavio decí la verdad de la fecha!', timestamp: 'hace 3 min', is_superchat: true, superchat_amount: 25000, superchat_currency: 'ARS' },
      { id: 'ca3', author: 'Bostero_98', content: 'Saludos desde Salta el mejor programa de futbol', timestamp: 'hace 5 min', is_superchat: true, superchat_amount: 10000, superchat_currency: 'ARS' },
    ]
  },
  {
    channel_id: 'UCeldestape_id_776',
    channel: '@ElDestapeRadio',
    channel_name: 'El Destape',
    description: 'Periodismo independiente, investigación y política conducido por Roberto Navarro y equipo.',
    subs: 1310000,
    thumb: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'noticias, política, radio',
    twitter: '@eldestapeweb',
    avg_viewers: 14800,
    avg_likes: 7900,
    superchats_count: 14,
    superchats_total_ars: 140000,
    comments_sample: [
      { id: 'cd1', author: 'Roberto_Avellaneda', content: 'Excelente Navarro, siempre con la verdad', timestamp: 'hace 3 min' },
      { id: 'cd2', author: 'Susana_LaMatanza', content: 'Apoyo para el periodismo popular!', timestamp: 'hace 7 min', is_superchat: true, superchat_amount: 10000, superchat_currency: 'ARS' },
    ]
  },
  {
    channel_id: 'UCfuturock_id_999',
    channel: '@futurock',
    channel_name: 'Futurock',
    description: 'Radio y streaming profesional de Argentina. Furia Bebé con Malena Pichot, Segurola y Habana con Julia Mengolini, El Mañana.',
    subs: 490000,
    thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&h=160&fit=crop&crop=faces&q=80',
    tags: 'radio, stream, política, entretenimiento',
    twitter: '@futurockOk',
    avg_viewers: 17800,
    avg_likes: 8900,
    superchats_count: 26,
    superchats_total_ars: 245000,
    comments_sample: [
      { id: 'cfr1', author: '@GeSe20', content: 'Segurola y Habana tremendo programa hoy!', timestamp: 'hace 2 min' },
      { id: 'cfr2', author: '@misterghoul6633', content: 'Pichot y Mengolini las amo siempre conectadas', timestamp: 'hace 3 min' },
    ]
  },
];

// Helper to generate minute-by-minute realistic data curve
function generateMinuteData(peak: number, likesPeak: number, startHour = 10, count = 18): MinuteDataPoint[] {
  const points: MinuteDataPoint[] = [];
  let currentViewers = Math.round(peak * 0.45);
  let currentLikes = Math.round(likesPeak * 0.2);

  for (let i = 0; i < count; i++) {
    const totalMinutes = i * 10;
    const hour = startHour + Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    // Curve rises to peak around 60% of timeline, then stabilises
    const progress = i / count;
    let factor = Math.sin(progress * Math.PI);
    if (progress > 0.7) factor = 0.85 + Math.random() * 0.1;

    currentViewers = Math.round(peak * (0.35 + factor * 0.65) + (Math.random() * 800 - 400));
    currentLikes += Math.round(likesPeak * 0.05 + Math.random() * 120);
    const comments = Math.round(currentViewers * 0.12 + Math.random() * 200);

    points.push({
      scrape_date: timeStr,
      concurrent_viewers: Math.max(100, currentViewers),
      likes: currentLikes,
      chat_count: Math.round(comments * 1.5),
      authors_count: Math.round(comments * 0.8),
      comments_count: comments,
    });
  }
  return points;
}

// Generate 24h average data for a channel
export function generateAvgData(baseViewers: number): AvgDataPoint[] {
  const points: AvgDataPoint[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      let multiplier = 0.05; // night
      if (h >= 8 && h <= 14) {
        // Morning prime time in Argentine streaming
        multiplier = 0.5 + 0.5 * Math.sin(((h - 8) / 6) * Math.PI);
      } else if (h >= 18 && h <= 23) {
        // Evening prime time
        multiplier = 0.35 + 0.45 * Math.sin(((h - 18) / 5) * Math.PI);
      } else if (h >= 6 && h < 8) {
        multiplier = 0.15 + (h - 6) * 0.15;
      }
      const viewers = Math.round(baseViewers * multiplier * (0.9 + Math.random() * 0.2));
      const likes = Math.round(viewers * 0.45);
      points.push({
        scrape_date1: timeStr,
        avg_viewers: viewers,
        avg_likes: likes,
      });
    }
  }
  return points;
}

// Generate 24-hour heatmap per day of week
export function generateHeatmapData(basePeak: number): HourDayData[] {
  const data: HourDayData[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const isMorningPeak = hour >= 9 && hour <= 13;
    const isEveningPeak = hour >= 19 && hour <= 23;
    const isNight = hour >= 1 && hour <= 7;

    const baseVal = (dayFactor: number) => {
      if (isNight) return Math.round(basePeak * 0.02 * dayFactor);
      if (isMorningPeak) return Math.round(basePeak * (0.65 + Math.random() * 0.35) * dayFactor);
      if (isEveningPeak) return Math.round(basePeak * (0.45 + Math.random() * 0.4) * dayFactor);
      return Math.round(basePeak * (0.15 + Math.random() * 0.2) * dayFactor);
    };

    data.push({
      hour,
      mon_viewers: baseVal(0.95),
      tue_viewers: baseVal(1.0),
      wed_viewers: baseVal(1.05),
      thu_viewers: baseVal(1.02),
      fri_viewers: baseVal(0.88),
      sat_viewers: baseVal(0.35),
      sun_viewers: baseVal(0.4),
    });
  }
  return data;
}

export const LIVE_STREAMS: Stream[] = [
  {
    video_id: 'olga_live_today_01',
    channel_id: 'UCg1X0KSoLhM5z9z_74L9tXw',
    channel_name: 'OLGA',
    channel: '@olgaenvivo',
    video_title: 'SOÑÉ QUE VOLABA con Migue Granados, Lucas Fridman y Sofi Morandi - Programa Completo',
    thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 64280,
    old_viewers: 62840,
    current_likes: 31250,
    old_likes: 30720,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 10:00:00',
    superchats: [
      { currency: 'ARS', total_amount: 485200 },
      { currency: 'USD', total_amount: 140 },
    ],
    data: generateMinuteData(65000, 31000, 10, 15),
  },
  {
    video_id: 'luzu_live_today_01',
    channel_id: 'UCnZidingmuqNkaT9Wm64Xxg',
    channel_name: 'LUZU TV',
    channel: '@luzutv',
    video_title: 'NADIE DICE NADA - Con Nico Occhiato, Flor Jazmín, Momi Giardina y Santi Talledo',
    thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 59420,
    old_viewers: 57980,
    current_likes: 27800,
    old_likes: 27310,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 10:00:00',
    superchats: [
      { currency: 'ARS', total_amount: 390000 },
      { currency: 'USD', total_amount: 95 },
    ],
    data: generateMinuteData(61000, 27500, 10, 15),
  },
  {
    video_id: 'vorterix_live_today_01',
    channel_id: 'UCvorterix_id_554',
    channel_name: 'Vorterix',
    channel: '@VorterixOficial',
    video_title: 'PAREN LA MANO - Con Luquitas Rodríguez, Germán Beder, Alfre Montes y Roberto Galati',
    thumb: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 33900,
    old_viewers: 32600,
    current_likes: 18400,
    old_likes: 17950,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 10:30:00',
    superchats: [{ currency: 'ARS', total_amount: 210000 }],
    data: generateMinuteData(35000, 18000, 10, 14),
  },
  {
    video_id: 'tn_live_today_01',
    channel_id: 'UCtn_id_001',
    channel_name: 'Todo Noticias (TN)',
    channel: '@todonoticias',
    video_title: 'TN EN VIVO - Noticias de Argentina y el Mundo las 24 horas',
    thumb: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 28450,
    old_viewers: 28900,
    current_likes: 11200,
    old_likes: 11050,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 00:00:00',
    data: generateMinuteData(30000, 11000, 9, 16),
  },
  {
    video_id: 'azz_live_today_01',
    channel_id: 'UCazz_id_661',
    channel_name: 'AZZ Stream',
    channel: '@azzstream',
    video_title: 'EL LOCO Y EL CUERDO - Flavio Azzaro y Duka explotan tras la fecha de Libertadores',
    thumb: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 24700,
    old_viewers: 22800,
    current_likes: 13900,
    old_likes: 13150,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 11:00:00',
    superchats: [{ currency: 'ARS', total_amount: 340000 }],
    data: generateMinuteData(26000, 13500, 10, 12),
  },
  {
    video_id: 'neura_live_today_01',
    channel_id: 'UCneura_id_990',
    channel_name: 'Neura',
    channel: '@NeuraMedia',
    video_title: 'MULTIVERSO FANTINO - Alejandro Fantino en vivo con todo el análisis político y económico',
    thumb: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 23150,
    old_viewers: 23600,
    current_likes: 12800,
    old_likes: 12500,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 10:00:00',
    superchats: [{ currency: 'ARS', total_amount: 175000 }],
    data: generateMinuteData(24000, 12500, 10, 15),
  },
  {
    video_id: 'blender_live_today_01',
    channel_id: 'UCblender_id_772',
    channel_name: 'Blender',
    channel: '@estoesblender',
    video_title: 'HAY ALGO AHÍ - Tomás Rebord y Juan Ruffo con invitados especiales',
    thumb: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 19840,
    old_viewers: 18900,
    current_likes: 11500,
    old_likes: 11100,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 10:30:00',
    superchats: [{ currency: 'ARS', total_amount: 190000 }],
    data: generateMinuteData(21000, 11000, 10, 14),
  },
  {
    video_id: 'gelatina_live_today_01',
    channel_id: 'UCgelatina_id_881',
    channel_name: 'Gelatina',
    channel: '@somosgelatina',
    video_title: 'INDUSTRIA NACIONAL - Pedro Rosemblat, Ivana Szerman y Marcos Aramburu',
    thumb: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 18900,
    old_viewers: 17400,
    current_likes: 10200,
    old_likes: 9750,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 10:00:00',
    superchats: [{ currency: 'ARS', total_amount: 220000 }],
    data: generateMinuteData(20000, 10000, 10, 15),
  },
  {
    video_id: 'carajo_live_today_01',
    channel_id: 'UCcarajo_id_112',
    channel_name: 'Carajo Stream',
    channel: '@carajostream',
    video_title: 'TODA - Stream en vivo con Alex Caniggia y Furia',
    thumb: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 16400,
    old_viewers: 15800,
    current_likes: 12900,
    old_likes: 12450,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 10:30:00',
    superchats: [{ currency: 'ARS', total_amount: 140000 }],
    data: generateMinuteData(17000, 12500, 10, 13),
  },
  {
    video_id: 'urbana_live_today_01',
    channel_id: 'UCurbanaplay_id_339',
    channel_name: 'Urbana Play 104.3 FM',
    channel: '@UrbanaPlayFM',
    video_title: 'PERROS DE LA CALLE con Andy Kusnetzoff, Evelyn Botto y Harry Salvarrey',
    thumb: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 15200,
    old_viewers: 14950,
    current_likes: 6400,
    old_likes: 6250,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 09:00:00',
    data: generateMinuteData(16000, 6200, 9, 16),
  },
  {
    video_id: 'VjImhKoElRc',
    channel_id: 'UCfuturock_id_999',
    channel_name: 'Futurock',
    channel: '@futurock',
    video_title: 'SEGUROLA Y HABANA con Julia Mengolini y equipo - En Vivo por Futurock',
    thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&h=160&fit=crop&crop=faces&q=80',
    live: 'live',
    concurrent_viewers: 18450,
    old_viewers: 17920,
    current_likes: 9240,
    old_likes: 8850,
    max_users: 21500,
    max_likes: 9240,
    scrape_date: '2026-10-30 11:40:00',
    start_date: '2026-10-30 10:00:00',
    superchats: [
      { currency: 'ARS', total_amount: 145000 },
    ],
    data: generateMinuteData(21500, 9240, 10, 16),
  },
];

// Past finished streams for each channel
export const PAST_STREAMS_BY_CHANNEL: Record<string, Stream[]> = {
  UCfuturock_id_999: [
    {
      video_id: 'LV0Y_Gh7Q3M',
      channel_id: 'UCfuturock_id_999',
      channel_name: 'Futurock',
      channel: '@futurock',
      video_title: 'FURIA BEBÉ con Malena Pichot y Señorita Bimbo - Programa Completo',
      thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&h=160&fit=crop&crop=faces&q=80',
      live: 'finished',
      concurrent_viewers: 14200,
      old_viewers: 14200,
      current_likes: 18900,
      old_likes: 18900,
      scrape_date: '2026-10-29 16:34:09',
      start_date: '2026-10-29 13:00:00',
      max_users: 24800,
      max_likes: 18900,
      superchats: [
        { currency: 'ARS', total_amount: 100 },
      ],
      data: generateMinuteData(24800, 18900, 13, 16),
    },
  ],
  UCnZidingmuqNkaT9Wm64Xxg: [
    {
      video_id: 'luzu_past_01',
      channel_id: 'UCnZidingmuqNkaT9Wm64Xxg',
      channel_name: 'LUZU TV',
      channel: '@luzutv',
      video_title: 'NADIE DICE NADA - Especial desde la Costa Atlántica',
      thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&h=160&fit=crop&crop=faces&q=80',
      live: 'finished',
      concurrent_viewers: 14200,
      old_viewers: 14200,
      current_likes: 64800,
      old_likes: 64800,
      scrape_date: '2026-10-29 13:00:00',
      start_date: '2026-10-29 10:00:00',
      max_users: 78500,
      max_likes: 64800,
      superchats: [
        { currency: 'ARS', total_amount: 620000 },
        { currency: 'USD', total_amount: 180 },
      ],
      data: generateMinuteData(78500, 64800, 10, 18),
    },
    {
      video_id: 'luzu_past_02',
      channel_id: 'UCnZidingmuqNkaT9Wm64Xxg',
      channel_name: 'LUZU TV',
      channel: '@luzutv',
      video_title: 'ANTES QUE NADIE con Diego Leuco, Yoyi Francella, Mica Vázquez y Trinche',
      thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&h=160&fit=crop&crop=faces&q=80',
      live: 'finished',
      concurrent_viewers: 8900,
      old_viewers: 8900,
      current_likes: 38200,
      old_likes: 38200,
      scrape_date: '2026-10-29 10:00:00',
      start_date: '2026-10-29 08:00:00',
      max_users: 42100,
      max_likes: 38200,
      data: generateMinuteData(42100, 38200, 8, 12),
    },
    {
      video_id: 'luzu_past_03',
      channel_id: 'UCnZidingmuqNkaT9Wm64Xxg',
      channel_name: 'LUZU TV',
      channel: '@luzutv',
      video_title: 'PATRIA Y FAMILIA - Fede Popgold, Anita Espósito y Lucas Spadafora',
      thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&h=160&fit=crop&crop=faces&q=80',
      live: 'finished',
      concurrent_viewers: 6400,
      old_viewers: 6400,
      current_likes: 29400,
      old_likes: 29400,
      scrape_date: '2026-10-28 17:00:00',
      start_date: '2026-10-28 15:00:00',
      max_users: 31800,
      max_likes: 29400,
      data: generateMinuteData(31800, 29400, 15, 12),
    },
    {
      video_id: 'luzu_past_04',
      channel_id: 'UCnZidingmuqNkaT9Wm64Xxg',
      channel_name: 'LUZU TV',
      channel: '@luzutv',
      video_title: 'NADIE DICE NADA - Entrevista Exclusiva con Invitado Sorpresa',
      thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&h=160&fit=crop&crop=faces&q=80',
      live: 'finished',
      concurrent_viewers: 12100,
      old_viewers: 12100,
      current_likes: 58900,
      old_likes: 58900,
      scrape_date: '2026-10-28 13:00:00',
      start_date: '2026-10-28 10:00:00',
      max_users: 71200,
      max_likes: 58900,
      data: generateMinuteData(71200, 58900, 10, 18),
    },
    {
      video_id: 'luzu_past_05',
      channel_id: 'UCnZidingmuqNkaT9Wm64Xxg',
      channel_name: 'LUZU TV',
      channel: '@luzutv',
      video_title: 'TARDE DE TERTULIA - Programa Completo del Viernes',
      thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&h=160&fit=crop&crop=faces&q=80',
      live: 'finished',
      concurrent_viewers: 5800,
      old_viewers: 5800,
      current_likes: 24500,
      old_likes: 24500,
      scrape_date: '2026-10-25 20:00:00',
      start_date: '2026-10-25 18:00:00',
      max_users: 28400,
      max_likes: 24500,
      data: generateMinuteData(28400, 24500, 18, 12),
    },
  ],
  UCg1X0KSoLhM5z9z_74L9tXw: [
    {
      video_id: 'olga_past_01',
      channel_id: 'UCg1X0KSoLhM5z9z_74L9tXw',
      channel_name: 'OLGA',
      channel: '@olgaenvivo',
      video_title: 'SOÑÉ QUE VOLABA - Invitado Especial en el Estudio de Olga',
      thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=160&h=160&fit=crop&crop=faces&q=80',
      live: 'finished',
      concurrent_viewers: 16800,
      old_viewers: 16800,
      current_likes: 72400,
      old_likes: 72400,
      scrape_date: '2026-10-29 13:00:00',
      start_date: '2026-10-29 10:00:00',
      max_users: 84900,
      max_likes: 72400,
      superchats: [
        { currency: 'ARS', total_amount: 740000 },
        { currency: 'USD', total_amount: 250 },
      ],
      data: generateMinuteData(84900, 72400, 10, 18),
    },
    {
      video_id: 'olga_past_02',
      channel_id: 'UCg1X0KSoLhM5z9z_74L9tXw',
      channel_name: 'OLGA',
      channel: '@olgaenvivo',
      video_title: 'SERÍA INCREÍBLE con Nati Jota, Eial Moldavsky y Damián Betular',
      thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=160&h=160&fit=crop&crop=faces&q=80',
      live: 'finished',
      concurrent_viewers: 9400,
      old_viewers: 9400,
      current_likes: 41200,
      old_likes: 41200,
      scrape_date: '2026-10-29 10:00:00',
      start_date: '2026-10-29 08:00:00',
      max_users: 48900,
      max_likes: 41200,
      data: generateMinuteData(48900, 41200, 8, 12),
    },
    {
      video_id: 'olga_past_03',
      channel_id: 'UCg1X0KSoLhM5z9z_74L9tXw',
      channel_name: 'OLGA',
      channel: '@olgaenvivo',
      video_title: 'PARAÍSO FISCAL - Fer Dente, Cande Molfese y Papry Suasnábar',
      thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=160&h=160&fit=crop&crop=faces&q=80',
      live: 'finished',
      concurrent_viewers: 6800,
      old_viewers: 6800,
      current_likes: 27900,
      old_likes: 27900,
      scrape_date: '2026-10-28 17:00:00',
      start_date: '2026-10-28 14:00:00',
      max_users: 32400,
      max_likes: 27900,
      data: generateMinuteData(32400, 27900, 14, 18),
    },
  ],
};

// Returns past streams for any channel (falling back to generated realistic ones)
export function getPastStreamsForChannel(channel: Channel): Stream[] {
  if (PAST_STREAMS_BY_CHANNEL[channel.channel_id]) {
    return PAST_STREAMS_BY_CHANNEL[channel.channel_id];
  }
  const peak = Math.round(channel.avg_viewers * 1.35);
  return [
    {
      video_id: `${channel.channel_id}_p1`,
      channel_id: channel.channel_id,
      channel_name: channel.channel_name,
      channel: channel.channel,
      video_title: `${channel.channel_name} - Emisión En Vivo Especial`,
      thumb: channel.thumb,
      live: 'finished',
      concurrent_viewers: Math.round(channel.avg_viewers * 0.4),
      old_viewers: Math.round(channel.avg_viewers * 0.4),
      current_likes: Math.round(channel.avg_likes * 2.5),
      old_likes: Math.round(channel.avg_likes * 2.5),
      scrape_date: '2026-10-29 13:00:00',
      start_date: '2026-10-29 10:00:00',
      max_users: peak,
      max_likes: Math.round(channel.avg_likes * 2.5),
      superchats: [{ currency: 'ARS', total_amount: Math.round(channel.avg_viewers * 15) }],
      data: generateMinuteData(peak, Math.round(channel.avg_likes * 2.5), 10, 18),
    },
    {
      video_id: `${channel.channel_id}_p2`,
      channel_id: channel.channel_id,
      channel_name: channel.channel_name,
      channel: channel.channel,
      video_title: `${channel.channel_name} - Programa Central de la Mañana`,
      thumb: channel.thumb,
      live: 'finished',
      concurrent_viewers: Math.round(channel.avg_viewers * 0.3),
      old_viewers: Math.round(channel.avg_viewers * 0.3),
      current_likes: Math.round(channel.avg_likes * 1.8),
      old_likes: Math.round(channel.avg_likes * 1.8),
      scrape_date: '2026-10-28 13:00:00',
      start_date: '2026-10-28 10:00:00',
      max_users: Math.round(peak * 0.85),
      max_likes: Math.round(channel.avg_likes * 1.8),
      data: generateMinuteData(Math.round(peak * 0.85), Math.round(channel.avg_likes * 1.8), 10, 18),
    },
    {
      video_id: `${channel.channel_id}_p3`,
      channel_id: channel.channel_id,
      channel_name: channel.channel_name,
      channel: channel.channel,
      video_title: `${channel.channel_name} - Transmisión en directo`,
      thumb: channel.thumb,
      live: 'finished',
      concurrent_viewers: Math.round(channel.avg_viewers * 0.25),
      old_viewers: Math.round(channel.avg_viewers * 0.25),
      current_likes: Math.round(channel.avg_likes * 1.5),
      old_likes: Math.round(channel.avg_likes * 1.5),
      scrape_date: '2026-10-27 13:00:00',
      start_date: '2026-10-27 10:00:00',
      max_users: Math.round(peak * 0.78),
      max_likes: Math.round(channel.avg_likes * 1.5),
      data: generateMinuteData(Math.round(peak * 0.78), Math.round(channel.avg_likes * 1.5), 10, 18),
    },
  ];
}

// Format numbers with Argentine / European dot as thousands separator (e.g. 52.418)
export function formatNumber(num: number): string {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Format subscriber count (e.g. 1.6M or 450k) exactly as in Laravel Blade:
// $stream->subs >= 1000000 ? number_format($stream->subs/1000000,1,".",",") . "M" : number_format($stream->subs/1000,0,".",",") . "k"
export function formatSubs(subs: number): string {
  if (subs >= 1000000) {
    return (subs / 1000000).toFixed(1) + 'M';
  }
  return Math.round(subs / 1000) + 'k';
}
