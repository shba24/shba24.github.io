import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

/** Format seconds as `mm:ss`. Guards NaN/negative (pre-metadata) to `00:00`. */
function fmt(t: number): string {
  const n = Number.isFinite(t) && t > 0 ? t : 0;
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const wrap: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  marginTop: 16,
  padding: '5px 13px',
  border: '1px solid var(--border)',
  borderRadius: 999,
  fontFamily: 'var(--mono)',
  fontSize: 12,
  lineHeight: 1,
  color: 'var(--text)',
};

const button: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'var(--text)',
  cursor: 'pointer',
};

const track: CSSProperties = {
  position: 'relative',
  width: 120,
  height: 3,
  borderRadius: 999,
  background: 'var(--border)',
  cursor: 'pointer',
};

const time: CSSProperties = {
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

/**
 * Monochrome narration player, rendered as a `client:idle` island only when a
 * post's MP3 exists (gated in `PostHeader.astro`). A thin, themeable pill:
 * play/pause toggle, a seek bar, and `elapsed / total` time. Colours come from
 * the site's CSS custom properties so it follows the light/dark toggle.
 */
export default function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onPause);
    // Metadata may already be cached by the time we hydrate.
    if (a.readyState >= 1) setDuration(a.duration);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onPause);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  };

  const seekTo = (ratio: number) => {
    const a = audioRef.current;
    if (!a || !(duration > 0)) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    a.currentTime = clamped * duration;
    setCurrent(a.currentTime);
  };

  const onTrackClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  };

  const onTrackKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(duration > 0)) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      seekTo((current + 5) / duration);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seekTo((current - 5) / duration);
    }
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <span style={wrap}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        style={button}
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        aria-pressed={playing}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
          {playing ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
        </svg>
      </button>
      <div
        ref={trackRef}
        style={track}
        onClick={onTrackClick}
        onKeyDown={onTrackKey}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(current)}
      >
        <div
          style={{
            position: 'absolute',
            insetBlock: 0,
            left: 0,
            width: `${pct}%`,
            background: 'var(--text)',
            borderRadius: 999,
          }}
        />
      </div>
      <span style={time}>
        {fmt(current)} / {fmt(duration)}
      </span>
    </span>
  );
}
