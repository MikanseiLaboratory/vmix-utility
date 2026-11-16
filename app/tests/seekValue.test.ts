import { describe, expect, test } from 'bun:test';
import { seekMillis, seekRelative } from '../src/utils/seekValue';

// vMix answers HTTP 500 when SetPosition receives a fractional Value, so the
// payload must always be an integer. A frame is 1000/30 ms, which makes
// fractional positions the normal case rather than an edge case.
describe('seekMillis', () => {
  test('rounds the fractional frame length away', () => {
    expect(seekMillis(1000 / 30)).toBe('33');
    expect(seekMillis(20920.666666666668)).toBe('20921');
    expect(seekMillis(19986.333333333332)).toBe('19986');
  });

  test('keeps integers untouched', () => {
    expect(seekMillis(0)).toBe('0');
    expect(seekMillis(20954)).toBe('20954');
  });

  test('never sends a negative position', () => {
    expect(seekMillis(-33.333)).toBe('0');
  });

  test('never emits a decimal point for any frame position', () => {
    for (let frame = 0; frame <= 3000; frame += 1) {
      const value = seekMillis((frame / 30) * 1000);
      expect(value).toMatch(/^\d+$/);
      expect(Number(value)).toBe(Math.round((frame / 30) * 1000));
    }
  });
});

describe('seekRelative', () => {
  test('keeps the vMix prefix and rounds the step', () => {
    expect(seekRelative('-=', 33.333)).toBe('-=33');
    expect(seekRelative('+=', 12.6)).toBe('+=13');
  });

  test('never emits a zero step', () => {
    expect(seekRelative('+=', 0.2)).toBe('+=1');
    expect(seekRelative('-=', -0.2)).toBe('-=1');
  });
});
