/**
 * Query parameter helpers for the Shortcut Generator.
 *
 * vMix accepts relative values such as `+=1000` / `-=1000` for numeric
 * parameters (SetPosition, SetVolume, ...). The HTTP API only understands them
 * when the operator is percent-encoded (`Value=%2B%3D1000`): a literal `+` is
 * decoded to a space and `%2B1000` (operator `+` without `=`) is rejected as
 * "Invalid Parameters". The Script API on the other hand takes the raw
 * `+=1000` form, so both spellings are produced from the same operator + value
 * pair.
 */

/** Relative operator prefix. `''` means the value is absolute. */
export type ValueOperator = '' | '+' | '-';

/** Operator as shown in the UI (`=` when the value is absolute). */
export function operatorLabel(operator: ValueOperator): string {
  return operator === '' ? '=' : `${operator}=`;
}

/** Raw vMix value such as `+=1000` (Script API / Tauri command payload). */
export function composeValue(value: string, operator: ValueOperator = ''): string {
  // An empty value has nothing to offset; never emit a bare `+=`.
  return operator === '' || value === '' ? value : `${operator}=${value}`;
}

/** Percent-encoded query value such as `%2B%3D1000` for the HTTP API URL. */
export function encodeValue(value: string, operator: ValueOperator = ''): string {
  return encodeURIComponent(composeValue(value, operator));
}

/**
 * Splits a typed/pasted `+=` / `-=` prefix off so the operator can move into
 * the UI control. A bare `+` / `-` stays in the value because `-1` is a valid
 * absolute input number.
 */
export function splitOperator(value: string): { operator: ValueOperator; value: string } {
  if (value.startsWith('+=')) {
    return { operator: '+', value: value.slice(2) };
  }
  if (value.startsWith('-=')) {
    return { operator: '-', value: value.slice(2) };
  }
  return { operator: '', value };
}
