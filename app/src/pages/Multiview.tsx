import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import ConnectionSelector from '../components/ConnectionSelector';
import { useVMixStatus } from '../hooks/useVMixStatus';
import { useToast, ToastSnackbar } from '../hooks/useToast';
import { settingsService, type HttpServerStatus } from '../services/settingsService';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';

const ALL_NICS = '0.0.0.0';
const LOOPBACK = '127.0.0.1';

function composeMultiviewUrl(baseUrl: string, host: string, input: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  if (host) {
    params.set('host', host);
  }
  if (input) {
    params.set('input', input);
  }
  const query = params.toString();
  return `${trimmed}/multiview${query ? `?${query}` : ''}`;
}

const Multiview = () => {
  const { t } = useTranslation();
  const { connections, inputs } = useVMixStatus();
  const { toast, showToast, hideToast } = useToast();
  const [serverStatus, setServerStatus] = useState<HttpServerStatus | null>(null);
  const [bindIp, setBindIp] = useState(ALL_NICS);
  const [multiviewHost, setMultiviewHost] = useState('');
  const [multiviewInput, setMultiviewInput] = useState('');

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [status, appSettings] = await Promise.all([
          settingsService.getHttpServerState(),
          settingsService.getAppSettings(),
        ]);
        if (cancelled) {
          return;
        }
        setServerStatus(status);
        if (appSettings?.http_server_bind) {
          setBindIp(appSettings.http_server_bind);
        }
      } catch (error) {
        console.error('Failed to load Multiview server state:', error);
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      void refresh();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const connectedHosts = connections.filter((conn) => conn.status === 'Connected');
  const effectiveHost =
    (multiviewHost && connectedHosts.some((conn) => conn.host === multiviewHost)
      ? multiviewHost
      : connectedHosts[0]?.host) ?? '';
  const hostInputs = inputs[effectiveHost] ?? [];
  const mixInputs = useMemo(() => {
    const mixLike = hostInputs.filter((input) => /mix|multiview/i.test(input.input_type));
    const rest = hostInputs.filter((input) => !/mix|multiview/i.test(input.input_type));
    return [...mixLike, ...rest];
  }, [hostInputs]);

  const composedBaseUrl = useMemo(() => {
    const port = serverStatus?.port || 8089;
    if (serverStatus?.running && serverStatus.urls.length > 0) {
      if (bindIp !== ALL_NICS) {
        return serverStatus.urls.find((url) => url.includes(`://${bindIp}:`)) ?? serverStatus.urls[0];
      }
      return serverStatus.urls.find((url) => !url.includes('127.0.0.1')) ?? serverStatus.urls[0];
    }
    const host = bindIp === ALL_NICS ? LOOPBACK : bindIp;
    return `http://${host}:${port}`;
  }, [bindIp, serverStatus]);

  const multiviewUrl = composeMultiviewUrl(composedBaseUrl, effectiveHost, multiviewInput);
  const serverRunning = Boolean(serverStatus?.running);

  const handleOpenUrl = async (url: string) => {
    try {
      await openUrl(url);
    } catch (error) {
      showToast(t('multiview.openFailed', { error: String(error) }), 'error');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper sx={{ p: 2 }}>
        {!serverRunning ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('multiview.needsServer')}
          </Alert>
        ) : null}

        {connectedHosts.length === 0 ? (
          <Alert severity="info">{t('multiview.noConnections')}</Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <ConnectionSelector
                selectedConnection={effectiveHost}
                onConnectionChange={setMultiviewHost}
                label={t('multiview.connection')}
                sx={{ minWidth: 240, flex: 1 }}
              />
              <FormControl size="small" sx={{ minWidth: 260, flex: 1 }}>
                <InputLabel id="multiview-input-label">{t('multiview.input')}</InputLabel>
                <Select
                  labelId="multiview-input-label"
                  label={t('multiview.input')}
                  value={multiviewInput}
                  onChange={(event) => setMultiviewInput(event.target.value)}
                >
                  <MenuItem value="">{t('multiview.inputAuto')}</MenuItem>
                  {mixInputs.map((input) => (
                    <MenuItem key={input.key} value={input.key}>
                      {input.number}: {input.short_title || input.title} ({input.input_type})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">
                {t('multiview.url')}
              </Typography>
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={() => {
                  void handleOpenUrl(multiviewUrl);
                }}
                sx={{ fontFamily: 'monospace', textAlign: 'left' }}
              >
                {multiviewUrl}
              </Link>
              <Button
                size="small"
                variant="outlined"
                disabled={!serverRunning}
                onClick={() => {
                  void handleOpenUrl(multiviewUrl);
                }}
              >
                {t('multiview.open')}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  navigator.clipboard.writeText(multiviewUrl);
                  showToast(t('multiview.urlCopied'), 'success');
                }}
              >
                {t('multiview.copy')}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>

      <ToastSnackbar toast={toast} onClose={hideToast} />
    </Box>
  );
};

export default Multiview;
