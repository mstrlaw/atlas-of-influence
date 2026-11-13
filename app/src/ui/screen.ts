import type { Atlas, Entity } from '../data/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Renders the phone's DOM screen: home grid and the "influence facts" sheet. */
export class ScreenUI {
  readonly root = $('screen');
  private home = $('home');
  private app = $('app');

  constructor(private atlas: Atlas, onOpen: (id: string) => void) {
    const grid = $('grid');
    grid.innerHTML = atlas.phoneApps
      .map(
        (e) => `<button class="app-icon" data-id="${e.id}" style="--tint:${e.tint ?? '#fff'}">
          <span class="tile">${esc(e.glyph ?? e.name[0])}</span><span class="label">${esc(e.name)}</span></button>`,
      )
      .join('');
    grid.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>('.app-icon');
      if (btn) onOpen(btn.dataset.id!);
    });

    // Tap a row to reveal the criterion's definition.
    $('sheet').addEventListener('click', (ev) => {
      (ev.target as HTMLElement).closest('.row')?.classList.toggle('open');
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

  showApp(e: Entity, animateFromIcon: boolean) {
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

  private sheetHTML(e: Entity): string {
    const { criteria } = this.atlas;
    const label = (v: number) => criteria.scale.find((s) => s.value === v)?.label ?? '—';
    const max = Math.max(...criteria.scale.map((s) => s.value));
    const cats = criteria.categories
      .map((cat) => {
        const rows = cat.criteria
          .map((c) => {
            const v = e.sheet?.[c.id];
            const pips = Array.from({ length: max }, (_, i) => `<span class="pip${v !== undefined && i < v ? ' on' : ''}"></span>`).join('');
            return `<div class="row"><button class="row-btn" aria-expanded="false">
                <span class="row-name">${esc(c.name)}</span>
                <span class="pips" aria-hidden="true">${pips}</span>
                <span class="row-val">${v === undefined ? '—' : label(v)}</span>
              </button><p class="row-def">${esc(c.definition)}</p></div>`;
          })
          .join('');
        return `<div class="cat-name">${esc(cat.name)}<small>level</small></div><div class="rule-m"></div>${rows}`;
      })
      .join('');

    return `<div class="label-box">
        <p class="label-title">Influence Facts</p>
        <p class="label-sub">Serving size: one daily scroll</p>
        <div class="rule-xl"></div>
        ${e.summary ? `<p class="summary">${esc(e.summary)}</p><div class="rule-m"></div>` : ''}
        ${cats}
      </div>
      <p class="footnote">Tap a row for its definition.</p>`;
  }

  private tickClock() {
    const el = $('clock');
    const set = () => (el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, ''));
    set();
    setInterval(set, 30_000);
  }
}
