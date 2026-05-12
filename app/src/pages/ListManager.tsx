import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionSelection } from '../hooks/useConnectionSelection';
import ConnectionSelector from '../components/ConnectionSelector';
import CompactVideoListView from '../components/CompactVideoListView';
import {
  Box,
  Card,
  Typography,
  Alert,
  Skeleton,
} from '@mui/material';
import { useVMixStatus } from '../hooks/useVMixStatus';
import { useUISettings, getDensitySpacing } from '../hooks/useUISettings.tsx';

interface VmixVideoListItem {
  key: string;
  number: number;
  title: string;
  input_type: string;
  state: string;
  selected: boolean;
  enabled: boolean;
}

interface VmixVideoListInput {
  key: string;
  number: number;
  title: string;
  input_type: string;
  state: string;
  items: VmixVideoListItem[];
  selected_index: number | null;
}

const ListManager: React.FC = () => {
  const { t } = useTranslation();
  const { videoLists: contextVideoLists, getVMixVideoLists, selectVideoListItem, openVideoListWindow } = useVMixStatus();
  const [_error, _setError] = useState<string | null>(null);
  const [expandedLists] = useState<Set<string>>(new Set());

  const { selectedConnection, setSelectedConnection, connectedConnections } = useConnectionSelection();

  const { uiDensity } = useUISettings();
  const spacing = getDensitySpacing(uiDensity);

  const selectedHost = selectedConnection;

  const videoLists = useMemo(() =>
    selectedHost ? (contextVideoLists[selectedHost] || []) : [],
    [selectedHost, contextVideoLists]
  );

  const isLoading = connectedConnections.length === 0 || (selectedHost && !contextVideoLists[selectedHost]);

  useMemo(() => {
    if (selectedHost && !contextVideoLists[selectedHost]) {
      console.log(`Auto-fetching VideoLists for host: ${selectedHost}`);
      Promise.resolve().then(() => {
        getVMixVideoLists(selectedHost).catch(error => {
          console.error(`Failed to auto-fetch VideoLists for ${selectedHost}:`, error);
        });
      });
    }
  }, [selectedHost, contextVideoLists, getVMixVideoLists]);

  const handleVideoListPopout = async (videoList: VmixVideoListInput) => {
    if (!selectedHost) return;

    try {
      await openVideoListWindow(selectedHost, videoList.key, videoList.title);
    } catch (err) {
      console.error('❌ Failed to open VideoList popup window:', err);
    }
  };

  const handleItemSelected = async (listKey: string, itemIndex: number) => {
    if (!selectedHost) return;

    try {
      const videoList = videoLists.find(list => list.key === listKey);
      if (!videoList) return;

      console.log('Selecting item:', itemIndex, 'for list:', listKey);

      await selectVideoListItem(selectedHost, videoList.number, itemIndex);
    } catch (err) {
      console.error('Failed to select item:', err);
    }
  };

  if (connectedConnections.length === 0) {
    return (
      <Box>
        <Alert severity="info">
          {t('listManager.noConnections')}
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant={spacing.headerVariant} sx={{ fontWeight: 'medium', mb: 1 }}>
        {t('listManager.title')}
      </Typography>

      <Card sx={{ mb: spacing.spacing * 2, p: spacing.cardPadding }}>
        <Typography variant={spacing.headerVariant} gutterBottom>
          {t('listManager.connectionSettings')}
        </Typography>
        <ConnectionSelector
          selectedConnection={selectedConnection}
          onConnectionChange={setSelectedConnection}
        />
      </Card>

      {_error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {_error}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ p: 2 }}>
          <Skeleton variant="rectangular" height={200} sx={{ mb: 2 }} />
          <Skeleton variant="text" height={40} />
          <Skeleton variant="text" height={40} />
        </Box>
      ) : videoLists.length === 0 ? (
        <Alert severity="info">
          {t('listManager.noVideoLists')}
        </Alert>
      ) : (
        <CompactVideoListView
          videoLists={videoLists}
          onItemSelected={handleItemSelected}
          onPopout={handleVideoListPopout}
          showPathsToggle={true}
          uiDensity={uiDensity}
          initialExpandedLists={expandedLists}
        />
      )}
    </Box>
  );
};

export default ListManager;
