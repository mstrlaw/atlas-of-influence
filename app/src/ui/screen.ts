import { apps, sheetFor, sheetParts } from '../data/model';
import type { Actor } from '../data/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const PIPS = 5;

/**
 * Renders the phone's DOM screen: the home grid and each app's "Influence Facts" sheet.
 * A sheet line states how much evidence the atlas holds on it for this app (cases and sources),
 * never a severity score; a line with none reads "Not yet examined".
 */
export class ScreenUI {
  readonly root = $('screen');
  private home = $('home');
  private app = $('app');

  constructor(onOpen: (id: string) => void) {
    const grid = $('grid');
    grid.innerHTML = apps
      .map(
        (e) => `<button class="app-icon" data-id="${e.id}" style="--tint:${e.app!.tint}">
          <span class="tile${e.app!.glyph.length > 2 ? ' small' : ''}">${esc(e.app!.glyph)}</span><span class="label">${esc(e.name)}</span></button>`,
      )
      .join('');
    grid.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>('.app-icon');
      if (btn) onOpen(btn.dataset.id!);
    });

    // Tap a row to reveal the line's definition and the cases behind it.
    $('sheet').addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest('.case-link')) return;
      t.closest('.row')?.classList.toggle('open');
    });

    this.tickClock();
  }

  showHome() {
    this.shownId = null;
    this.root.classList.remove('in-app');
    this.app.hidden = true;
    this.home.hidden = false;
  }

  private shownId: string | null = null;

  showApp(e: Actor, animateFromIcon: boolean) {
    // Same app already on screen (e.g. entering/leaving explore): keep scroll and expanded rows.
    if (this.shownId === e.id && !this.app.hidden) return;
    this.shownId = e.id;
    $('app-name').textContent = e.name;
    $('sheet').innerHTML = this.sheetHTML(e);
    $('sheet').scrollTop = 0;
    this.root.classList.add('in-app');

    if (!animateFromIcon || this.app.hidden === false) {
      this.app.hidden = false;
      this.home.hidden = true;
      return;
    }
    // Zoom the app out of its icon, iOS-style.
    const icon = this.home.querySelector<HTMLElement>(`[data-id="${e.id}"] .tile`);
    if (icon) {
      const ox = icon.offsetLeft + icon.offsetWidth / 2 + (icon.offsetParent as HTMLElement).offsetLeft;
      const oy = icon.offsetTop + icon.offsetHeight / 2 + (icon.offsetParent as HTMLElement).offsetTop;
      this.app.style.transformOrigin = `${ox}px ${oy}px`;
    }
    this.app.classList.add('opening');
    this.app.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => this.app.classList.remove('opening')));
    setTimeout(() => (this.home.hidden = true), 420);
  }

  private sheetHTML(e: Actor): string {
    const sheet = sheetFor(e.id);
    const parts = sheetParts
      .map((part) => {
        const rows = part.lines
          .map((line) => {
            const entry = sheet.get(line.id)!;
            const n = entry.cases.length;
            const pips = Array.from({ length: PIPS }, (_, i) => `<span class="pip${i < n ? ' on' : ''}"></span>`).join('');
            const owner = entry.owners.length ? entry.owners[0] : '';
            const value = n ? plural(n, 'case') : owner ? owner : 'Not yet examined';
            const links = entry.cases
              .map((c) => `<button class="case-link" data-act="case" data-id="${c.id}">${esc(c.title)} <span aria-hidden="true">›</span></button>`)
              .join('');
            const basis = n
              ? `<p class="row-src">${plural(entry.sources, 'source')} behind ${n === 1 ? 'this case' : 'these cases'}.</p>`
              : `<p class="row-src">The atlas holds no case on this yet. That is not a finding that there is nothing to find.</p>`;
            const owned = entry.owners.length ? `<p class="row-src">Owned by ${esc(entry.owners.join(', then '))}.</p>` : '';
            return `<div class="row${n ? '' : ' none'}"><button class="row-btn" aria-expanded="false">
                <span class="row-name">${esc(line.name)}</span>
                <span class="pips" aria-hidden="true">${pips}</span>
                <span class="row-val">${esc(value)}</span>
              </button><div class="row-def"><p>${esc(line.definition)}</p>${owned}${links}${basis}</div></div>`;
          })
          .join('');
        return `<div class="cat-name">${esc(part.part)}<small>evidence</small></div><div class="rule-m"></div>${rows}`;
      })
      .join('');

    return `<div class="label-box">
        <p class="label-title">Influence Facts</p>
        <p class="label-sub">What the evidence in this atlas shows</p>
        <div class="rule-xl"></div>
        <p class="summary">${esc(e.app!.summary)}</p><div class="rule-m"></div>
        ${parts}
      </div>
      <p class="footnote">Bars count cases the atlas holds, not how harmful the app is. Tap a line to see them.</p>`;
  }

  private tickClock() {
    const el = $('clock');
    const set = () => (el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, ''));
    set();
    setInterval(set, 30_000);
  }
}
