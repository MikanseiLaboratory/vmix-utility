import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
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

const FRAME_RATES = [24, 25, 30, 50, 60];
const POLL_INTERVALS = [100, 200, 500, 1000];
const DEFAULT_FPS = 30;
const DEFAULT_POLL_MS = 200;

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
  const [relativeMode, setRelativeMode] = useState(false);
  const [frameRate, setFrameRate] = useState(DEFAULT_FPS);
  const [pollInterval, setPollInterval] = useState(DEFAULT_POLL_MS);
  const [loadError, setLoadError] = useState<string | null>(null);

  const videos = runtime?.videos ?? [];

  const selectedVideo: VideoTransportInfo | null = useMemo(() => {
    if (!videos.length) {
      return null;
    }
    return videos.find((video) => video.key === selectedKey) ?? videos[0];
  }, [selectedKey, videos]);

  // Keep the selection valid as vMix inputs come and go.
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

  const refresh = useCallback(async () => {
    if (!selectedConnection) {
      setRuntime(null);
      return;
    }
    try {
      const next = await vmixService.getVmixRuntimeState(selectedConnection);
      setRuntime(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(String(error));
    }
  }, [selectedConnection]);

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

  const frameMs = 1000 / frameRate;

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

  const seekTo = useCallback(
    (positionMs: number) => {
      const video = selectedVideo;
      if (!video) {
        return;
      }
      const clamped = Math.max(0, Math.min(video.duration_ms, Math.round(positionMs)));
      void send('SetPosition', { Input: video.key, Value: String(clamped) });
    },
    [selectedVideo, send],
  );

  const nudge = useCallback(
    (deltaMs: number) => {
      const video = selectedVideo;
      if (!video) {
        return;
      }

      if (relativeMode) {
        // vMix supports the undocumented "+=" / "-=" SetPosition syntax.
        const rounded = Math.max(1, Math.round(Math.abs(deltaMs)));
        const sign = deltaMs >= 0 ? '+=' : '-=';
        void send('SetPosition', { Input: video.key, Value: `${sign}${rounded}` });
        return;
      }

      seekTo(video.position_ms + deltaMs);
    },
    [relativeMode, seekTo, selectedVideo, send],
  );

  const togglePlayback = useCallback(() => {
    const video = selectedVideo;
    if (!video) {
      return;
    }
    void send(video.state === 'Running' ? 'Pause' : 'Play', { Input: video.key });
  }, [selectedVideo, send]);

  const restart = useCallback(() => {
    const video = selectedVideo;
    if (!video) {
      return;
    }
    void send('Restart', { Input: video.key });
  }, [selectedVideo, send]);

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
  const remaining = Math.max(0, duration - livePosition);

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

          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel id="video-seeker-fps-label">{t('videoSeeker.frameRate')}</InputLabel>
            <Select
              labelId="video-seeker-fps-label"
              label={t('videoSeeker.frameRate')}
              value={frameRate}
              onChange={(event) => setFrameRate(Number(event.target.value))}
            >
              {FRAME_RATES.map((rate) => (
                <MenuItem key={rate} value={rate}>
                  {rate} fps
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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

          <FormControlLabel
            control={
              <Switch
                checked={relativeMode}
                onChange={(event) => setRelativeMode(event.target.checked)}
              />
            }
            label={t('videoSeeker.relativeMode')}
          />
        </Box>

        {relativeMode ? (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {t('videoSeeker.relativeModeWarning')}
          </Alert>
        ) : null}

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
                    primary={video.short_title || video.title}
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
                onChange={(_event, value) => setDragValue(value as number)}
                onChangeCommitted={(_event, value) => {
                  setDragValue(null);
                  seekTo(value as number);
                }}
                sx={{ mt: 1 }}
              />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" fontFamily="monospace">
                  {formatTime(sliderValue)}
                </Typography>
                <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                  -{formatTime(remaining)} / {formatTime(duration)}
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
                  sx={{ mx: 0.5 }}
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
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {t('videoSeeker.relativeModeHelp')}
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
