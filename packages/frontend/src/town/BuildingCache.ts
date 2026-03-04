/**
 * Cached HSL color string helper.
 */

const _hslCache = new Map<string, string>();
export function hsl(h: number, s: number, l: number, a = 1): string {
  const key = `${h},${s},${l},${a}`;
  let v = _hslCache.get(key);
  if (!v) {
    v = a < 1 ? `hsla(${h},${s}%,${l}%,${a})` : `hsl(${h},${s}%,${l}%)`;
    _hslCache.set(key, v);
  }
  return v;
}
