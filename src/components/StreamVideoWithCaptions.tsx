import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Subtitles, Play, RefreshCw, Clock, Users, List, Megaphone } from 'lucide-react';
import { MinuteDataPoint } from '../types';
import { formatNumber } from '../data/mockData';
import { VideoAdsPanel, VideoAdsAnalysis } from './VideoAdsPanel';

export interface VideoCaptionWord {
  t: number;
  w: string;
}

export interface VideoCaptionCue {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: VideoCaptionWord[];
  source?: 'youtube' | 'ai';
}

interface RollingCaptionLine {
  id: string;
  start: number;
  end: number;
  text: string;
  words: VideoCaptionWord[];
}

type CaptionDownloadStatus = 'idle' | 'downloading' | 'complete' | 'unavailable';

interface StreamVideoWithCaptionsProps {
  videoId: string;
  videoTitle?: string;
  startDate?: string | null;
  videoStartDate?: string | null;
  endDate?: string | null;
  isLive?: boolean;
  timelinePoints?: MinuteDataPoint[];
  defaultShowAdsPanel?: boolean;
  initialAdsAnalysis?: VideoAdsAnalysis | null;
  hideClockAdjustment?: boolean;
  separateLightAdsPanel?: boolean;
  alwaysShowAdsPanel?: boolean;
  hideReanalyze?: boolean;
  allowAdTimestampAdjust?: boolean;
  showVideo?: boolean;
  onRequestShowVideo?: () => void;
  showAds?: boolean;
  onCloseAds?: () => void;
  hideInternalAdsButton?: boolean;
  allowDeleteAds?: boolean;
  allowAnalyzeAds?: boolean;
  allowCaptionDownload?: boolean;
  hideTranscriptButton?: boolean;
  transcribeTriggerSeq?: number;
  onAdsStateChange?: (state: { count: number | null; loading: boolean }) => void;
  onCaptionsStateChange?: (state: {
    status: CaptionDownloadStatus;
    count: number;
    progress: number;
    transcriptOpen: boolean;
  }) => void;
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    __ytApiReadyCallbacks?: Array<() => void>;
  }
}

function loadYouTubeIframeApi(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return;
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    if (!window.__ytApiReadyCallbacks) {
      window.__ytApiReadyCallbacks = [];
    }
    window.__ytApiReadyCallbacks.push(() => {
      resolve(window.YT);
    });

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') {
        try {
          prevReady();
        } catch {
          // ignore
        }
      }
      const cbs = window.__ytApiReadyCallbacks || [];
      window.__ytApiReadyCallbacks = [];
      cbs.forEach((cb) => cb());
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
  });
}

function formatOffsetTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function parseDbTimestampMs(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str) return null;

  const match = str.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const hour = match[4] !== undefined ? parseInt(match[4], 10) : 0;
    const minute = match[5] !== undefined ? parseInt(match[5], 10) : 0;
    const second = match[6] !== undefined ? parseInt(match[6], 10) : 0;
    return Date.UTC(year, month - 1, day, hour, minute, second);
  }

  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? null : parsed;
}

function formatClockTimeFromMs(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatShortClockFromMs(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatSignedClockOffset(seconds: number): string {
  if (!seconds) return '0s';
  const sign = seconds > 0 ? '+' : '-';
  const abs = Math.abs(Math.round(seconds));
  const hrs = Math.floor(abs / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return `${sign}${parts.join('')}`;
}

/**
 * Splits cues into YouTube-sized single lines (~42 chars max) with word-level timestamps
 * so the HTML caption renderer rolls line-by-line and word-by-word just like YouTube's embed.
 */
function buildYouTubeCaptionLines(cues: VideoCaptionCue[]): RollingCaptionLine[] {
  const MAX_LINE_CHARS = 44;
  const lines: RollingCaptionLine[] = [];

  for (const cue of cues) {
    const cleanText = String(cue.text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) continue;

    // Build word list with timestamps (native YouTube tOffsetMs if present, else proportional)
    let wordEntries: VideoCaptionWord[] = [];
    if (Array.isArray(cue.words) && cue.words.length > 0) {
      wordEntries = cue.words
        .map((item) => ({ t: Number(item.t), w: String(item.w || '').trim() }))
        .filter((item) => item.w.length > 0);
    } else {
      const tokens = cleanText.split(' ').filter(Boolean);
      const totalChars = Math.max(1, tokens.reduce((sum, w) => sum + w.length + 1, 0));
      const span = Math.max(0.4, cue.end - cue.start);
      let accChars = 0;
      wordEntries = tokens.map((w) => {
        const t = cue.start + (accChars / totalChars) * span;
        accChars += w.length + 1;
        return { t: Number(t.toFixed(2)), w };
      });
    }

    if (wordEntries.length === 0) continue;

    // Group words into YouTube-width lines (<= 44 chars)
    const grouped: VideoCaptionWord[][] = [];
    let currentGroup: VideoCaptionWord[] = [];
    let currentLen = 0;

    for (const entry of wordEntries) {
      const nextLen = currentLen === 0 ? entry.w.length : currentLen + 1 + entry.w.length;
      if (currentGroup.length > 0 && nextLen > MAX_LINE_CHARS) {
        grouped.push(currentGroup);
        currentGroup = [entry];
        currentLen = entry.w.length;
      } else {
        currentGroup.push(entry);
        currentLen = nextLen;
      }
    }
    if (currentGroup.length > 0) {
      grouped.push(currentGroup);
    }

    for (let gIdx = 0; gIdx < grouped.length; gIdx++) {
      const grp = grouped[gIdx];
      const lineStart = grp[0].t;
      const nextGrpStart = gIdx + 1 < grouped.length ? grouped[gIdx + 1][0].t : cue.end;
      const lineEnd = Math.max(lineStart + 0.5, nextGrpStart);
      lines.push({
        id: `${cue.id}-l${gIdx}`,
        start: Number(lineStart.toFixed(2)),
        end: Number(lineEnd.toFixed(2)),
        text: grp.map((x) => x.w).join(' '),
        words: grp,
      });
    }
  }

  lines.sort((a, b) => a.start - b.start);
  return lines;
}

/**
 * Binary search for active YouTube rolling caption line at currentTime in O(log n).
 */
function findActiveLineIndex(lines: RollingCaptionLine[], currentTime: number): number {
  if (lines.length === 0) return -1;

  let lo = 0;
  let hi = lines.length - 1;
  let candidate = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].start <= currentTime + 0.15) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (candidate === -1) return -1;

  const line = lines[candidate];
  if (currentTime <= line.end + 1.8) {
    return candidate;
  }

  return -1;
}

interface NormalizedMeasurement {
  tMs: number;
  viewers: number;
  label: string;
}

interface SyncedAudienceState {
  targetMs: number | null;
  clockTimeLabel: string | null;
  viewers: number | null;
  isInterpolated: boolean;
  clampedEdge?: 'before' | 'after' | null;
  clampedLabel?: string;
  rangeStartLabel?: string;
  rangeEndLabel?: string;
  prevLabel?: string;
  prevViewers?: number;
  nextLabel?: string;
  nextViewers?: number;
}

export const StreamVideoWithCaptions: React.FC<StreamVideoWithCaptionsProps> = ({
  videoId,
  videoTitle,
  startDate,
  videoStartDate,
  endDate,
  isLive = false,
  timelinePoints = [],
  defaultShowAdsPanel = false,
  initialAdsAnalysis = null,
  hideClockAdjustment = false,
  separateLightAdsPanel = false,
  alwaysShowAdsPanel = false,
  hideReanalyze = false,
  allowAdTimestampAdjust = false,
  showVideo,
  onRequestShowVideo,
  showAds,
  onCloseAds,
  hideInternalAdsButton = false,
  allowDeleteAds = false,
  allowAnalyzeAds = false,
  allowCaptionDownload = false,
  hideTranscriptButton = false,
  transcribeTriggerSeq = 0,
  onAdsStateChange,
  onCaptionsStateChange,
}) => {
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const playerInstanceRef = useRef<any>(null);
  const captionsListRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const downloadTriggeredRef = useRef<boolean>(false);
  const latestCurrentTimeRef = useRef<number>(0);
  const pendingSeekSecRef = useRef<number | null>(null);
  const onAdsStateChangeRef = useRef(onAdsStateChange);
  onAdsStateChangeRef.current = onAdsStateChange;
  const onCaptionsStateChangeRef = useRef(onCaptionsStateChange);
  onCaptionsStateChangeRef.current = onCaptionsStateChange;

  const isVideoVisible = showVideo !== undefined ? showVideo : true;

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Full downloaded subtitle track (downloaded ONCE per video, then synced purely locally by currentTime)
  const [cues, setCues] = useState<VideoCaptionCue[]>([]);
  const [captionStatus, setCaptionStatus] = useState<CaptionDownloadStatus>('idle');
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [showTranscriptList, setShowTranscriptList] = useState<boolean>(false);

  // Commercial Ad / PNT Detector state (powered by these exact native YouTube captions)
  const [showAdsPanel, setShowAdsPanel] = useState<boolean>(defaultShowAdsPanel);
  const [adsAnalysis, setAdsAnalysis] = useState<VideoAdsAnalysis | null>(initialAdsAnalysis);
  const [adsLoading, setAdsLoading] = useState<boolean>(false);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [deletingAds, setDeletingAds] = useState<boolean>(false);

  const isAdsVisible = alwaysShowAdsPanel
    ? true
    : showAds !== undefined
    ? showAds
    : showAdsPanel;

  // Manual real-clock adjustment in seconds to align DB start_date with the on-screen broadcast clock
  const hasManualOffsetRef = useRef<boolean>(false);
  const offsetSaveTimerRef = useRef<number | null>(null);
  const [clockOffsetSec, setClockOffsetSec] = useState<number>(() => {
    if (typeof initialAdsAnalysis?.clock_offset_sec === 'number' && Number.isFinite(initialAdsAnalysis.clock_offset_sec)) {
      return Math.round(initialAdsAnalysis.clock_offset_sec);
    }
    try {
      const saved = window.localStorage.getItem(`stream_clock_offset_${videoId}`);
      const num = saved !== null ? Number(saved) : 0;
      return Number.isFinite(num) ? num : 0;
    } catch {
      return 0;
    }
  });

  const persistOffsetToDb = useCallback(
    (nextOffset: number) => {
      if (!videoId) return;
      if (offsetSaveTimerRef.current !== null) {
        window.clearTimeout(offsetSaveTimerRef.current);
      }
      offsetSaveTimerRef.current = window.setTimeout(() => {
        fetch('/api/detect-ads', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-App-Client': 'kukastream-web',
          },
          body: JSON.stringify({
            video_id: videoId,
            clock_offset_sec: nextOffset,
          }),
        }).catch(() => {
          // ignore background persistence error
        });
      }, 350);
    },
    [videoId]
  );

  const adjustClockOffset = useCallback(
    (deltaSec: number | null) => {
      hasManualOffsetRef.current = true;
      setClockOffsetSec((prev) => {
        const next = deltaSec === null ? 0 : prev + deltaSec;
        try {
          if (next === 0) {
            window.localStorage.removeItem(`stream_clock_offset_${videoId}`);
          } else {
            window.localStorage.setItem(`stream_clock_offset_${videoId}`, String(next));
          }
        } catch {
          // ignore storage errors
        }
        persistOffsetToDb(next);
        return next;
      });
    },
    [videoId, persistOffsetToDb]
  );

  // Per-row individual ad timestamp adjustment (+/-10s) without changing the global clock offset
  const adsAnalysisRef = useRef<VideoAdsAnalysis | null>(adsAnalysis);
  useEffect(() => {
    adsAnalysisRef.current = adsAnalysis;
  }, [adsAnalysis]);

  const adSaveTimersRef = useRef<Map<string, number>>(new Map());
  const handleAdjustAdTimestamp = useCallback(
    (adId: string, deltaSec: number) => {
      if (!adId || !Number.isFinite(deltaSec)) return;
      const current = adsAnalysisRef.current;
      if (!current || !Array.isArray(current.ads)) return;

      const targetAd = current.ads.find((a) => a.id === adId);
      if (!targetAd) return;

      const prevStart = Number(targetAd.start_sec) || 0;
      const nextStart = Math.max(0, Math.round(prevStart + deltaSec));
      const appliedDelta = nextStart - prevStart;
      const origDuration = Math.max(
        5,
        Number(targetAd.duration_sec) || Math.max(5, (Number(targetAd.end_sec) || prevStart + 15) - prevStart)
      );
      const nextEnd = Math.max(
        nextStart + 5,
        Math.round((Number(targetAd.end_sec) || prevStart + origDuration) + appliedDelta)
      );

      const nextAnalysis: VideoAdsAnalysis = {
        ...current,
        ads: current.ads.map((ad) =>
          ad.id === adId
            ? {
                ...ad,
                start_sec: nextStart,
                end_sec: nextEnd,
                duration_sec: Math.max(5, nextEnd - nextStart),
              }
            : ad
        ),
      };

      adsAnalysisRef.current = nextAnalysis;
      setAdsAnalysis(nextAnalysis);

      if (!videoId) return;
      const existingTimer = adSaveTimersRef.current.get(adId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      const timerId = window.setTimeout(() => {
        adSaveTimersRef.current.delete(adId);
        fetch('/api/detect-ads', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-App-Client': 'kukastream-web',
          },
          body: JSON.stringify({
            video_id: videoId,
            ad_id: adId,
            start_sec: nextStart,
            end_sec: nextEnd,
          }),
        }).catch(() => {
          // ignore background persistence error
        });
      }, 350);
      adSaveTimersRef.current.set(adId, timerId);
    },
    [videoId]
  );

  // Per-row individual real-clock adjustment (-1h/-1m/-10s/+10s/+1m/+1h) without moving video seek or global offset
  const adClockSaveTimersRef = useRef<Map<string, number>>(new Map());
  const handleAdjustAdClockOffset = useCallback(
    (adId: string, deltaSec: number | null) => {
      if (!adId) return;
      const current = adsAnalysisRef.current;
      if (!current || !Array.isArray(current.ads)) return;

      const targetAd = current.ads.find((a) => a.id === adId);
      if (!targetAd) return;

      const prevOffset = Math.round(Number(targetAd.clock_offset_sec) || 0);
      const nextOffset = deltaSec === null ? 0 : prevOffset + Math.round(deltaSec);

      const nextAnalysis: VideoAdsAnalysis = {
        ...current,
        ads: current.ads.map((ad) =>
          ad.id === adId
            ? {
                ...ad,
                clock_offset_sec: nextOffset === 0 ? undefined : nextOffset,
              }
            : ad
        ),
      };

      adsAnalysisRef.current = nextAnalysis;
      setAdsAnalysis(nextAnalysis);

      if (!videoId) return;
      const existingTimer = adClockSaveTimersRef.current.get(adId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      const timerId = window.setTimeout(() => {
        adClockSaveTimersRef.current.delete(adId);
        fetch('/api/detect-ads', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-App-Client': 'kukastream-web',
          },
          body: JSON.stringify({
            video_id: videoId,
            ad_id: adId,
            ad_clock_offset_sec: nextOffset,
          }),
        }).catch(() => {
          // ignore background persistence error
        });
      }, 350);
      adClockSaveTimersRef.current.set(adId, timerId);
    },
    [videoId]
  );

  // Per-row editable brand name persisted to PostgreSQL
  const handleRenameAdBrand = useCallback(
    (adId: string, newBrand: string) => {
      const cleanBrand = String(newBrand || '').trim().slice(0, 120);
      if (!adId || !cleanBrand) return;
      const current = adsAnalysisRef.current;
      if (!current || !Array.isArray(current.ads)) return;

      const nextAds = current.ads.map((ad) =>
        ad.id === adId ? { ...ad, brand: cleanBrand } : ad
      );
      const nextUniqueBrands = Array.from(
        new Set(
          nextAds
            .map((a) => String(a.brand || '').trim())
            .filter((b) => b && b !== 'Anunciante / PNT detectado')
        )
      );
      const nextAnalysis: VideoAdsAnalysis = {
        ...current,
        ads: nextAds,
        unique_brands: nextUniqueBrands,
      };

      adsAnalysisRef.current = nextAnalysis;
      setAdsAnalysis(nextAnalysis);

      if (!videoId) return;
      fetch('/api/detect-ads', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Client': 'kukastream-web',
        },
        body: JSON.stringify({
          video_id: videoId,
          ad_id: adId,
          brand: cleanBrand,
        }),
      }).catch(() => {
        // ignore background persistence error
      });
    },
    [videoId]
  );

  const applyServerCaptionResponse = useCallback((data: any) => {
    if (!data?.success) return;
    if (Array.isArray(data.cues)) {
      setCues(data.cues);
    }
    if (data.status) {
      setCaptionStatus(data.status as CaptionDownloadStatus);
    }
    if (data.reason) {
      setUnavailableReason(String(data.reason));
    }
    if (typeof data.progress === 'number') {
      setDownloadProgress(data.progress);
    }
  }, []);

  // Poll / read cached track (passes current playhead as priority hint ONLY while one-time download runs)
  const fetchCachedCaptions = useCallback(
    async (withPriorityHint = false) => {
      if (!videoId) return;
      try {
        const params = new URLSearchParams({ video_id: videoId });
        if (startDate) params.set('start_date', startDate);
        if (endDate) params.set('end_date', endDate);
        if (isLive) params.set('is_live', '1');
        if (withPriorityHint && latestCurrentTimeRef.current > 0) {
          params.set('priority_time', String(Math.floor(latestCurrentTimeRef.current)));
        }

        const res = await fetch(`/api/video-captions?${params.toString()}`, {
          headers: { 'X-App-Client': 'kukastream-web' },
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data) {
          applyServerCaptionResponse(data);
          if (
            data.status === 'complete' ||
            data.status === 'downloading' ||
            data.status === 'unavailable'
          ) {
            downloadTriggeredRef.current = true;
          }
        }
      } catch (err) {
        console.warn('[StreamVideoWithCaptions] Error reading cached captions:', err);
      }
    },
    [videoId, startDate, endDate, isLive, applyServerCaptionResponse]
  );

  // Trigger ONE single full-video subtitle download (explicitly initiated by admin button)
  const triggerFullCaptionDownloadOnce = useCallback(async (forceRetry = false) => {
    if (!videoId || !allowCaptionDownload) return;
    if (!forceRetry && downloadTriggeredRef.current) return;
    downloadTriggeredRef.current = true;
    setCaptionStatus('downloading');

    let resolvedDuration = videoDuration;
    const p = playerInstanceRef.current;
    if ((!resolvedDuration || resolvedDuration <= 0) && p && typeof p.getDuration === 'function') {
      try {
        const d = Number(p.getDuration() || 0);
        if (d > 0) {
          resolvedDuration = d;
          setVideoDuration(d);
        }
      } catch {
        // ignore
      }
    }

    try {
      const res = await fetch('/api/video-captions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Client': 'kukastream-web',
        },
        body: JSON.stringify({
          video_id: videoId,
          start_date: startDate || null,
          end_date: endDate || null,
          duration: resolvedDuration > 0 ? Math.round(resolvedDuration) : null,
          priority_time: Math.floor(latestCurrentTimeRef.current || 0),
          is_live: isLive,
          download_all: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        applyServerCaptionResponse(data);
      }
    } catch (err) {
      console.warn('[StreamVideoWithCaptions] Error starting full caption download:', err);
    }
  }, [videoId, allowCaptionDownload, startDate, endDate, videoDuration, isLive, applyServerCaptionResponse]);

  const handleAnalyzeAds = useCallback(
    async (force = false) => {
      if (!videoId || adsLoading || !allowAnalyzeAds) return;
      setAdsLoading(true);
      setAdsError(null);
      try {
        const res = await fetch('/api/detect-ads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-App-Client': 'kukastream-web',
          },
          body: JSON.stringify({
            video_id: videoId,
            force,
            start_date: startDate || null,
            end_date: endDate || null,
            video_title: videoTitle || undefined,
            clock_offset_sec: clockOffsetSec,
            save_offset: hasManualOffsetRef.current || force,
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          setAdsAnalysis(data as VideoAdsAnalysis);
          if (typeof data.clock_offset_sec === 'number' && !hasManualOffsetRef.current) {
            setClockOffsetSec(data.clock_offset_sec);
            try {
              if (data.clock_offset_sec === 0) {
                window.localStorage.removeItem(`stream_clock_offset_${videoId}`);
              } else {
                window.localStorage.setItem(
                  `stream_clock_offset_${videoId}`,
                  String(data.clock_offset_sec)
                );
              }
            } catch {
              // ignore
            }
          }
          // If captions were downloaded on the server during ad detection, refresh local cues too
          if (cues.length === 0) {
            fetchCachedCaptions(false);
          }
        } else {
          setAdsError(data?.error || 'No se pudieron detectar anuncios en este video.');
        }
      } catch (err: any) {
        setAdsError(err?.message || 'Error de conexión al analizar anuncios.');
      } finally {
        setAdsLoading(false);
      }
    },
    [
      videoId,
      allowAnalyzeAds,
      startDate,
      endDate,
      videoTitle,
      clockOffsetSec,
      adsLoading,
      cues.length,
      fetchCachedCaptions,
    ]
  );

  // Delete ad measurement from public.video_ads_cache so it no longer appears in /brands
  const handleDeleteAds = useCallback(async () => {
    if (!videoId || deletingAds) return;
    setDeletingAds(true);
    setAdsError(null);
    try {
      const res = await fetch(`/api/detect-ads?video_id=${encodeURIComponent(videoId)}`, {
        method: 'DELETE',
        headers: { 'X-App-Client': 'kukastream-web' },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        adsAnalysisRef.current = null;
        setAdsAnalysis(null);
        setShowAdsPanel(false);
        onCloseAds?.();
      } else {
        setAdsError(data?.error || 'No se pudo borrar la medición de anuncios.');
      }
    } catch (err: any) {
      setAdsError(err?.message || 'Error de conexión al borrar la medición.');
    } finally {
      setDeletingAds(false);
    }
  }, [videoId, deletingAds, onCloseAds]);

  // Report ads count & loading status upward for external toolbar button
  useEffect(() => {
    onAdsStateChangeRef.current?.({
      count: adsAnalysis ? adsAnalysis.total_ads : null,
      loading: adsLoading,
    });
  }, [adsAnalysis, adsLoading]);

  // Report captions / transcription status upward for external admin toolbar button
  useEffect(() => {
    onCaptionsStateChangeRef.current?.({
      status: captionStatus,
      count: cues.length,
      progress: downloadProgress,
      transcriptOpen: showTranscriptList,
    });
  }, [captionStatus, cues.length, downloadProgress, showTranscriptList]);

  // Auto-trigger ad detection when externally toggled open in admin mode and no cached result exists yet
  const prevAdsVisibleRef = useRef<boolean>(isAdsVisible);
  useEffect(() => {
    const wasVisible = prevAdsVisibleRef.current;
    prevAdsVisibleRef.current = isAdsVisible;
    if (!wasVisible && isAdsVisible && !adsAnalysis && !adsLoading && allowAnalyzeAds) {
      handleAnalyzeAds(false);
    }
  }, [isAdsVisible, adsAnalysis, adsLoading, allowAnalyzeAds, handleAnalyzeAds]);

  // Handle explicit transcription trigger from parent admin toolbar button
  const lastTranscribeSeqRef = useRef<number>(transcribeTriggerSeq);
  useEffect(() => {
    if (transcribeTriggerSeq === lastTranscribeSeqRef.current) return;
    lastTranscribeSeqRef.current = transcribeTriggerSeq;
    if (transcribeTriggerSeq <= 0 || !allowCaptionDownload) return;

    if (cues.length > 0) {
      if (!isVideoVisible) {
        onRequestShowVideo?.();
        setShowTranscriptList(true);
      } else {
        setShowTranscriptList((prev) => !prev);
      }
      return;
    }

    if (captionStatus !== 'downloading') {
      triggerFullCaptionDownloadOnce(true);
    }
  }, [
    transcribeTriggerSeq,
    allowCaptionDownload,
    cues.length,
    captionStatus,
    isVideoVisible,
    onRequestShowVideo,
    triggerFullCaptionDownloadOnce,
  ]);

  // 1. On mount / videoId change: load any already-cached full subtitle track AND cached PNT analysis + saved clock_offset_sec
  useEffect(() => {
    let cancelled = false;
    downloadTriggeredRef.current = false;
    hasManualOffsetRef.current = false;
    if (offsetSaveTimerRef.current !== null) {
      window.clearTimeout(offsetSaveTimerRef.current);
      offsetSaveTimerRef.current = null;
    }
    setCues([]);
    setCaptionStatus('idle');
    setDownloadProgress(0);
    setAdsAnalysis(initialAdsAnalysis || null);
    setAdsError(null);
    setShowAdsPanel(Boolean(defaultShowAdsPanel));
    if (typeof initialAdsAnalysis?.clock_offset_sec === 'number') {
      setClockOffsetSec(initialAdsAnalysis.clock_offset_sec);
    } else {
      try {
        const saved = window.localStorage.getItem(`stream_clock_offset_${videoId}`);
        const num = saved !== null ? Number(saved) : 0;
        setClockOffsetSec(Number.isFinite(num) ? num : 0);
      } catch {
        setClockOffsetSec(0);
      }
    }
    fetchCachedCaptions(false);

    // Hydrate cached PNT analysis + DB-persisted clock_offset_sec if already analyzed (skip if parent already hydrated it)
    if (videoId && !initialAdsAnalysis) {
      fetch(`/api/detect-ads?video_id=${encodeURIComponent(videoId)}&cache_only=1`, {
        headers: { 'X-App-Client': 'kukastream-web' },
      })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || !data?.success || !data?.found) return;
          setAdsAnalysis(data as VideoAdsAnalysis);
          if (typeof data.clock_offset_sec === 'number' && !hasManualOffsetRef.current) {
            setClockOffsetSec(data.clock_offset_sec);
            try {
              if (data.clock_offset_sec === 0) {
                window.localStorage.removeItem(`stream_clock_offset_${videoId}`);
              } else {
                window.localStorage.setItem(
                  `stream_clock_offset_${videoId}`,
                  String(data.clock_offset_sec)
                );
              }
            } catch {
              // ignore
            }
          }
        })
        .catch(() => {
          // ignore cache probe error
        });
    }

    return () => {
      cancelled = true;
      if (offsetSaveTimerRef.current !== null) {
        window.clearTimeout(offsetSaveTimerRef.current);
        offsetSaveTimerRef.current = null;
      }
    };
  }, [fetchCachedCaptions, videoId, defaultShowAdsPanel, initialAdsAnalysis]);

  // Captions are loaded from DB cache on mount; fresh transcription downloads are ONLY triggered explicitly via admin button.

  // 3. While the ONE-TIME download is in progress, poll every 2.5s until complete
  useEffect(() => {
    if (captionStatus !== 'downloading') return;
    const timer = window.setInterval(() => {
      fetchCachedCaptions(true);
    }, 2500);
    return () => clearInterval(timer);
  }, [captionStatus, fetchCachedCaptions]);

  // Initialize YouTube IFrame API player ONLY when video embed is visible, and track currentTime at 100ms while playing
  useEffect(() => {
    if (!isVideoVisible) {
      if (playerInstanceRef.current && typeof playerInstanceRef.current.destroy === 'function') {
        try {
          playerInstanceRef.current.destroy();
        } catch {
          // ignore
        }
        playerInstanceRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    let isMounted = true;
    let fastPollTimer: number | null = null;
    let idlePollTimer: number | null = null;

    const readPlayerState = () => {
      const p = playerInstanceRef.current;
      if (!p) return;
      try {
        if (typeof p.getCurrentTime === 'function') {
          const t = Number(p.getCurrentTime());
          if (!isNaN(t) && t >= 0) {
            latestCurrentTimeRef.current = t;
            setCurrentTime(t);
          }
        }
        if (typeof p.getDuration === 'function') {
          const d = Number(p.getDuration());
          if (!isNaN(d) && d > 0) {
            setVideoDuration((prev) => (prev === d ? prev : d));
          }
        }
      } catch {
        // ignore
      }
    };

    const startFastPolling = () => {
      if (fastPollTimer !== null) return;
      fastPollTimer = window.setInterval(readPlayerState, 100);
    };

    const stopFastPolling = () => {
      if (fastPollTimer !== null) {
        clearInterval(fastPollTimer);
        fastPollTimer = null;
      }
    };

    loadYouTubeIframeApi().then((YT) => {
      if (!isMounted || !playerContainerRef.current || !YT?.Player) return;

      if (playerInstanceRef.current && typeof playerInstanceRef.current.destroy === 'function') {
        try {
          playerInstanceRef.current.destroy();
        } catch {
          // ignore
        }
      }

      playerInstanceRef.current = new YT.Player(playerContainerRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          rel: 0,
          modestbranding: 1,
          cc_load_policy: 1,
          hl: 'es',
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (!isMounted) return;
            readPlayerState();
            if (idlePollTimer === null) {
              idlePollTimer = window.setInterval(readPlayerState, 350);
            }
            if (pendingSeekSecRef.current !== null) {
              const seekTarget = pendingSeekSecRef.current;
              pendingSeekSecRef.current = null;
              try {
                playerInstanceRef.current?.seekTo?.(seekTarget, true);
                playerInstanceRef.current?.playVideo?.();
                playerContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } catch {
                // ignore
              }
            }
          },
          onStateChange: (event: any) => {
            if (!isMounted) return;
            const state = event?.data;
            // YT.PlayerState.PLAYING === 1
            if (state === 1) {
              setIsPlaying(true);
              readPlayerState();
              startFastPolling();
            } else {
              setIsPlaying(false);
              stopFastPolling();
              readPlayerState();
            }
          },
        },
      });
    });

    return () => {
      isMounted = false;
      stopFastPolling();
      if (idlePollTimer !== null) {
        clearInterval(idlePollTimer);
        idlePollTimer = null;
      }
      if (playerInstanceRef.current && typeof playerInstanceRef.current.destroy === 'function') {
        try {
          playerInstanceRef.current.destroy();
        } catch {
          // ignore
        }
        playerInstanceRef.current = null;
      }
    };
  }, [videoId, isVideoVisible]);

  // Build YouTube-width rolling caption lines once whenever downloaded cues update
  const captionLines = useMemo(() => buildYouTubeCaptionLines(cues), [cues]);

  // Compute exact YouTube-style 2-line rolling caption display for currentTime
  const activeLineIndex = useMemo(
    () => findActiveLineIndex(captionLines, currentTime),
    [captionLines, currentTime]
  );

  const rollingWindow = useMemo<{ topLine: string | null; bottomLine: string | null }>(() => {
    if (activeLineIndex < 0) {
      return { topLine: null, bottomLine: null };
    }

    const activeLine = captionLines[activeLineIndex];
    const prevLine = activeLineIndex > 0 ? captionLines[activeLineIndex - 1] : null;

    // Progressive word reveal on bottom line (just like YouTube embed auto-captions)
    const visibleWords = activeLine.words
      .filter((w, idx) => idx === 0 || w.t <= currentTime + 0.15)
      .map((w) => w.w)
      .join(' ');

    // Keep previous line on Line 1 if it finished recently (< 4.5s ago)
    const showTopLine =
      prevLine && currentTime - prevLine.end <= 4.5 ? prevLine.text : null;

    return {
      topLine: showTopLine,
      bottomLine: visibleWords || activeLine.text,
    };
  }, [captionLines, activeLineIndex, currentTime]);

  // Normalize timeline measurements for start_date + offset linear interpolation
  const normalizedMeasurements = useMemo<NormalizedMeasurement[]>(() => {
    if (!timelinePoints || timelinePoints.length === 0) return [];

    const parsedStartMs = parseDbTimestampMs(videoStartDate) ?? parseDbTimestampMs(startDate);
    const items: NormalizedMeasurement[] = [];
    let lastResolvedMs: number | null = parsedStartMs;

    for (const pt of timelinePoints) {
      const viewers = Number(pt.concurrent_viewers);
      if (isNaN(viewers)) continue;

      let tMs = parseDbTimestampMs(pt.raw_date);

      if (tMs === null && pt.scrape_date && /^\d{1,2}:\d{2}/.test(pt.scrape_date)) {
        const [hh, mm] = pt.scrape_date.split(':').map((n) => parseInt(n, 10) || 0);
        const baseRef = lastResolvedMs ?? parsedStartMs ?? Date.now();
        const baseDate = new Date(baseRef);
        let candidate = Date.UTC(
          baseDate.getUTCFullYear(),
          baseDate.getUTCMonth(),
          baseDate.getUTCDate(),
          hh,
          mm,
          0
        );
        if (lastResolvedMs !== null && candidate < lastResolvedMs - 6 * 3600 * 1000) {
          candidate += 24 * 3600 * 1000;
        }
        tMs = candidate;
      }

      if (tMs !== null) {
        lastResolvedMs = tMs;
        items.push({
          tMs,
          viewers,
          label: formatShortClockFromMs(tMs),
        });
      }
    }

    items.sort((a, b) => a.tMs - b.tMs);

    const deduped: NormalizedMeasurement[] = [];
    for (const item of items) {
      if (deduped.length > 0 && deduped[deduped.length - 1].tMs === item.tMs) {
        deduped[deduped.length - 1] = item;
      } else {
        deduped.push(item);
      }
    }

    return deduped;
  }, [timelinePoints, videoStartDate, startDate]);

  // Reusable mathematical linear interpolation helper anchored to the video's first measurement + global & optional per-ad clock sync
  const computeSyncedAudienceAtTime = useCallback(
    (offsetSeconds: number, extraClockOffsetSec = 0): SyncedAudienceState => {
      const startMs =
        parseDbTimestampMs(videoStartDate) ??
        parseDbTimestampMs(startDate) ??
        (normalizedMeasurements.length > 0 ? normalizedMeasurements[0].tMs : null);

      if (startMs === null) {
        return { targetMs: null, clockTimeLabel: null, viewers: null, isInterpolated: false };
      }

      const targetMs =
        startMs + Math.round((offsetSeconds + clockOffsetSec + (Number(extraClockOffsetSec) || 0)) * 1000);
      const clockTimeLabel = formatClockTimeFromMs(targetMs);

      if (normalizedMeasurements.length === 0) {
        return { targetMs, clockTimeLabel, viewers: null, isInterpolated: false };
      }

      const first = normalizedMeasurements[0];
      const last = normalizedMeasurements[normalizedMeasurements.length - 1];

      if (targetMs < first.tMs) {
        return {
          targetMs,
          clockTimeLabel,
          viewers: Math.round(first.viewers),
          isInterpolated: false,
          clampedEdge: 'before',
          clampedLabel: first.label,
          rangeStartLabel: first.label,
          rangeEndLabel: last.label,
        };
      }

      if (targetMs === first.tMs) {
        return {
          targetMs,
          clockTimeLabel,
          viewers: Math.round(first.viewers),
          isInterpolated: false,
          clampedEdge: null,
        };
      }

      if (targetMs > last.tMs) {
        return {
          targetMs,
          clockTimeLabel,
          viewers: Math.round(last.viewers),
          isInterpolated: false,
          clampedEdge: 'after',
          clampedLabel: last.label,
          rangeStartLabel: first.label,
          rangeEndLabel: last.label,
        };
      }

      if (targetMs === last.tMs) {
        return {
          targetMs,
          clockTimeLabel,
          viewers: Math.round(last.viewers),
          isInterpolated: false,
          clampedEdge: null,
        };
      }

      for (let i = 0; i < normalizedMeasurements.length - 1; i++) {
        const p0 = normalizedMeasurements[i];
        const p1 = normalizedMeasurements[i + 1];

        if (targetMs >= p0.tMs && targetMs <= p1.tMs) {
          const span = p1.tMs - p0.tMs;
          if (span <= 0 || targetMs === p0.tMs) {
            return { targetMs, clockTimeLabel, viewers: Math.round(p0.viewers), isInterpolated: false };
          }
          if (targetMs === p1.tMs) {
            return { targetMs, clockTimeLabel, viewers: Math.round(p1.viewers), isInterpolated: false };
          }

          const ratio = (targetMs - p0.tMs) / span;
          const interpolatedViewers = Math.round(p0.viewers + (p1.viewers - p0.viewers) * ratio);

          return {
            targetMs,
            clockTimeLabel,
            viewers: interpolatedViewers,
            isInterpolated: true,
            prevLabel: p0.label,
            prevViewers: Math.round(p0.viewers),
            nextLabel: p1.label,
            nextViewers: Math.round(p1.viewers),
          };
        }
      }

      return { targetMs, clockTimeLabel, viewers: Math.round(last.viewers), isInterpolated: false };
    },
    [videoStartDate, startDate, normalizedMeasurements, clockOffsetSec]
  );

  // Sync start_date + currentTime and linearly interpolate viewers between surrounding measurements
  const syncedAudience = useMemo<SyncedAudienceState>(
    () => computeSyncedAudienceAtTime(currentTime),
    [computeSyncedAudienceAtTime, currentTime]
  );

  // Auto-scroll transcript list if open
  useEffect(() => {
    if (!showTranscriptList || !activeItemRef.current || !captionsListRef.current) return;
    const container = captionsListRef.current;
    const item = activeItemRef.current;
    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    const offsetInsideContainer =
      itemRect.top - containerRect.top + container.scrollTop - containerRect.height / 2 + itemRect.height / 2;

    container.scrollTo({
      top: Math.max(0, offsetInsideContainer),
      behavior: 'smooth',
    });
  }, [activeLineIndex, showTranscriptList]);

  const handleSeekToSecond = useCallback(
    (sec: number) => {
      const targetSec = Math.max(0, Number(sec) || 0);
      latestCurrentTimeRef.current = targetSec;
      setCurrentTime(targetSec);

      if (!isVideoVisible) {
        pendingSeekSecRef.current = targetSec;
        onRequestShowVideo?.();
        return;
      }

      const p = playerInstanceRef.current;
      if (p && typeof p.seekTo === 'function') {
        try {
          p.seekTo(targetSec, true);
          if (typeof p.playVideo === 'function') {
            p.playVideo();
          }
        } catch {
          // ignore
        }
      } else {
        pendingSeekSecRef.current = targetSec;
      }
    },
    [isVideoVisible, onRequestShowVideo]
  );

  const handleSeekToLine = (line: RollingCaptionLine) => {
    handleSeekToSecond(line.start);
  };

  const handleToggleAdsPanel = () => {
    const nextOpen = !showAdsPanel;
    setShowAdsPanel(nextOpen);
    if (nextOpen) {
      setShowTranscriptList(false);
      if (!adsAnalysis && !adsLoading && allowAnalyzeAds) {
        handleAnalyzeAds(false);
      }
    }
  };

  if (!isVideoVisible && !isAdsVisible) {
    return null;
  }

  return (
      <div className="space-y-5">
        {isVideoVisible && (
        <div className="space-y-0 rounded-xl overflow-hidden border border-gray-800 bg-[#0f0f0f] shadow-sm">
          {/* Embedded YouTube Player (above chart) */}
          <div className="relative w-full aspect-video bg-black">
            <div ref={playerContainerRef} className="w-full h-full" />
          </div>

          {/* YouTube-Identical 2-Line Rolling Closed-Caption Stage directly attached below the video */}
          {(cues.length > 0 || captionStatus === 'downloading' || allowCaptionDownload) && (
            <div className="px-4 py-3.5 min-h-[78px] flex flex-col items-center justify-center text-center bg-[#0f0f0f] border-t border-white/10">
              {rollingWindow.bottomLine ? (
                <div className="flex flex-col items-center justify-center gap-0.5 max-w-3xl">
                  {rollingWindow.topLine && (
                    <span className="inline-block bg-black/90 text-white/90 text-[15px] sm:text-[18px] font-normal leading-[1.35] px-2.5 py-0.5 rounded-[3px]">
                      {rollingWindow.topLine}
                    </span>
                  )}
                  <span className="inline-block bg-black/90 text-white text-[15px] sm:text-[18px] font-normal leading-[1.35] px-2.5 py-0.5 rounded-[3px]">
                    {rollingWindow.bottomLine}
                  </span>
                </div>
              ) : captionStatus === 'downloading' ? (
                <div className="inline-flex items-center gap-2 text-xs text-gray-300 bg-black/75 px-3 py-1 rounded">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-white/80" />
                  <span>Cargando subtítulos del video ({downloadProgress}%)...</span>
                </div>
              ) : captionStatus === 'unavailable' ? (
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-gray-400">
                  <span>
                    {unavailableReason === 'youtube_ip_blocked'
                      ? 'Subtítulos nativos de YouTube no accesibles desde este servidor (requiere SUPADATA_API_KEY, YOUTUBE_PROXY_URL o captions en base de datos).'
                      : isLive
                      ? 'Subtítulos en HTML disponibles una vez finalizada y archivada la transmisión en vivo.'
                      : 'Este video no tiene subtítulos disponibles.'}
                  </span>
                  {allowCaptionDownload && (
                    <button
                      type="button"
                      onClick={() => triggerFullCaptionDownloadOnce(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reintentar transcripción</span>
                    </button>
                  )}
                </div>
              ) : captionStatus === 'complete' ? (
                <span className="text-xs text-gray-500"> </span>
              ) : allowCaptionDownload ? (
                <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs text-gray-400">
                  <Subtitles className="w-4 h-4 text-gray-500" />
                  <span>Sin transcripción cargada todavía.</span>
                  <button
                    type="button"
                    onClick={() => triggerFullCaptionDownloadOnce(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white border border-white/20 text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    <Subtitles className="w-3.5 h-3.5" />
                    <span>Hacer transcripción</span>
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Slim Sync & Audience Bar underneath the captions */}
          <div className="px-3.5 py-1.5 bg-gray-900/95 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-300">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-gray-200 bg-black/50 px-2 py-0.5 rounded">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isPlaying ? 'bg-red-500 animate-pulse' : 'bg-gray-500'
                  }`}
                />
                <span>{formatOffsetTime(currentTime)}</span>
              </span>

              {syncedAudience.clockTimeLabel && (
                <div className="inline-flex items-center gap-1.5 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1 text-[11px] text-gray-300 font-mono"
                    title="Hora real de transmisión"
                  >
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span>{syncedAudience.clockTimeLabel} hs</span>
                  </span>

                  {!hideClockAdjustment && (
                    <div
                      className="inline-flex items-center bg-black/50 border border-white/10 rounded overflow-hidden font-mono text-[10px]"
                      title="Ajustar horario real para sincronizar con el reloj en pantalla (actualiza captions, PNTs y audiencia)"
                    >
                <button
                  type="button"
                  onClick={() => adjustClockOffset(-3600)}
                  className="px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Restar 1 hora"
                >
                  -1h
                </button>
                <button
                  type="button"
                  onClick={() => adjustClockOffset(-60)}
                  className="px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-white/10 border-l border-white/10 transition-colors cursor-pointer"
                  title="Restar 1 minuto"
                >
                  -1m
                </button>
                <button
                  type="button"
                  onClick={() => adjustClockOffset(-10)}
                  className="px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-white/10 border-l border-white/10 transition-colors cursor-pointer"
                  title="Restar 10 segundos"
                >
                  -10s
                </button>
                {clockOffsetSec !== 0 && (
                  <button
                    type="button"
                    onClick={() => adjustClockOffset(null)}
                    className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-l border-white/10 font-semibold transition-colors cursor-pointer"
                    title="Clic para volver el ajuste a 0s"
                  >
                    {formatSignedClockOffset(clockOffsetSec)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => adjustClockOffset(10)}
                  className="px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-white/10 border-l border-white/10 transition-colors cursor-pointer"
                  title="Sumar 10 segundos"
                >
                  +10s
                </button>
                <button
                  type="button"
                  onClick={() => adjustClockOffset(60)}
                  className="px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-white/10 border-l border-white/10 transition-colors cursor-pointer"
                  title="Sumar 1 minuto"
                >
                  +1m
                </button>
                <button
                  type="button"
                  onClick={() => adjustClockOffset(3600)}
                  className="px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-white/10 border-l border-white/10 transition-colors cursor-pointer"
                  title="Sumar 1 hora"
                >
                      +1h
                    </button>
                  </div>
                  )}
                </div>
              )}

              {syncedAudience.viewers !== null && (
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] text-blue-200 bg-blue-600/20 border border-blue-500/30 px-2 py-0.5 rounded"
                  title={
                    syncedAudience.isInterpolated &&
                    syncedAudience.prevLabel &&
                    syncedAudience.nextLabel
                      ? `Interpolación lineal entre ${syncedAudience.prevLabel} (${formatNumber(syncedAudience.prevViewers || 0)}) y ${syncedAudience.nextLabel} (${formatNumber(syncedAudience.nextViewers || 0)})`
                      : 'Espectadores registrados en este instante'
                  }
                >
                  <Users className="w-3 h-3 text-blue-400 shrink-0" />
                  <strong className="text-white tabular-nums">
                    {formatNumber(syncedAudience.viewers)}
                  </strong>
                  <span className="text-blue-200/80">usuarios en ese momento</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {captionStatus === 'downloading' && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 font-mono">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>{downloadProgress}%</span>
                </span>
              )}

              {!alwaysShowAdsPanel &&
                !hideInternalAdsButton &&
                (allowAnalyzeAds || (adsAnalysis && adsAnalysis.total_ads > 0)) && (
                  <button
                    type="button"
                    onClick={handleToggleAdsPanel}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded border transition-colors cursor-pointer ${
                      isAdsVisible
                        ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                        : 'bg-gray-800 text-amber-300 border-amber-500/30 hover:bg-amber-500/15 hover:text-amber-200'
                    }`}
                  >
                    <Megaphone className="w-3 h-3" />
                    <span>
                      {adsLoading
                        ? 'Analizando anuncios...'
                        : adsAnalysis
                        ? `Anuncios (${adsAnalysis.total_ads})`
                        : 'Analizar ads'}
                    </span>
                  </button>
                )}

              {!hideTranscriptButton &&
                (captionLines.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showTranscriptList;
                      setShowTranscriptList(next);
                      if (next && !separateLightAdsPanel) setShowAdsPanel(false);
                    }}
                    className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                      showTranscriptList
                        ? 'bg-white/15 text-white border-white/30'
                        : 'bg-gray-800 text-gray-300 border-gray-700 hover:text-white'
                    }`}
                  >
                    <List className="w-3 h-3" />
                    <span>{showTranscriptList ? 'Ocultar transcripción' : 'Transcripción'}</span>
                  </button>
                ) : allowCaptionDownload && captionStatus !== 'downloading' ? (
                  <button
                    type="button"
                    onClick={() => triggerFullCaptionDownloadOnce(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border bg-gray-800 text-gray-200 border-gray-700 hover:text-white hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <Subtitles className="w-3 h-3" />
                    <span>Transcribir</span>
                  </button>
                ) : null)}
            </div>
          </div>

          {/* Synchronized Ad / PNT Detector Panel (inline dark fallback when not separated) */}
          {!separateLightAdsPanel && isAdsVisible && (
            <VideoAdsPanel
              videoId={videoId}
              analysis={adsAnalysis}
              loading={adsLoading}
              error={adsError}
              activeTimeSec={currentTime}
              onAnalyze={(force) => handleAnalyzeAds(Boolean(force))}
              onSeekToSecond={handleSeekToSecond}
              getAudienceAtSecond={computeSyncedAudienceAtTime}
              variant="dark"
              hideReanalyze={hideReanalyze || !allowAnalyzeAds}
              onAdjustAdTimestamp={allowAdTimestampAdjust ? handleAdjustAdTimestamp : undefined}
              onAdjustAdClockOffset={allowAdTimestampAdjust ? handleAdjustAdClockOffset : undefined}
              onRenameAdBrand={allowAdTimestampAdjust ? handleRenameAdBrand : undefined}
              onDeleteAds={allowDeleteAds ? handleDeleteAds : undefined}
              deletingAds={deletingAds}
            />
          )}

          {/* Optional Expandable Full Synchronized Transcript */}
          {showTranscriptList && captionLines.length > 0 && (
            <div
              ref={captionsListRef}
              className="max-h-48 overflow-y-auto divide-y divide-gray-800/80 bg-gray-950 border-t border-white/10"
            >
              {captionLines.map((line, idx) => {
                const isActive = idx === activeLineIndex;
                return (
                  <button
                    key={line.id}
                    ref={isActive ? activeItemRef : null}
                    type="button"
                    onClick={() => handleSeekToLine(line)}
                    className={`w-full text-left px-3.5 py-2 flex items-start gap-3 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-blue-600/25 text-white font-semibold border-l-2 border-blue-400'
                        : 'hover:bg-gray-900 text-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                        isActive
                          ? 'bg-blue-500 text-white font-bold'
                          : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {isActive ? <Play className="w-2.5 h-2.5 fill-current" /> : null}
                      <span>{formatOffsetTime(line.start)}</span>
                    </span>
                    <span className="text-xs sm:text-sm leading-snug flex-1">{line.text}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* Separated White-Background / Black-Text Ads List (used on /channel/xxx and /brands/xxx) */}
        {separateLightAdsPanel && isAdsVisible && (
          <div className="bg-white text-black rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            <VideoAdsPanel
              videoId={videoId}
              analysis={adsAnalysis}
              loading={adsLoading}
              error={adsError}
              activeTimeSec={currentTime}
              onAnalyze={(force) => handleAnalyzeAds(Boolean(force))}
              onSeekToSecond={(sec) => {
                handleSeekToSecond(sec);
                if (isVideoVisible) {
                  playerContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              getAudienceAtSecond={computeSyncedAudienceAtTime}
              variant="light"
              hideReanalyze={hideReanalyze || !allowAnalyzeAds}
              standalone={true}
              onAdjustAdTimestamp={allowAdTimestampAdjust ? handleAdjustAdTimestamp : undefined}
              onAdjustAdClockOffset={allowAdTimestampAdjust ? handleAdjustAdClockOffset : undefined}
              onRenameAdBrand={allowAdTimestampAdjust ? handleRenameAdBrand : undefined}
              onDeleteAds={allowDeleteAds ? handleDeleteAds : undefined}
              deletingAds={deletingAds}
            />
          </div>
        )}
      </div>
  );
};
