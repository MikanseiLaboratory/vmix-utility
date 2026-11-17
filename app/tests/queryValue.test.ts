import { describe, expect, test } from 'bun:test';
import {
  composeValue,
  encodeValue,
  operatorLabel,
  resolveValue,
  splitOperator,
} from '../src/utils/queryValue';

// vMix's HTTP API rejects `Value=+=1000` ("Invalid Parameters" because the
// literal `+` is decoded to a space) and also rejects `Value=%2B1000` (the
// operator needs the `=`), but accepts `Value=%2B%3D1000`. The URL builder
// therefore percent-encodes the whole value while the Script API keeps the raw
// `+=1000` form.
describe('operatorLabel', () => {
  test('shows an equals sign for absolute values', () => {
    expect(operatorLabel('')).toBe('=');
  });

  test('shows the relative operators', () => {
    expect(operatorLabel('+')).toBe('+=');
    expect(operatorLabel('-')).toBe('-=');
  });
});

describe('composeValue', () => {
  test('keeps absolute values untouched', () => {
    expect(composeValue('1000')).toBe('1000');
    expect(composeValue('-1')).toBe('-1');
  });

  test('prefixes relative offsets', () => {
    expect(composeValue('1000', '+')).toBe('+=1000');
    expect(composeValue('1000', '-')).toBe('-=1000');
  });

  test('never emits a bare operator for an empty value', () => {
    expect(composeValue('', '+')).toBe('');
    expect(composeValue('', '-')).toBe('');
  });
});

describe('encodeValue', () => {
  test('leaves absolute numbers readable', () => {
    expect(encodeValue('1000')).toBe('1000');
  });

  test('encodes a relative operator as %2B%3D / %3D', () => {
    expect(encodeValue('1000', '+')).toBe('%2B%3D1000');
    expect(encodeValue('1000', '-')).toBe('-%3D1000');
  });

  test('encodes characters that would break the query string', () => {
    expect(encodeValue('My Cam')).toBe('My%20Cam');
    expect(encodeValue('a&b=c', '+')).toBe('%2B%3Da%26b%3Dc');
  });
});

describe('splitOperator', () => {
  test('moves a typed or pasted operator into the control', () => {
    expect(splitOperator('+=1000')).toEqual({ operator: '+', value: '1000' });
    expect(splitOperator('-=250')).toEqual({ operator: '-', value: '250' });
  });

  test('accepts the encoded form so pasting a generated URL does not re-encode it', () => {
    expect(splitOperator('%2B%3D1000')).toEqual({ operator: '+', value: '1000' });
    expect(splitOperator('%2b%3d1000')).toEqual({ operator: '+', value: '1000' });
    expect(splitOperator('%2D%3D250')).toEqual({ operator: '-', value: '250' });
  });

  test('keeps negative absolute values', () => {
    expect(splitOperator('-1')).toEqual({ operator: '', value: '-1' });
    expect(splitOperator('-0.5')).toEqual({ operator: '', value: '-0.5' });
  });

  test('only strips a leading operator', () => {
    expect(splitOperator('a+=b')).toEqual({ operator: '', value: 'a+=b' });
    expect(splitOperator('')).toEqual({ operator: '', value: '' });
  });

  test('round-trips composed values', () => {
    for (const operator of ['', '+', '-'] as const) {
      expect(splitOperator(composeValue('1234', operator))).toEqual({ operator, value: '1234' });
    }
  });
});

describe('resolveValue', () => {
  test('prefers an explicit operator', () => {
    expect(resolveValue('1000', '+')).toEqual({ operator: '+', value: '1000' });
  });

  test('recovers an operator left in the value', () => {
    expect(resolveValue('%2B%3D1000')).toEqual({ operator: '+', value: '1000' });
    expect(resolveValue('+=1000')).toEqual({ operator: '+', value: '1000' });
  });

  test('leaves plain values alone', () => {
    expect(resolveValue('1000')).toEqual({ operator: '', value: '1000' });
  });
});

describe('double encoding', () => {
  // vMix answers "Invalid Parameters" to `%252B%253D1000`, which is what a
  // second encodeURIComponent pass produced when a generated URL was pasted
  // back into the value field.
  test('a pasted encoded offset is encoded exactly once', () => {
    expect(encodeValue('%2B%3D1000')).toBe('%2B%3D1000');
    expect(encodeValue('%2B%3D1000')).not.toBe('%252B%253D1000');
  });

  test('the operator control plus a plain value still encodes once', () => {
    expect(encodeValue('1000', '+')).toBe('%2B%3D1000');
  });

  test('a raw pasted offset encodes once', () => {
    expect(encodeValue('+=1000')).toBe('%2B%3D1000');
  });
});
