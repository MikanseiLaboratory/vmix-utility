import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import FastForwardIcon from '@mui/icons-material/FastForward';
import FastRewindIcon from '@mui/icons-material/FastRewind';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import ConnectionSelector from '../components/ConnectionSelector';
import { useConnectionSelection } from '../hooks/useConnectionSelection';
import { useToast, ToastSnackbar } from '../hooks/useToast';
import { useVMixStatus } from '../hooks/useVMixStatus';
import { vmixService, type VideoTransportInfo, type VmixRuntimeState } from '../services/vmixService';

const POLL_INTERVALS = [100, 200, 500, 1000];
const DEFAULT_POLL_MS = 200;
const DRAG_SEEK_INTERVAL_MS = 100;
const LOCAL_HOLD_MS = 1600;
// While a jog runs, the input really plays for a few tens of milliseconds.
// Hold the paused state so the button label does not flip to "Pause".
const JOG_STATE_HOLD_MS = 1500;
// Swipe moves are batched: only the latest position is sent, at most this often.
const SWIPE_FLUSH_MS = 140;
// Fixed width keeps the transport buttons from shifting when labels change.
const PLAY_BUTTON_MIN_WIDTH = 112;
// vMix does not expose each input's frame rate over HTTP. Steps are sent as
// time offsets, so a nominal frame length is only used for the UI readout.
const NOMINAL_FRAME_MS = 1000 / 30;
// Swipe distance that equals one frame of movement.
const PIXELS_PER_FRAME = 7;

function formatTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = safe % 1000;

  const pad = (value: number, size = 2) => String(value).padStart(size, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

const VideoSeeker = () => {
  const { t } = useTranslation();
  const { connections } = useVMixStatus();
  const { selectedConnection, setSelectedConnection, connectedConnections } = useConnectionSelection();
  const { toast, showToast, hideToast } = useToast();

  const [runtime, setRuntime] = useState<VmixRuntimeState | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [frameText, setFrameText] = useState<string | null>(null);
  const [swipePx, setSwipePx] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [pollInterval, setPollInterval] = useState(DEFAULT_POLL_MS);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dragValueRef = useRef<number | null>(null);
  const selectedKeyRef = useRef<string | null>(null);
  const seekInFlightRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const lastDragSeekAtRef = useRef(0);
  const swipeStateRef = useRef<{ px: number; frames: number; active: boolean; basePos: number; target: number }>({
    px: 0,
    frames: 0,
    active: false,
    basePos: 0,
    target: 0,
  });
  const swipeFlushTimerRef = useRef<number | null>(null);
  const swipeLastXRef = useRef(0);
  const swipeLastTRef = useRef(0);
  const optimisticRef = useRef<{
    key: string;
    positionMs?: number;
    state?: string;
    fromMs?: number;
    until: number;
  } | null>(null);
  // vMix reports Running for the few ms of a jog; remember the state the user
  // left the input in so the transport buttons do not flip.
  const stateHoldRef = useRef<{ key: string; state: string; until: number } | null>(null);

  const frameRate = useMemo(() => 1000 / NOMINAL_FRAME_MS, []);

  const videos = runtime?.videos ?? [];

  const selectedVideo: VideoTransportInfo | null = useMemo(() => {
    if (!videos.length) {
      return null;
    }
    return videos.find((video) => video.key === selectedKey) ?? videos[0];
  }, [selectedKey, videos]);

  // Keep the selection valid as vMix inputs come and go.
  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  useEffect(() => {
    dragValueRef.current = dragValue;
  }, [dragValue]);

  useEffect(() => {
    if (!videos.length) {
      if (selectedKey !== null) {
        setSelectedKey(null);
      }
      return;
    }
    if (!selectedKey || !videos.some((video) => video.key === selectedKey)) {
      setSelectedKey(videos[0].key);
    }
  }, [videos, selectedKey]);

  useEffect(() => {
    setSwipePx(0);
    setFrameText(null);
    swipeStateRef.current = { px: 0, frames: 0, active: false, basePos: 0, target: 0 };
  }, [selectedKey]);

  const applyOptimistic = useCallback((next: VmixRuntimeState): VmixRuntimeState => {
    const drag = dragValueRef.current;
    const selected = selectedKeyRef.current;
    const now = Date.now();
    let hold = optimisticRef.current;
    const stateHold = stateHoldRef.current;
    if (stateHold && now >= stateHold.until) {
      stateHoldRef.current = null;
    }

    if (hold && now >= hold.until) {
      optimisticRef.current = null;
      hold = null;
    }

    if (hold && hold.positionMs != null) {
      const server = next.videos.find((video) => video.key === hold?.key);
      if (server && Math.abs(server.position_ms - hold.positionMs) <= 250) {
        optimisticRef.current = null;
        hold = null;
      }
    }

    if (drag == null && !hold && !stateHoldRef.current) {
      return next;
    }

    const pending = hold;
    const sticky = stateHoldRef.current;
    return {
      ...next,
      videos: next.videos.map((video) => {
        if (pending && video.key === pending.key && now < pending.until) {
          return {
            ...video,
            position_ms: pending.positionMs ?? video.position_ms,
            state: pending.state ?? video.state,
          };
        }
        if (sticky && video.key === sticky.key && now < sticky.until) {
          return { ...video, state: sticky.state };
        }
        if (drag != null && selected === video.key) {
          return { ...video, position_ms: drag };
        }
        return video;
      }),
    };
  }, []);

  const patchVideo = useCallback((key: string, patch: { position_ms?: number; state?: string }, fromMs?: number) => {
    optimisticRef.current = {
      key,
      positionMs: patch.position_ms,
      state: patch.state,
      fromMs,
      until: Date.now() + LOCAL_HOLD_MS,
    };
    setRuntime((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        videos: prev.videos.map((video) => (video.key === key ? { ...video, ...patch } : video)),
      };
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!selectedConnection) {
      setRuntime(null);
      return;
    }
    try {
      const next = await vmixService.getVmixRuntimeState(selectedConnection);
      setRuntime(applyOptimistic(next));
      setLoadError(null);
    } catch (error) {
      setLoadError(String(error));
    }
  }, [applyOptimistic, selectedConnection]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      void refresh();
    }, pollInterval);
    return () => window.clearInterval(timer);
  }, [refresh, pollInterval]);

  const frameMs = NOMINAL_FRAME_MS;

  const send = useCallback(
    async (functionName: string, params: Record<string, string>) => {
      if (!selectedConnection) {
        return;
      }
      try {
        await vmixService.sendVMixFunction(selectedConnection, functionName, params);
      } catch (error) {
        showToast(t('videoSeeker.commandFailed', { error: String(error) }), 'error');
      }
    },
    [selectedConnection, showToast, t],
  );

  const flushSeek = useCallback(
    async (videoKey: string, positionMs: number) => {
      if (seekInFlightRef.current) {
        pendingSeekRef.current = positionMs;
        return;
      }
      seekInFlightRef.current = true;
      await send('SetPosition', { Input: videoKey, Value: String(positionMs) });
      seekInFlightRef.current = false;
      if (pendingSeekRef.current !== null) {
        const pending = pendingSeekRef.current;
        pendingSeekRef.current = null;
        void flushSeek(videoKey, pending);
      }
    },
    [send],
  );

  const seekTo = useCallback(
    (positionMs: number, fromDrag = false) => {
      const video = selectedVideo;
      if (!video) {
        return;
      }
      const clamped = Math.max(0, Math.min(video.duration_ms, Math.round(positionMs)));
      patchVideo(video.key, { position_ms: clamped }, video.position_ms);
      void flushSeek(video.key, clamped);
      if (!fromDrag) {
        lastDragSeekAtRef.current = Date.now();
      }
    },
    [flushSeek, patchVideo, selectedVideo],
  );

  const seekWhileDragging = useCallback(
    (positionMs: number) => {
      const now = Date.now();
      if (now - lastDragSeekAtRef.current < DRAG_SEEK_INTERVAL_MS) {
        return;
      }
      lastDragSeekAtRef.current = now;
      seekTo(positionMs, true);
    },
    [seekTo],
  );

  const readPosition = useCallback(async (videoKey: string): Promise<number | null> => {
    if (!selectedConnection) {
      return null;
    }
    try {
      const next = await vmixService.getVmixRuntimeState(selectedConnection);
      const video = next.videos.find((item) => item.key === videoKey);
      return video ? video.position_ms : null;
    } catch {
      return null;
    }
  }, [selectedConnection]);

  const settle = useCallback(
    () => new Promise<void>((resolve) => setTimeout(resolve, 180)),
    [],
  );

  /**
   * Play at `rate` for `ms` of media time, then pause again. vMix cannot move
   * the playhead by less than a keyframe while paused, but playback advances
   * smoothly, so this is the only way to get sub-keyframe precision.
   */
  const playFor = useCallback(
    async (videoKey: string, ms: number, rate: number) => {
      const hold = Math.max(40, Math.round(ms / rate));
      await send('SetRate', { Input: videoKey, Value: String(rate) });
      await send('Play', { Input: videoKey });
      await new Promise((resolve) => setTimeout(resolve, hold));
      await send('Pause', { Input: videoKey });
      await send('SetRate', { Input: videoKey, Value: '1' });
      await settle();
    },
    [send, settle],
  );

  /**
   * Step by a few frames. Slow playback keeps a forward landing close to the
   * request; a plain seek would snap to a keyframe and jump about a second.
   */
  const microStep = useCallback(
    async (videoKey: string, frames: number) => {
      const video = selectedVideo;
      if (!video || frames === 0) {
        return;
      }
      const stepMs = Math.abs(frames) * frameMs;
      const before = video.position_ms;

      if (frames > 0) {
        patchVideo(videoKey, { position_ms: before + stepMs }, before);
        stateHoldRef.current = {
          key: videoKey,
          state: 'Paused',
          until: Date.now() + JOG_STATE_HOLD_MS,
        };
        await playFor(videoKey, stepMs, 0.25);
      } else {
        // Backwards playback is not available, so the seek snaps to a keyframe.
        // If that lands further back than requested, stay put instead of
        // jumping a whole keyframe.
        await send('SetPosition', { Input: videoKey, Value: String(Math.max(0, before - stepMs)) });
        await settle();
        const landed = await readPosition(videoKey);
        if (landed !== null && before - landed > stepMs + frameMs * 2) {
          await send('SetPosition', { Input: videoKey, Value: String(before) });
          await settle();
          patchVideo(videoKey, { position_ms: (await readPosition(videoKey)) ?? before });
          return;
        }
        if (landed !== null) {
          patchVideo(videoKey, { position_ms: landed });
          return;
        }
      }

      const actual = await readPosition(videoKey);
      patchVideo(videoKey, { position_ms: actual ?? before });
    },
    [frameMs, patchVideo, playFor, readPosition, selectedVideo, send, settle],
  );

  /**
   * Move the playhead to `target`.
   *
   * vMix snaps SetPosition to the keyframe at or before the target. Forward
   * seeks therefore request one extra millisecond so they clear the current
   * keyframe; the real position is then read back and only the remaining
   * distance is sent, in the requested direction. Small steps use slow playback
   * instead, so a one-frame request can never become a one-second jump.
   */
  const seekToPosition = useCallback(
    async (targetMs: number) => {
      const video = selectedVideo;
      if (!video) {
        return;
      }
      const key = video.key;
      const before = video.position_ms;
      const clamped = Math.max(0, Math.min(video.duration_ms, Math.round(targetMs)));
      const delta = clamped - before;
      if (delta === 0) {
        return;
      }

      if (Math.abs(delta) <= frameMs * 3) {
        void microStep(key, Math.max(1, Math.abs(Math.round(delta / frameMs))) * Math.sign(delta));
        return;
      }

      const forward = delta > 0;
      const absolute = forward
        ? Math.min(video.duration_ms, clamped + 1)
        : clamped;

      patchVideo(key, { position_ms: clamped }, before);
      await send('SetPosition', { Input: key, Value: String(absolute) });
      await settle();

      let actual = await readPosition(key);
      if (actual === null) {
        patchVideo(key, { position_ms: clamped });
        return;
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const remaining = clamped - actual;
        // Only close the gap in the requested direction.
        if (remaining === 0 || (remaining > 0) !== forward) {
          break;
        }
        if (Math.abs(remaining) <= 12) {
          break;
        }
        const step = remaining + (forward ? 1 : -1);
        const sign = forward ? '+=' : '-=';
        await send('SetPosition', { Input: key, Value: `${sign}${Math.abs(step)}` });
        await settle();
        const next = await readPosition(key);
        if (next === null || next === actual) {
          break;
        }
        actual = next;
      }

      // A snap must never move the playhead further than the request.
      if (Math.abs(actual - before) > Math.abs(delta) + frameMs * 2) {
        await send('SetPosition', { Input: key, Value: String(before) });
        await settle();
        actual = (await readPosition(key)) ?? before;
      }

      patchVideo(key, { position_ms: actual });
    },
    [frameMs, microStep, patchVideo, readPosition, selectedVideo, send, settle],
  );

  const nudge = useCallback(
    (deltaMs: number) => {
      const video = selectedVideo;
      if (!video) {
        return;
      }
      void seekToPosition(video.position_ms + deltaMs);
    },
    [seekToPosition, selectedVideo],
  );

  const togglePlayback = useCallback(() => {
    const video = selectedVideo;
    if (!video) {
      return;
    }
    const nextState = video.state === 'Running' ? 'Paused' : 'Running';
    patchVideo(video.key, { state: nextState });
    void send(nextState === 'Paused' ? 'Pause' : 'Play', { Input: video.key });
  }, [patchVideo, selectedVideo, send]);

  const restart = useCallback(() => {
    const video = selectedVideo;
    if (!video) {
      return;
    }
    patchVideo(video.key, { position_ms: 0 });
    void send('Restart', { Input: video.key });
  }, [patchVideo, selectedVideo, send]);

  // Keyboard transport: arrows step frames, space toggles playback.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
          return;
        }
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        nudge(-frameMs);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nudge(frameMs);
      } else if (event.key === ' ') {
        event.preventDefault();
        togglePlayback();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [frameMs, nudge, togglePlayback]);

  const duration = selectedVideo?.duration_ms ?? 0;
  const livePosition = selectedVideo?.position_ms ?? 0;
  const sliderValue = Math.min(dragValue ?? livePosition, duration || 0);
  const remaining = Math.max(0, duration - sliderValue);
  const currentFrame = Math.round((sliderValue * frameRate) / 1000);

  const commitFrame = useCallback(() => {
    if (frameText == null) {
      return;
    }
    const parsed = Number(frameText);
    setFrameText(null);
    if (!Number.isFinite(parsed) || !selectedVideo) {
      return;
    }
    const targetMs = (parsed / frameRate) * 1000;
    void seekToPosition(targetMs);
  }, [frameRate, frameText, seekToPosition, selectedVideo]);

  const applySwipe = useCallback(
    (px: number) => {
      const video = selectedVideo;
      if (!video) {
        return;
      }
      setSwipePx(px);
      // Swipe right scrubs forward, like dragging a timeline.
      const frames = Math.round(px / PIXELS_PER_FRAME);
      const state = swipeStateRef.current;
      if (frames === state.frames) {
        return;
      }
      state.frames = frames;
      state.target = Math.max(
        0,
        Math.min(video.duration_ms, state.basePos + frames * frameMs),
      );

      // Batch: show the new position at once, but send at most every
      // SWIPE_FLUSH_MS so a long drag does not flood vMix.
      patchVideo(video.key, { position_ms: state.target }, video.position_ms);
      if (swipeFlushTimerRef.current !== null) {
        return;
      }
      swipeFlushTimerRef.current = window.setTimeout(() => {
        swipeFlushTimerRef.current = null;
        const { target } = swipeStateRef.current;
        void flushSeek(video.key, target);
      }, SWIPE_FLUSH_MS);
    },
    [flushSeek, frameMs, patchVideo, selectedVideo],
  );

  const onSwipeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedVideo) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const state = swipeStateRef.current;
    state.px = 0;
    state.frames = 0;
    state.active = true;
    state.basePos = selectedVideo.position_ms;
    state.target = selectedVideo.position_ms;
    swipeLastXRef.current = event.clientX;
    swipeLastTRef.current = performance.now();
    setScrubbing(true);
    setSwipePx(0);
  }, [selectedVideo]);

  const onSwipeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = swipeStateRef.current;
    if (!state.active) {
      return;
    }
    const dx = event.clientX - swipeLastXRef.current;
    swipeLastXRef.current = event.clientX;
    swipeLastTRef.current = performance.now();
    applySwipe(state.px + dx);
  }, [applySwipe]);

  const endSwipe = useCallback(() => {
    const state = swipeStateRef.current;
    if (!state.active) {
      return;
    }
    state.active = false;
    setScrubbing(false);

    // Send whatever is still buffered so the release position is applied.
    if (swipeFlushTimerRef.current !== null) {
      window.clearTimeout(swipeFlushTimerRef.current);
      swipeFlushTimerRef.current = null;
    }
    const video = selectedVideo;
    if (video) {
      void flushSeek(video.key, state.target);
    }

    window.setTimeout(() => {
      if (!swipeStateRef.current.active) {
        setSwipePx(0);
      }
    }, 220);
  }, [flushSeek, selectedVideo]);

  useEffect(() => () => {
    if (swipeFlushTimerRef.current !== null) {
      window.clearTimeout(swipeFlushTimerRef.current);
    }
  }, []);

  if (connectedConnections.length === 0) {
    return (
      <Box>
        <Alert severity="info">{t('videoSeeker.noConnections')}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <ConnectionSelector
            selectedConnection={selectedConnection}
            onConnectionChange={setSelectedConnection}
            label={t('videoSeeker.selectConnection')}
            sx={{ flex: 1, minWidth: 240 }}
          />

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="video-seeker-poll-label">{t('videoSeeker.pollInterval')}</InputLabel>
            <Select
              labelId="video-seeker-poll-label"
              label={t('videoSeeker.pollInterval')}
              value={pollInterval}
              onChange={(event) => setPollInterval(Number(event.target.value))}
            >
              {POLL_INTERVALS.map((interval) => (
                <MenuItem key={interval} value={interval}>
                  {interval} ms
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {loadError ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            {loadError}
          </Alert>
        ) : null}
      </Paper>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexDirection: { xs: 'column', md: 'row' } }}>
        <Card sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
          <Typography variant="subtitle1" sx={{ px: 2, pt: 2, fontWeight: 600 }}>
            {t('videoSeeker.selectVideo')}
          </Typography>
          {videos.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              {t('videoSeeker.noVideos')}
            </Typography>
          ) : (
            <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
              {videos.map((video) => (
                <ListItemButton
                  key={video.key}
                  selected={selectedVideo?.key === video.key}
                  onClick={() => setSelectedKey(video.key)}
                >
                  <ListItemText
                    primary={t('videoSeeker.inputLine', {
                      num: video.number,
                      name: video.short_title || video.title,
                    })}
                    secondary={`${formatTime(video.duration_ms)} · ${video.state}`}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Card>

        <Paper sx={{ p: 2, flex: 1, width: '100%' }}>
          {selectedVideo ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                <Typography variant="h6" sx={{ fontSize: '1.05rem' }}>
                  {selectedVideo.title}
                </Typography>
                <Chip size="small" label={selectedVideo.input_type} />
                <Chip
                  size="small"
                  color={selectedVideo.state === 'Running' ? 'success' : 'default'}
                  label={selectedVideo.state}
                  sx={{ minWidth: 84 }}
                />
                {selectedVideo.looping ? (
                  <Chip size="small" variant="outlined" label={`${t('videoSeeker.looping')}: ${t('videoSeeker.on')}`} />
                ) : null}
                {selectedVideo.muted ? (
                  <Chip size="small" variant="outlined" label="Muted" />
                ) : null}
              </Box>

              <Slider
                value={sliderValue}
                min={0}
                max={duration || 1}
                step={Math.max(1, frameMs)}
                disabled={!duration}
                onChange={(_event, value) => {
                  const next = value as number;
                  setDragValue(next);
                  seekWhileDragging(next);
                }}
                onChangeCommitted={(_event, value) => {
                  const next = value as number;
                  setDragValue(null);
                  pendingSeekRef.current = null;
                  seekTo(next);
                }}
                sx={{ mt: 1 }}
              />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" fontFamily="monospace">
                  {formatTime(sliderValue)}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TextField
                    size="small"
                    type="number"
                    label={t('videoSeeker.frame')}
                    value={frameText ?? String(currentFrame)}
                    onChange={(event) => setFrameText(event.target.value)}
                    onBlur={commitFrame}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        commitFrame();
                      }
                    }}
                    sx={{ width: 118 }}
                    slotProps={{
                      input: { sx: { py: 0.25, fontSize: '0.8rem' } },
                      htmlInput: { step: 1 },
                      inputLabel: { sx: { fontSize: '0.8rem' } },
                    }}
                  />
                  <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                    -{formatTime(remaining)} / {formatTime(duration)}
                  </Typography>
                </Box>
              </Box>

              <Box
                onPointerDown={onSwipeStart}
                onPointerMove={onSwipeMove}
                onPointerUp={endSwipe}
                onPointerCancel={endSwipe}
                sx={{
                  position: 'relative',
                  mb: 1.5,
                  height: 64,
                  borderRadius: 3,
                  overflow: 'hidden',
                  cursor: scrubbing ? 'grabbing' : 'grab',
                  touchAction: 'none',
                  userSelect: 'none',
                  bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100'),
                  border: 1,
                  borderColor: scrubbing ? 'primary.main' : 'divider',
                  transition: 'border-color 120ms ease',
                  backgroundImage:
                    'repeating-linear-gradient(90deg, rgba(128,128,128,0.28) 0px, rgba(128,128,128,0.28) 1px, transparent 1px, transparent ' +
                    `${PIXELS_PER_FRAME}px)`,
                  backgroundPositionX: `${swipePx}px`,
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    bottom: 0,
                    width: 2,
                    bgcolor: 'primary.main',
                    opacity: scrubbing ? 1 : 0.55,
                    transform: 'translateX(-1px)',
                  }}
                />
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Box sx={{ textAlign: 'center', pointerEvents: 'none' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {t('videoSeeker.frameScrub')}
                    </Typography>
                    <Typography variant="subtitle1" fontFamily="monospace" fontWeight={600}>
                      {`${currentFrame} f`}
                    </Typography>
                  </Box>
                </Box>
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                >
                  {t('videoSeeker.jogBackHint')}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                >
                  {t('videoSeeker.jogForwardHint')}
                </Typography>
              </Box>

              <Divider sx={{ mb: 1.5 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                <Tooltip title={t('videoSeeker.restart')}>
                  <IconButton onClick={restart} aria-label={t('videoSeeker.restart')}>
                    <ReplayIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('videoSeeker.backSecond')}>
                  <IconButton onClick={() => nudge(-1000)} aria-label={t('videoSeeker.backSecond')}>
                    <FastRewindIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('videoSeeker.backFrame')}>
                  <IconButton onClick={() => nudge(-frameMs)} aria-label={t('videoSeeker.backFrame')}>
                    <KeyboardArrowLeftIcon />
                  </IconButton>
                </Tooltip>
                <Button
                  variant="contained"
                  onClick={togglePlayback}
                  startIcon={selectedVideo.state === 'Running' ? <PauseIcon /> : <PlayArrowIcon />}
                  sx={{ mx: 0.5, minWidth: PLAY_BUTTON_MIN_WIDTH }}
                >
                  {selectedVideo.state === 'Running' ? t('videoSeeker.pause') : t('videoSeeker.play')}
                </Button>
                <Tooltip title={t('videoSeeker.forwardFrame')}>
                  <IconButton onClick={() => nudge(frameMs)} aria-label={t('videoSeeker.forwardFrame')}>
                    <KeyboardArrowRightIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('videoSeeker.forwardSecond')}>
                  <IconButton onClick={() => nudge(1000)} aria-label={t('videoSeeker.forwardSecond')}>
                    <FastForwardIcon />
                  </IconButton>
                </Tooltip>
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                {t('videoSeeker.keyboardHelp')}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {videos.length ? t('videoSeeker.selectVideo') : t('videoSeeker.noVideos')}
            </Typography>
          )}
        </Paper>
      </Box>

      {connections.length === 0 ? (
        <Alert severity="info">{t('videoSeeker.noConnections')}</Alert>
      ) : null}

      <ToastSnackbar toast={toast} onClose={hideToast} />
    </Box>
  );
};

export default VideoSeeker;
