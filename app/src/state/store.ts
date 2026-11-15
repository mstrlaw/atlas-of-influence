// Tiny state machine: HOME → APP → EXPLORE (optionally with something selected).
// The URL hash mirrors the state so every view is shareable.
// Hashes are plain names (#app-tiktok) because some hosts drop "#/paths".

import type { Selection } from '../data/types';

export type View =
  | { name: 'home' }
  | { name: 'app'; appId: string }
  | { name: 'explore'; appId: string; sel?: Selection };

type Listener = (next: View, prev: View) => void;

let current: View = { name: 'home' };
const listeners = new Set<Listener>();

export const getView = () => current;

export function onViewChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(next: View) {
  const prev = current;
  if (toHash(prev) === toHash(next)) return;
  current = next;
  listeners.forEach((fn) => fn(next, prev));
}

export function toHash(v: View): string {
  switch (v.name) {
    case 'home': return '';
    case 'app': return `app-${v.appId}`;
    case 'explore': return v.sel ? `explore-${v.appId}--${v.sel.type}-${v.sel.id}` : `explore-${v.appId}`;
  }
}

const SEL = /^explore-(.+?)--(case|narrative|owner|actor)-(.+)$/;

export function fromHash(hash: string, isApp: (id: string) => boolean): View {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  let m: RegExpMatchArray | null;
  if ((m = h.match(SEL)) && isApp(m[1])) return { name: 'explore', appId: m[1], sel: { type: m[2] as Selection['type'], id: m[3] } };
  if ((m = h.match(/^explore-(.+)$/)) && isApp(m[1])) return { name: 'explore', appId: m[1] };
  if ((m = h.match(/^app-(.+)$/)) && isApp(m[1])) return { name: 'app', appId: m[1] };
  return { name: 'home' };
}

/** Navigate by writing the hash; the router turns it into state. */
export function go(v: View) {
  // State changes first, so navigation works even where the URL can't be written (sandboxed previews).
  set(v);
  const h = toHash(v);
  try {
    if (h === '') history.pushState(null, '', location.pathname + location.search);
    else if (location.hash.slice(1) !== h) location.hash = h;
  } catch { /* URL sync unavailable; in-memory state still drives the app */ }
}

export function startRouter(isApp: (id: string) => boolean) {
  const sync = () => set(fromHash(location.hash, isApp));
  window.addEventListener('hashchange', sync);
  window.addEventListener('popstate', sync);
  sync();
}
