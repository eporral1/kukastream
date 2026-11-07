export interface DbSuperchat {
  id?: number | string;
  created_at: string;
  amount: number;
  currency: string;
  video_id: string;
  superchat_id?: string;
  superchat_text?: string | null;
  video_title?: string;
}

export interface DbComment {
  id?: number | string;
  created_at: string;
  video_id: string;
  author_id: string;
  comment_id?: string;
  comment_text?: string | null;
  video_title?: string;
}

export interface TopCommentator {
  rank: number;
  author_id: string;
  comment_count: number;
  streams_count?: number;
  first_comment_at?: string;
  last_comment_at?: string;
  latest_comment?: string | null;
  percentage?: number;
}

export interface Superchat {
  id?: number | string;
  created_at?: string;
  currency: string;
  amount?: number;
  total_amount?: number;
  video_id?: string;
  superchat_id?: string;
  superchat_text?: string | null;
}

export interface CommentItem {
  id: string | number;
  created_at?: string;
  video_id?: string;
  author_id?: string;
  author?: string;
  comment_id?: string;
  comment_text?: string | null;
  content?: string;
  timestamp?: string;
  is_superchat?: boolean;
  superchat_amount?: number;
  superchat_currency?: string;
  superchat_text?: string | null;
}

export interface MinuteDataPoint {
  scrape_date: string; // HH:mm
  raw_date?: string;
  concurrent_viewers: number;
  likes: number;
  chat_count?: number;
  authors_count?: number;
  comments_count: number;
}

export interface AvgDataPoint {
  scrape_date1: string; // HH:mm
  avg_viewers: number;
  avg_likes: number;
}

export interface HourDayData {
  hour: number;
  mon_viewers?: number;
  mon_likes?: number;
  tue_viewers?: number;
  tue_likes?: number;
  wed_viewers?: number;
  wed_likes?: number;
  thu_viewers?: number;
  thu_likes?: number;
  fri_viewers?: number;
  fri_likes?: number;
  sat_viewers?: number;
  sat_likes?: number;
  sun_viewers?: number;
  sun_likes?: number;
}

export interface Stream {
  video_id: string;
  channel_id: string;
  channel_name: string;
  channel: string; // @handle or slug
  video_title: string;
  thumb: string;
  live: 'live' | 'none' | 'finished' | string;
  concurrent_viewers: number;
  old_viewers: number;
  current_likes: number;
  old_likes: number;
  scrape_date: string;
  start_date?: string;
  start_fixed?: number;
  max_users?: number;
  max_viewers?: number;
  max_likes?: number;
  superchats?: Superchat[];
  superchats_total?: number | string;
  superchats_count?: number;
  comments_count?: number;
  unique_commentators?: number;
  comments?: CommentItem[];
  data?: MinuteDataPoint[];
  type?: string;
  avg_viewers?: number;
  captions?: string;
}

export interface Channel {
  channel_id: string;
  channel: string; // e.g. "@luzutv"
  channel_name: string;
  description: string;
  subs: number;
  thumb: string;
  tags: string; // comma or space separated: "stream, entretenimiento, radio"
  twitter?: string;
  avg_viewers: number;
  avg_likes: number;
  avg_comments?: number;
  likes_per_viewer?: number;
  comments_per_viewer?: number;
  type?: string;
  banner?: string;
  superchats_count?: number;
  superchats_total_ars?: number;
  comments_sample?: CommentItem[];
  active?: number | string | boolean;
  peak_viewers?: number;
  peak_likes?: number;
  peak_comments?: number;
  total_likes?: number;
  total_comments?: number;
  total_streams?: number;
}

export type CategoryTag = 'all' | 'stream' | 'tv' | 'entretenimiento' | 'radio' | 'política' | 'deportes';

export interface SuperchatChannelRanking {
  rank: number;
  channel_id: string;
  channel: string;
  channel_name: string;
  thumb: string;
  total_ars: number;
  superchats_count: number;
  streams_count: number;
  avg_per_superchat?: number;
}

export interface SuperchatVideoRanking {
  rank: number;
  video_id: string;
  video_title: string;
  channel: string;
  channel_name: string;
  channel_thumb: string;
  total_ars: number;
  superchats_count: number;
  last_date?: string;
  avg_per_superchat?: number;
}
