import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useToast, ToastSnackbar } from '../hooks/useToast';
import { settingsService, type LogLine } from '../services/settingsService';

const POLL_INTERVAL_MS = 1000;

type SourceFilter = 'all' | 'app' | 'server';
type LevelFilter = 'all' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<string, number> = {
  error: 4,
  warn: 3,
  info: 2,
  debug: 1,
  trace: 0,
};

const LEVEL_COLORS: Record<string, string> = {
  error: 'error.main',
  warn: 'warning.main',
  info: 'info.main',
  debug: 'text.secondary',
  trace: 'text.secondary',
};

function matchesLevel(line: LogLine, minimum: LevelFilter): boolean {
  if (minimum === 'all') {
    return true;
  }
  return (LEVEL_PRIORITY[line.level] ?? 0) >= LEVEL_PRIORITY[minimum];
}

const Logs = () => {
  const { t } = useTranslation();
  const { toast, showToast, hideToast } = useToast();

  const [lines, setLines] = useState<LogLine[]>([]);
  const [source, setSource] = useState<SourceFilter>('all');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [followTail, setFollowTail] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setLines(await settingsService.getLogs(undefined, 2000));
      setError(null);
    } catch (loadError) {
      setError(t('logs.loadFailed', { error: String(loadError) }));
    }
  }, [t]);

  useEffect(() => {
    void load();
    if (!autoRefresh) {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lines.filter((line) => {
      if (source !== 'all' && line.source !== source) {
        return false;
      }
      if (!matchesLevel(line, level)) {
        return false;
      }
      if (needle && !line.message.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [level, lines, search, source]);

  useEffect(() => {
    if (!followTail) {
      return;
    }
    const element = listRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [filtered, followTail]);

  const copyLogs = async () => {
    const text = filtered
      .map((line) => `${line.timestamp} [${line.level}] ${line.source === 'server' ? 'HTTP' : 'APP'}: ${line.message}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('logs.copied'), 'success');
    } catch (copyError) {
      showToast(String(copyError), 'error');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      <Paper sx={{ p: 2, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="logs-source-label">{t('logs.source')}</InputLabel>
            <Select
              labelId="logs-source-label"
              label={t('logs.source')}
              value={source}
              onChange={(event) => setSource(event.target.value as SourceFilter)}
            >
              <MenuItem value="all">{t('logs.sourceAll')}</MenuItem>
              <MenuItem value="app">{t('logs.sourceApp')}</MenuItem>
              <MenuItem value="server">{t('logs.sourceServer')}</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="logs-level-label">{t('logs.level')}</InputLabel>
            <Select
              labelId="logs-level-label"
              label={t('logs.level')}
              value={level}
              onChange={(event) => setLevel(event.target.value as LevelFilter)}
            >
              <MenuItem value="all">{t('logs.levelAll')}</MenuItem>
              <MenuItem value="error">{t('logs.levelError')}</MenuItem>
              <MenuItem value="warn">{t('logs.levelWarn')}</MenuItem>
              <MenuItem value="info">{t('logs.levelInfo')}</MenuItem>
              <MenuItem value="debug">{t('logs.levelDebug')}</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            label={t('logs.search')}
            placeholder={t('logs.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ flex: 1, minWidth: 200 }}
          />

          <FormControlLabel
            control={
              <Switch checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            }
            label={t('logs.autoRefresh')}
          />
          <FormControlLabel
            control={
              <Switch checked={followTail} onChange={(event) => setFollowTail(event.target.checked)} />
            }
            label={t('logs.followTail')}
          />

          <Button variant="outlined" size="small" onClick={() => void load()}>
            {t('logs.refresh')}
          </Button>
          <Button variant="outlined" size="small" onClick={() => void copyLogs()}>
            {t('logs.copy')}
          </Button>
          <Chip size="small" label={t('logs.count', { count: filtered.length })} />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('logs.description')}
        </Typography>
        {error ? (
          <Typography variant="body2" color="error.main" sx={{ mt: 0.5 }}>
            {error}
          </Typography>
        ) : null}
      </Paper>

      <Paper
        ref={listRef}
        sx={{ flex: 1, minHeight: 240, overflow: 'auto', p: 1.5, bgcolor: 'background.default' }}
      >
        {filtered.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('logs.empty')}
          </Typography>
        ) : (
          filtered.map((line, index) => (
            <Box
              key={`${line.timestamp}-${index}`}
              sx={{
                display: 'flex',
                gap: 1,
                alignItems: 'baseline',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                lineHeight: 1.5,
                py: 0.25,
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box component="span" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                {line.timestamp}
              </Box>
              <Box
                component="span"
                sx={{ color: LEVEL_COLORS[line.level] ?? 'text.primary', width: 48, flexShrink: 0 }}
              >
                {line.level.toUpperCase()}
              </Box>
              <Box component="span" sx={{ color: 'text.secondary', width: 44, flexShrink: 0 }}>
                {line.source === 'server' ? 'HTTP' : 'APP'}
              </Box>
              <Box component="span" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {line.message}
              </Box>
            </Box>
          ))
        )}
      </Paper>

      <ToastSnackbar toast={toast} onClose={hideToast} />
    </Box>
  );
};

export default Logs;
