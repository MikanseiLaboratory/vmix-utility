import { lazy, Suspense, useMemo, useState, type LazyExoticComponent, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import CssBaseline from '@mui/material/CssBaseline';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import MenuIcon from '@mui/icons-material/Menu';
import LinkIcon from '@mui/icons-material/Link';
import ShortcutIcon from '@mui/icons-material/Shortcut';
import CreateIcon from '@mui/icons-material/Create';
import ViewListIcon from '@mui/icons-material/ViewList';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import SettingsIcon from '@mui/icons-material/Settings';
import CodeIcon from '@mui/icons-material/Code';

const Connections = lazy(() => import('../pages/Connections'));
const ShortcutGenerator = lazy(() => import('../pages/ShortcutGenerator'));
const BlankGenerator = lazy(() => import('../pages/BlankGenerator'));
const InputManager = lazy(() => import('../pages/InputManager'));
const ListManager = lazy(() => import('../pages/ListManager'));
const Settings = lazy(() => import('../pages/Settings'));
const Developer = lazy(() => import('../pages/Developer'));

const drawerWidth = 240;

interface NavItem {
  text: string;
  icon: JSX.Element;
  Page: LazyExoticComponent<ComponentType>;
}

const Layout = () => {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setDesktopOpen(!desktopOpen);
    }
  };

  const navItems: NavItem[] = useMemo(() => [
    {
      text: t('layout.nav.connections'),
      icon: <LinkIcon />,
      Page: Connections,
    },
    {
      text: t('layout.nav.shortcutGenerator'),
      icon: <ShortcutIcon />,
      Page: ShortcutGenerator,
    },
    {
      text: t('layout.nav.blankGenerator'),
      icon: <CreateIcon />,
      Page: BlankGenerator,
    },
    {
      text: t('layout.nav.inputManager'),
      icon: <ViewListIcon />,
      Page: InputManager,
    },
    {
      text: t('layout.nav.listManager'),
      icon: <PlaylistPlayIcon />,
      Page: ListManager,
    },
    {
      text: t('layout.nav.settings'),
      icon: <SettingsIcon />,
      Page: Settings,
    },
    {
      text: t('layout.nav.developer'),
      icon: <CodeIcon />,
      Page: Developer,
    },
  ], [t]);

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          {t('layout.appTitle')}
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {navItems.map((item, index) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={selectedIndex === index}
              onClick={() => {
                setSelectedIndex(index);
                if (isMobile) {
                  setMobileOpen(false);
                }
              }}
            >
              <ListItemIcon>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  const ActivePage = navItems[selectedIndex].Page;

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${desktopOpen ? drawerWidth : 0}px)` },
          ml: { sm: `${desktopOpen ? drawerWidth : 0}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label={t('layout.toggleDrawer')}
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: desktopOpen ? drawerWidth : 0 }, flexShrink: { sm: 0 } }}
        aria-label="navigation"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="persistent"
          open={desktopOpen}
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${desktopOpen ? drawerWidth : 0}px)` },
          marginTop: '64px',
          height: 'calc(100vh - 64px)',
          overflow: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <Suspense
          fallback={(
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
              <CircularProgress aria-label={t('app.loadingTheme')} />
            </Box>
          )}
        >
          <ActivePage />
        </Suspense>
      </Box>
    </Box>
  );
};

export default Layout;
