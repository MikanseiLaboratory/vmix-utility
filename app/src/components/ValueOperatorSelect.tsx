import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import { operatorLabel, type ValueOperator } from '../utils/queryValue';

/** The operators offered by the menu, in display order. */
const OPERATORS: ValueOperator[] = ['', '+', '-'];

const HINT_KEY: Record<ValueOperator, string> = {
  '': 'shortcut.operatorAbsolute',
  '+': 'shortcut.operatorAdd',
  '-': 'shortcut.operatorSubtract',
};

interface ValueOperatorSelectProps {
  operator: ValueOperator;
  onChange: (operator: ValueOperator) => void;
  /** Parameter key, used to keep the accessible name unique per row. */
  paramKey?: string;
  disabled?: boolean;
}

/**
 * The `=` part of `Key=Value`, rendered in front of the value input.
 *
 * Clicking it opens a menu so the same value can be sent as an absolute value
 * (`=`), an increase (`+=`) or a decrease (`-=`), matching vMix's relative
 * parameter syntax.
 */
const ValueOperatorSelect = ({ operator, onChange, paramKey, disabled }: ValueOperatorSelectProps) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const label = operatorLabel(operator);
  const key = paramKey?.trim();

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  return (
    <>
      <Button
        size="small"
        variant="text"
        color={operator ? 'primary' : 'inherit'}
        disabled={disabled}
        aria-label={key
          ? t('shortcut.valueOperatorAria', { key, operator: label })
          : t('shortcut.valueOperator')}
        aria-haspopup="menu"
        aria-expanded={open || undefined}
        onClick={handleOpen}
        sx={{
          minWidth: 0,
          px: 0.5,
          py: 0,
          fontFamily: 'monospace',
          fontSize: '0.8125rem',
          fontWeight: operator ? 700 : 400,
          lineHeight: 1.4,
          textTransform: 'none',
          flexShrink: 0,
        }}
      >
        {label}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        slotProps={{ list: { 'aria-label': t('shortcut.valueOperatorMenu') } }}
      >
        {OPERATORS.map((value, index) => (
          <MenuItem
            key={value || 'absolute'}
            selected={value === operator}
            role="menuitemradio"
            aria-checked={value === operator}
            divider={index === 0}
            onClick={() => {
              onChange(value);
              setAnchorEl(null);
            }}
            sx={{ gap: 1, minWidth: 168 }}
          >
            <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {operatorLabel(value)}
            </Typography>
            <Typography component="span" variant="caption" color="text.secondary">
              {t(HINT_KEY[value])}
            </Typography>
            <CheckIcon
              fontSize="small"
              sx={{ ml: 'auto', visibility: value === operator ? 'visible' : 'hidden' }}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default ValueOperatorSelect;
