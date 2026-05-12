import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { jaJP, enUS } from '@mui/material/locale';
import { useMemo, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import Layout from './components/Layout';
import ListManager from './pages/ListManager';
import SingleVideoList from './pages/SingleVideoList';
import DonationDialog from './components/DonationDialog';
import { VMixStatusProvider } from './hooks/useVMixStatus';
import { ThemeProvider as CustomThemeProvider, useTheme } from './hooks/useTheme';
import { UISettingsProvider } from './hooks/useUISettings.tsx';
import { invoke } from '@tauri-apps/api/core';
import "./App.css";

function AppContent() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, isLoading } = useTheme();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [donationDialogOpen, setDonationDialogOpen] = useState(false);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: resolvedTheme,
      primary: {
        main: resolvedTheme === 'dark' ? '#90caf9' : '#1976d2',
      },
      secondary: {
        main: resolvedTheme === 'dark' ? '#f48fb1' : '#dc004e',
      },
    },
  }, i18n.language === 'ja' ? jaJP : enUS), [resolvedTheme, i18n.language]);

  useEffect(() => {
    document.documentElement.lang = i18n.language === 'ja' ? 'ja' : 'en';
  }, [i18n.language]);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    if (currentPath !== '/') {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const shouldShow = await invoke<boolean>('should_show_donation_prompt');
        if (shouldShow) {
          setDonationDialogOpen(true);
        }
      } catch (error) {
        console.error('Failed to check donation prompt:', error);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [currentPath]);

  const handleDonationDialogClose = async (permanently: boolean) => {
    setDonationDialogOpen(false);

    try {
      await invoke('dismiss_donation_prompt', { permanently });
    } catch (error) {
      console.error('Failed to dismiss donation prompt:', error);
    }
  };

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px',
        backgroundColor: resolvedTheme === 'dark' ? '#121212' : '#f6f6f6',
        color: resolvedTheme === 'dark' ? '#f6f6f6' : '#0f0f0f'
      }}>
        {t('app.loadingTheme')}
      </div>
    );
  }

  const renderContent = () => {
    if (currentPath === '/list-manager') {
      const urlParams = new URLSearchParams(window.location.search);
      const host = urlParams.get('host');
      const listKey = urlParams.get('listKey');

      if (host && listKey) {
        return <SingleVideoList host={host} listKey={listKey} />;
      } else {
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>
              {t('app.listManagerTitle')}
            </Typography>
            <ListManager />
          </Box>
        );
      }
    }

    return <Layout />;
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <UISettingsProvider>
        <VMixStatusProvider>
          {renderContent()}
          <DonationDialog
            open={donationDialogOpen}
            onClose={handleDonationDialogClose}
          />
        </VMixStatusProvider>
      </UISettingsProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <CustomThemeProvider>
      <AppContent />
    </CustomThemeProvider>
  );
}

export default App;
