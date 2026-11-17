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

/**
 * Splits a typed, pasted or already-encoded offset prefix into an operator and
 * a plain value.
 *
 * Both `+=1000` and `%2B%3D1000` are accepted because the encoded form is what
 * the generated URL shows; pasting that back into the value field must not
 * encode it a second time (which vMix rejects as "Invalid Parameters"). A bare
 * `+` / `-` stays in the value because `-1` is a valid absolute input number.
 */
export function splitOperator(value: string): { operator: ValueOperator; value: string } {
  const encoded = value.match(/^(%2B|%2D)%3D(.*)$/i);
  if (encoded) {
    return {
      operator: encoded[1].toUpperCase() === '%2B' ? '+' : '-',
      value: encoded[2],
    };
  }
  if (value.startsWith('+=')) {
    return { operator: '+', value: value.slice(2) };
  }
  if (value.startsWith('-=')) {
    return { operator: '-', value: value.slice(2) };
  }
  return { operator: '', value };
}

/**
 * Effective operator + value for a field, tolerating a value that still carries
 * an offset prefix. Keeps every consumer immune to double encoding even if the
 * state was not normalised on input.
 */
export function resolveValue(
  value: string,
  operator: ValueOperator = '',
): { operator: ValueOperator; value: string } {
  if (operator !== '') {
    return { operator, value };
  }
  return splitOperator(value);
}

/**
 * Raw vMix value such as `+=1000` (Script API / Tauri command payload).
 *
 * The Script API is not a URL, so the operator stays literal here.
 */
export function composeValue(value: string, operator: ValueOperator = ''): string {
  const resolved = resolveValue(value, operator);
  // An empty value has nothing to offset; never emit a bare `+=`.
  return resolved.operator === '' || resolved.value === ''
    ? resolved.value
    : `${resolved.operator}=${resolved.value}`;
}

/** Percent-encoded query value such as `%2B%3D1000` for the HTTP API URL. */
export function encodeValue(value: string, operator: ValueOperator = ''): string {
  return encodeURIComponent(composeValue(value, operator));
}
