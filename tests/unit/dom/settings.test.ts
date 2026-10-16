import { afterEach, describe, expect, it } from 'vitest';
import { clampZoom, loadSettings } from '@/app/settings';

afterEach(() => localStorage.clear());

function stored(reading: Record<string, unknown>): void {
  localStorage.setItem('openmark.settings.v1', JSON.stringify({ version: 1, reading }));
}

describe('zoom and image alignment settings', () => {
  it('clamps a stored zoom into the supported range', () => {
    stored({ zoom: 9 });
    expect(loadSettings().reading.zoom).toBe(2);
    stored({ zoom: 0.01 });
    expect(loadSettings().reading.zoom).toBe(0.5);
  });

  it('rejects an alignment that is not one of the choices', () => {
    stored({ imageAlign: 'justify' });
    expect(loadSettings().reading.imageAlign).toBe('left');
    stored({ imageAlign: 'center' });
    expect(loadSettings().reading.imageAlign).toBe('center');
  });

  it('keeps zoom steps exact, so ten steps up and down return to 100%', () => {
    let zoom = 1;
    for (let i = 0; i < 10; i++) zoom = clampZoom(zoom + 0.1);
    for (let i = 0; i < 10; i++) zoom = clampZoom(zoom - 0.1);
    expect(zoom).toBe(1);
  });
});
