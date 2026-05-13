import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import { useVMixStatus } from '../hooks/useVMixStatus';

interface ConnectionSelectorProps {
  selectedConnection: string;
  onConnectionChange: (connection: string) => void;
  label?: string;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  sx?: object;
}

const ConnectionSelector = memo<ConnectionSelectorProps>(({
  selectedConnection,
  onConnectionChange,
  label,
  size = 'small',
  fullWidth = true,
  sx = {}
}) => {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t('connectionSelector.defaultLabel');

  const { connections } = useVMixStatus();

  const connectedConnections = useMemo(() =>
    connections.filter(conn => conn.status === 'Connected'),
    [connections]
  );

  const handleChange = useCallback((event: SelectChangeEvent<string>) => {
    onConnectionChange(event.target.value);
  }, [onConnectionChange]);

  const labelId = useMemo(() =>
    `connection-select-label-${resolvedLabel.replace(/\s+/g, '-').toLowerCase()}`,
    [resolvedLabel]
  );

  return (
    <FormControl fullWidth={fullWidth} sx={sx}>
      <InputLabel id={labelId}>{resolvedLabel}</InputLabel>
      <Select
        labelId={labelId}
        value={selectedConnection}
        label={resolvedLabel}
        onChange={handleChange}
        size={size}
      >
        <MenuItem value="">
          <em>{t('connectionSelector.selectPlaceholder')}</em>
        </MenuItem>
        {connectedConnections.map((conn) => (
          <MenuItem key={conn.host} value={conn.host}>
            {conn.label} ({conn.host})
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
});

ConnectionSelector.displayName = 'ConnectionSelector';

export default ConnectionSelector;
