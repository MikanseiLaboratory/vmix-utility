import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  CircularProgress
} from '@mui/material';
import CompactVideoListView from '../components/CompactVideoListView';
import { diagnosticsService } from '../services/diagnosticsService';
import { useVMixStatus } from '../hooks/useVMixStatus';
import { vmixService } from '../services/vmixService';

interface SingleVideoListProps {
  host?: string;
  listKey?: string;
}

const SingleVideoList: React.FC<SingleVideoListProps> = ({ host, listKey }) => {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const { connections } = useVMixStatus();

  const [localVideoLists, setLocalVideoLists] = useState<any[]>([]);

  const urlParams = new URLSearchParams(window.location.search);
  const targetHost = host || urlParams.get('host') || '';
  const targetListKey = listKey || urlParams.get('listKey') || '';

  console.log('SingleVideoList initialized:', { targetHost, targetListKey, url: window.location.href });

  const videoList = useMemo(() => {
    return localVideoLists.find(list => list.key === targetListKey) || null;
  }, [localVideoLists, targetListKey]);

  const connectionExists = useMemo(() => {
    return connections.some(conn => conn.host === targetHost && conn.status === 'Connected');
  }, [connections, targetHost]);

  const loading = useMemo(() => {
    if (!connectionExists) return false;
    return !videoList && Boolean(targetHost && targetListKey);
  }, [connectionExists, videoList, targetHost, targetListKey]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        const currentWindow = getCurrentWindow();
        if ('openDevtools' in currentWindow && typeof currentWindow.openDevtools === 'function') {
          currentWindow.openDevtools().catch((error: unknown) => {
            console.warn('Failed to open devtools:', error);
          });
        }
      });

      (window as any).debugVideoListWindows = async () => {
        try {
          return await diagnosticsService.getVideoListWindowsDiagnostic();
        } catch (error) {
          console.error('❌ Failed to get diagnostic info:', error);
        }
      };

      console.log('🔧 Development mode: Call window.debugVideoListWindows() to see window registry');
    }
  }, []);

  useEffect(() => {
    if (targetHost && targetListKey) {
      document.title = t('singleVideoList.docTitle', { host: targetHost, listKey: targetListKey });
    } else {
      document.title = t('singleVideoList.docTitleLoading');
    }
  }, [targetHost, targetListKey, t]);

  useEffect(() => {
    if (!targetHost) return;

    console.log('Setting up vmix-videolists-updated listener for popup window');
    const unlistenVideoLists = vmixService.listenForVideoListsUpdates((event) => {
      const { host, videoLists: updatedVideoLists } = event.payload;

      if (host === targetHost) {
        console.log(`VideoLists update event received for popup window ${host}:`, updatedVideoLists);
        console.log('Updating local video lists with new data from vMix:', updatedVideoLists);
        setLocalVideoLists(updatedVideoLists);
      }
    });

    return () => {
      console.log('Cleaning up vmix-videolists-updated listener for popup window');
      unlistenVideoLists.then(f => f());
    };
  }, [targetHost, targetListKey]);

  useEffect(() => {
    if (targetHost && targetListKey) {
      console.log('Initial data fetch for popup window');
      vmixService.getVMixVideoLists(targetHost).then(videoLists => {
        console.log('Initial video lists fetched:', videoLists);
        setLocalVideoLists(videoLists);
      }).catch(error => {
        console.error('Failed to fetch initial video lists:', error);
      });
    }
  }, [targetHost, targetListKey]);

  useEffect(() => {
    if (!targetHost || !targetListKey) {
      setError(t('singleVideoList.missingParams'));
      return;
    }

    if (!connectionExists) {
      setError(t('singleVideoList.noConnection', { host: targetHost }));
      return;
    }

    if (!loading && !videoList) {
      setError(t('singleVideoList.notFound', { key: targetListKey }));
      return;
    }

    if (videoList) {
      setError(null);
    }
  }, [targetHost, targetListKey, connectionExists, loading, videoList, t]);

  const handleItemSelected = async (_listKey: string, itemIndex: number) => {
    if (!targetHost || !videoList) return;

    try {
      await vmixService.selectVideoListItem(targetHost, videoList.number, itemIndex);
    } catch (err) {
      console.error('Failed to select item:', err);
      setError(t('singleVideoList.selectFailed', { error: String(err) }));
    }
  };

  if (!targetHost || !targetListKey) {
    return (
      <Box p={3}>
        <Alert severity="error">
          {t('singleVideoList.missingParams')}
          <br />
          <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.7 }}>
            {t('singleVideoList.currentUrl', { url: window.location.href })}
          </Typography>
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!videoList) {
    return (
      <Box p={3}>
        <Alert severity="info">
          {t('singleVideoList.notFoundInfo')}
        </Alert>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        {t('singleVideoList.heading', { number: videoList.number, title: videoList.title })}
      </Typography>

      <Card>
        <CardContent>
          <CompactVideoListView
            videoLists={[videoList]}
            onItemSelected={handleItemSelected}
            showPathsToggle={false}
            initialExpandedLists={new Set([videoList.key])}
          />
        </CardContent>
      </Card>
    </Box>
  );
};

export default SingleVideoList;
