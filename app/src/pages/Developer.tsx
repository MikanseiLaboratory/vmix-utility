import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid2 from '@mui/material/Grid2';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import {
  GitHub,
  Code,
  FavoriteOutlined,
  Description,
  Public,
} from '@mui/icons-material';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTranslation, Trans } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';

const TwitchIcon = (props: SvgIconProps) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M3 0 0 4v17h6v3h3l3-3h5l7-7V0H3zm18 11-3 3h-5l-3 3v-3H5V2h16v9zm-9-5h2v5h-2V6zm5 0h2v5h-2V6z" />
  </SvgIcon>
);

const Developer = () => {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const repositoryUrl = 'https://github.com/MikanseiLaboratory/vmix-utility';
  const developerGitHub = 'https://github.com/MikanseiLaboratory';
  const mikanseiLaboratoryUrl = 'https://mikanseilaboratory.github.io/';
  const twitchSupportUrl = 'https://subs.twitch.tv/flowingspdg';

  const openInBrowser = (url: string) => {
    openUrl(url);
  };

  return (
    <Box sx={{ p: 3 }}>

      <Grid2 container spacing={3}>
        <Grid2 size={{ xs: 12, md: 6 }}>
          <Card elevation={3} sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                  <GitHub />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h2">
                    {t('developer.repository')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('developer.openSource')}
                  </Typography>
                </Box>
              </Box>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t('developer.repoBody')}
              </Typography>

              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Chip label="MIT License" variant="outlined" size="small" />
                <Chip label="TypeScript" variant="outlined" size="small" />
                <Chip label="React" variant="outlined" size="small" />
                <Chip label="Tauri" variant="outlined" size="small" />
                <Chip label="Rust" variant="outlined" size="small" />
              </Box>

              <Button
                variant="contained"
                startIcon={<GitHub />}
                onClick={() => openInBrowser(repositoryUrl)}
                fullWidth
              >
                {t('developer.viewGithub')}
              </Button>
            </CardContent>
          </Card>
        </Grid2>

        <Grid2 size={{ xs: 12, md: 6 }}>
          <Card elevation={3} sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                  <Code />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h2">
                    {t('developer.orgTitle')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('developer.orgSubtitle')}
                  </Typography>
                </Box>
              </Box>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t('developer.orgBody')}
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
                <Button
                  variant="contained"
                  startIcon={<Public />}
                  onClick={() => openInBrowser(mikanseiLaboratoryUrl)}
                  fullWidth
                >
                  {t('developer.officialSite')}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<GitHub />}
                  onClick={() => openInBrowser(developerGitHub)}
                  fullWidth
                >
                  {t('developer.visitOrgGithub')}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid2>

        <Grid2 size={12}>
          <Card elevation={3}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <FavoriteOutlined sx={{ mr: 1, color: 'error.main' }} />
                <Typography variant="h6" component="h2">
                  {t('developer.supportTitle')}
                </Typography>
              </Box>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t('developer.supportBody')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                <Trans i18nKey="developer.supportTip" components={{ strong: <strong /> }} />
              </Typography>

              <Box sx={{ mt: 1 }}>
                <Button
                  variant="contained"
                  sx={{
                    backgroundColor: '#9146FF',
                    '&:hover': { backgroundColor: '#772CE8' },
                    height: '56px',
                    fontSize: '1.1rem',
                  }}
                  startIcon={<TwitchIcon />}
                  onClick={() => openInBrowser(twitchSupportUrl)}
                  fullWidth
                >
                  {t('developer.subscribeTwitch')}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid2>

        <Grid2 size={12}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Description sx={{ mr: 1 }} />
              <Typography variant="h6" component="h2">
                {t('developer.licenseTitle')}
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('developer.licenseBody')}
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Box sx={{
              bgcolor: resolvedTheme === 'dark' ? 'grey.800' : 'grey.50',
              p: 2,
              borderRadius: 1
            }}>
              <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {`MIT License

Copyright (c) 2026 未完成成果物研究所

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {t('developer.licenseMore')}{' '}
              <Link
                component="button"
                onClick={() => openInBrowser(`${repositoryUrl}/blob/master/LICENSE`)}
                sx={{ textDecoration: 'underline', cursor: 'pointer' }}
              >
                {t('developer.licenseFile')}
              </Link>{' '}
              {t('developer.licenseInRepo')}
            </Typography>
          </Paper>
        </Grid2>

        <Grid2 size={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('developer.specialThanks')}
            </Typography>

            <List>
              <ListItem sx={{ pl: 0 }}>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    <Code />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Link
                      component="button"
                      onClick={() => openInBrowser('https://github.com/FlowingSPDG')}
                      sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      Shugo &quot;FlowingSPDG&quot; Kawamura
                    </Link>
                  }
                  secondary={t('developer.thanksFlowingSecondary')}
                />
              </ListItem>
              <ListItem sx={{ pl: 0 }}>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    <Code />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Link
                      component="button"
                      onClick={() => openInBrowser('https://x.com/guleruun')}
                      sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      GuleruuN
                    </Link>
                  }
                  secondary={t('developer.thanksGulerSecondary')}
                />
              </ListItem>
            </List>
          </Paper>
        </Grid2>

        <Grid2 size={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('developer.usefulLinks')}
            </Typography>

            <List>
              <ListItem sx={{ pl: 0 }}>
                <ListItemIcon>
                  <GitHub />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Link
                      component="button"
                      onClick={() => openInBrowser(`${repositoryUrl}/issues`)}
                      sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      {t('developer.reportIssues')}
                    </Link>
                  }
                  secondary={t('developer.reportIssuesSecondary')}
                />
              </ListItem>

              <ListItem sx={{ pl: 0 }}>
                <ListItemIcon>
                  <Description />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Link
                      component="button"
                      onClick={() => openInBrowser(`${repositoryUrl}`)}
                      sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      {t('developer.documentation')}
                    </Link>
                  }
                  secondary={t('developer.documentationSecondary')}
                />
              </ListItem>

              <ListItem sx={{ pl: 0 }}>
                <ListItemIcon>
                  <Code />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Link
                      component="button"
                      onClick={() => openInBrowser(`${repositoryUrl}/pulls`)}
                      sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      {t('developer.contribute')}
                    </Link>
                  }
                  secondary={t('developer.contributeSecondary')}
                />
              </ListItem>
            </List>
          </Paper>
        </Grid2>
      </Grid2>
    </Box>
  );
};

export default Developer;
