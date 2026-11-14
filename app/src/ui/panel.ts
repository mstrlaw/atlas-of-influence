import {
  actor, caseEvidence, caseOf, cases, casesFor, casesWithActor, countryName, gradeMeanings, holdings, isApp, kindLabel,
  mechanism, mechanismLayers, nameOf, narrative, narrativeList, narrativeSteps, ownerReaches, owners, readMeanings,
  relations, responsesOf, sheetParts, sourcesOf,
} from '../data/model';
import type { Case, Selection } from '../data/types';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();

const READ_LABEL: Record<string, string> = { full: 'read in full', partial: 'read in part', secondhand: 'known secondhand', unread: 'not read yet' };
const RESPONSE_LABEL: Record<string, string> = { denial: 'denies', explanation: 'explains', admission: 'admits', no_reply: 'no reply' };
const TARGET_LABEL: Record<string, string> = { public: 'the public', community: 'a community', decision_maker: 'a decision-maker', ai_model: 'an AI model' };
const KNOWING_LABEL: Record<string, string> = {
  yes: 'Knew what they were carrying', no: 'Did not know the origin', disputed: 'Whether they knew is disputed', unknown: 'Whether they knew is not known',
};
const lineName = (id: string) => sheetParts.flatMap((p) => p.lines).find((l) => l.id === id)?.name ?? id;
const appName = (id: string) => actor(id)?.name ?? id;

type Tab = 'cases' | 'narratives' | 'owners';

export interface PanelHooks {
  /** Choose something to explore (null clears it). `appId` switches app when it differs from the current one. */
  select(sel: Selection | null, appId?: string): void;
  /** Jump to a step of the case's path. */
  step(index: number): void;
  togglePlay(): void;
}

/**
 * The side panel of the explore view: choose a case, a narrative or an owner, read what it is in plain
 * words, follow its path step by step, and open the sources behind every statement.
 * The 3D scene responds to what is chosen here; nothing has to be found in the scene first.
 */
export class Panel {
  readonly root = document.getElementById('panel') as HTMLElement;
  private body = document.getElementById('panel-body') as HTMLElement;
  private appId = '';
  private sel: Selection | undefined;
  private tab: Tab = 'cases';

  constructor(private hooks: PanelHooks) {
    this.root.addEventListener('click', (ev) => this.onClick(ev));
    document.getElementById('panel-grip')!.addEventListener('click', () => this.root.classList.toggle('collapsed'));
  }

  hide() { this.root.hidden = true; }

  /** Show the panel for an app, with or without something selected. */
  show(appId: string, sel?: Selection) {
    const changed = appId !== this.appId || sel?.type !== this.sel?.type || sel?.id !== this.sel?.id;
    this.appId = appId;
    this.sel = sel;
    if (sel?.type === 'narrative') this.tab = 'narratives';
    else if (sel?.type === 'owner') this.tab = 'owners';
    else if (sel?.type === 'case') this.tab = 'cases';
    this.root.hidden = false;
    if (changed || !this.body.innerHTML) {
      this.render();
      this.body.scrollTop = 0;
      this.root.classList.remove('collapsed');
    }
  }

  /** Reflect the path playback: which step is current, and whether it is running. */
  setPlayback(step: number, playing: boolean) {
    this.body.querySelectorAll<HTMLElement>('.step').forEach((el, i) => {
      el.classList.toggle('current', i === step);
      el.classList.toggle('done', step >= 0 && i < step);
    });
    const btn = this.body.querySelector<HTMLElement>('[data-act="play"]');
    if (btn) btn.textContent = playing ? 'Pause' : step >= 0 ? 'Play from here' : 'Play the path';
    if (playing) this.body.querySelector('.step.current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  private onClick(ev: Event) {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const d = el.dataset;
    switch (d.act) {
      case 'tab': this.tab = d.tab as Tab; this.render(); break;
      case 'back': this.hooks.select(null); break;
      case 'select': this.hooks.select({ type: d.type as Selection['type'], id: d.id! }, d.app || undefined); break;
      case 'app': this.hooks.select(null, d.id); break;
      case 'step': this.hooks.step(Number(d.i)); break;
      case 'play': this.hooks.togglePlay(); break;
      case 'src': {
        const target = this.body.querySelector<HTMLElement>(`#row-${d.id}`);
        if (target) {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          target.classList.add('flash');
          setTimeout(() => target.classList.remove('flash'), 1600);
        }
        ev.stopPropagation();
        break;
      }
    }
  }

  private render() {
    const s = this.sel;
    this.body.innerHTML =
      s?.type === 'case' && caseOf(s.id) ? this.caseView(caseOf(s.id)!)
      : s?.type === 'narrative' && narrative(s.id) ? this.narrativeView(s.id)
      : s?.type === 'owner' && actor(s.id) ? this.ownerView(s.id)
      : s?.type === 'actor' && actor(s.id) ? this.actorView(s.id)
      : this.listView();
  }

  // ---------- Lists ----------

  private listView(): string {
    const mine = casesFor(this.appId);
    const tabs = ([['cases', 'Cases'], ['narratives', 'Narratives'], ['owners', 'Owners']] as [Tab, string][])
      .map(([id, label]) => `<button class="tab${this.tab === id ? ' on' : ''}" data-act="tab" data-tab="${id}" aria-pressed="${this.tab === id}">${label}</button>`)
      .join('');
    const intro = mine.length
      ? `The atlas holds ${plural(mine.length, 'case')} for this app. Choose one to follow its path through the scene.`
      : 'The atlas holds no case for this app yet. That means it has not been examined, not that there is nothing to find.';
    const list = this.tab === 'cases' ? this.caseList() : this.tab === 'narratives' ? this.narrativeListView() : this.ownerList();
    return `<header class="p-head"><p class="eyebrow">What is behind</p><h2>${esc(appName(this.appId))}</h2>
        <p class="lede">${intro}</p><div class="tabs" role="group" aria-label="Explore by">${tabs}</div></header>${list}`;
  }

  private caseCard(c: Case, appId: string, other: boolean): string {
    return `<button class="card" data-act="select" data-type="case" data-id="${c.id}"${other ? ` data-app="${appId}"` : ''}>
        <span class="card-title">${esc(c.title)}</span>
        <span class="card-meta">${esc(c.period)}${other ? ` · on ${esc(appName(appId))}` : ''}</span>
        <span class="card-text">${esc(firstSentence(c.summary))}</span></button>`;
  }

  private caseList(): string {
    const mine = casesFor(this.appId);
    const others = cases.filter((c) => !c.venues.includes(this.appId));
    return `<div class="cards">${mine.map((c) => this.caseCard(c, this.appId, false)).join('')}</div>
      ${others.length ? `<h3>On other apps</h3><div class="cards">${others.map((c) => this.caseCard(c, c.venues[0], true)).join('')}</div>` : ''}`;
  }

  private narrativeListView(): string {
    const cards = narrativeList
      .map(({ narrative: n, steps }) => {
        const here = steps.filter((s) => s.c.venues.includes(this.appId));
        const app = here.length ? '' : steps[0]?.c.venues[0] ?? '';
        const where = here.length ? `carried in ${plural(here.length, 'step')} on this app`
          : steps.length ? `carried on ${esc(appName(app))}` : 'no case drawn yet';
        return `<button class="card" data-act="select" data-type="narrative" data-id="${n.id}"${app ? ` data-app="${app}"` : ''}>
            <span class="card-title">“${esc(n.title)}”</span><span class="card-meta">${where}</span></button>`;
      })
      .join('');
    return `<p class="note-box">A narrative is a storyline in circulation. The atlas records one only when a source names it, and does not judge it true or false. Actors who repeat the same storyline are not shown as coordinated.</p><div class="cards">${cards}</div>`;
  }

  private ownerList(): string {
    const cards = owners
      .map(({ actor: a, holdings: h }) => {
        const reaches = ownerReaches(a.id, this.appId);
        const app = reaches ? '' : h.map((x) => x.relation.target).find(isApp) ?? '';
        return `<button class="card" data-act="select" data-type="owner" data-id="${a.id}"${app ? ` data-app="${app}"` : ''}>
            <span class="card-title">${esc(a.name)}</span>
            <span class="card-meta">${reaches ? 'reaches this app' : app ? `seen on ${esc(appName(app))}` : kindLabel(a.kind)}</span>
            <span class="card-text">Owns or controls ${esc(h.map((x) => appName(x.relation.target)).join(', '))}.</span></button>`;
      })
      .join('');
    return `<p class="note-box">Ownership is a relation between actors: who controls what. Choosing an owner outlines everything that answers to it.</p><div class="cards">${cards}</div>`;
  }

  // ---------- Shared pieces ----------

  private back(label: string): string {
    return `<button class="back-link" data-act="back">← ${label}</button>`;
  }

  private chips(ids: string[]): string {
    return ids.map((id) => `<button class="e-chip" data-act="src" data-id="${id}" title="Show this source">${id}</button>`).join('');
  }

  private sources(ids: string[]): string {
    const groups = sourcesOf(ids);
    if (!groups.length) return '';
    const html = groups
      .map((g) => {
        const rows = g.rows
          .map((r) => `<div class="src-row" id="row-${r.id}">
              <p class="src-tags"><span class="grade g-${esc(r.confidence)}" title="${esc(gradeMeanings[r.confidence] ?? '')}">${esc(r.confidence)}</span>
              <span class="read r-${esc(r.read_status)}" title="${esc(readMeanings[r.read_status] ?? '')}">${esc(READ_LABEL[r.read_status] ?? r.read_status)}</span>
              <span class="rid">${r.id}</span></p>
              <p class="src-fact">${esc(r.fact)}</p>${r.note ? `<p class="src-note">${esc(r.note)}</p>` : ''}</div>`)
          .join('');
        return `<div class="src"><a class="src-link" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">${esc(g.source)} <span aria-hidden="true">↗</span></a>${rows}</div>`;
      })
      .join('');
    return `<section><h3>Sources</h3>
      <p class="fine">Each row is one fact taken from the source, with a grade for what it rests on and a note on how the source was read. Hover a tag for its meaning. <a href="./framework.html">How the atlas is built</a></p>${html}</section>`;
  }

  private responses(ids: string[]): string {
    const rs = responsesOf(ids);
    if (!rs.length) return '';
    return `<section><h3>What they said</h3><ul class="resp">${rs
      .map((r) => `<li><b>${esc(r.by)}</b> <span class="resp-type">${esc(RESPONSE_LABEL[r.type] ?? r.type)}</span> ${esc(r.summary)}. ${this.chips([r.row])}</li>`)
      .join('')}</ul></section>`;
  }

  // ---------- A case ----------

  private caseView(c: Case): string {
    const app = this.appId;
    const attr = (label: string, value?: string) => (value ? `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>` : '');
    const steps = c.steps
      .map((s, i) => {
        const m = s.mechanism ? mechanism(s.mechanism) : undefined;
        const who = `${esc(nameOf(s.actor, app))}${s.to ? ` <span class="arrow">→</span> ${esc(nameOf(s.to, app))}` : ''}`;
        const tag = s.check ? '<span class="tag check">Check</span>' : m ? `<span class="tag">${esc(m.name)} · ${esc(mechanismLayers(m.id))}</span>` : '';
        const extra = [
          s.cost ? `<span class="fact"><b>Cost</b> ${esc(s.cost)}</span>` : '',
          s.knowing ? `<span class="fact">${esc(KNOWING_LABEL[s.knowing] ?? s.knowing)}</span>` : '',
          s.narrative ? `<button class="fact link" data-act="select" data-type="narrative" data-id="${s.narrative}">Carries “${esc(narrative(s.narrative)?.title ?? s.narrative)}”</button>` : '',
        ].join('');
        return `<li class="step${s.check ? ' is-check' : ''}" data-act="step" data-i="${i}" tabindex="0" role="button">
            <p class="step-who">${who}</p>${tag}<p class="step-text">${esc(s.text)}</p>
            ${extra ? `<p class="step-extra">${extra}</p>` : ''}<p class="step-src">${this.chips(s.evidence)}</p></li>`;
      })
      .join('');
    const effects = c.effects.length
      ? `<section><h3>What it did</h3><ul class="effects">${c.effects
          .map((e) => `<li><span class="tag">${esc(lineName(e.line))}</span> <span class="level">${e.level === 'proximate' ? 'on the screen' : 'on people'}</span>
              <p>${esc(e.text)}</p>${e.metric ? `<p class="metric">${esc(e.metric)}</p>` : ''}<p class="step-src">${this.chips(e.evidence)}</p></li>`)
          .join('')}</ul></section>`
      : '';
    const unknown = c.not_established.length
      ? `<section><h3>Not established</h3><ul class="plain">${c.not_established.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`
      : '';
    const elsewhere = c.venues.filter((v) => v !== app);
    const ids = caseEvidence(c);
    return `${this.back('All cases')}
      <header class="p-head"><p class="eyebrow">Case · ${esc(c.period)}${c.countries.length ? ' · ' + esc(c.countries.map(countryName).join(', ')) : ''}</p>
        <h2>${esc(c.title)}</h2><p class="summary-text">${esc(c.summary)}</p></header>
      <section><div class="path-head"><h3>The path</h3><button class="play" data-act="play">Play the path</button></div>
        <p class="fine">Pink lines are the path. Green lines are checks: reporting, research, regulators and courts.</p>
        <ol class="steps">${steps}</ol></section>
      ${effects}${unknown}
      <section><h3>How to read it</h3><dl class="attrs">
        ${attr('Intent', c.attributes.intent)}${attr('Transparency', c.attributes.transparency)}
        ${attr('Coordination', c.attributes.coordination)}${attr('Origin', c.attributes.origin)}
        ${attr('Aimed at', c.target ? TARGET_LABEL[c.target] ?? c.target : undefined)}
        ${c.attribution ? attr('Established by', `${c.attribution.by}. ${c.attribution.method}.`) : ''}</dl>
        ${elsewhere.length ? `<p class="fine">Also on ${elsewhere.map((v) => `<button class="inline" data-act="select" data-type="case" data-id="${c.id}" data-app="${v}">${esc(appName(v))}</button>`).join(', ')}.</p>` : ''}</section>
      ${this.responses(ids)}${this.sources(ids)}`;
  }

  // ---------- A narrative ----------

  private narrativeView(id: string): string {
    const n = narrative(id)!;
    const steps = narrativeSteps(id);
    const carried = steps.length
      ? `<section><h3>Where it is carried</h3><ul class="plain">${steps
          .map(({ c, step }) => {
            const here = c.venues.includes(this.appId);
            return `<li><button class="inline" data-act="select" data-type="case" data-id="${c.id}"${here ? '' : ` data-app="${c.venues[0]}"`}>${esc(c.title)}</button>
                ${here ? '' : `<span class="muted">(on ${esc(appName(c.venues[0]))})</span>`}<br>${esc(step.text)}</li>`;
          })
          .join('')}</ul></section>`
      : '<section><h3>Where it is carried</h3><p class="fine">No case in the atlas is drawn with this narrative yet. The sources below name it.</p></section>';
    return `${this.back('All narratives')}
      <header class="p-head"><p class="eyebrow">Narrative · a claim in circulation</p><h2>“${esc(n.title)}”</h2>
        <p class="summary-text">Recorded because sources name it as a storyline. The atlas does not judge it true or false. Violet marks the steps that carry it; actors who repeat the same storyline are not shown as coordinated.</p></header>
      <section><h3>Carried by</h3><ul class="plain">${n.carriers.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>
      ${carried}${this.sources(n.evidence)}`;
  }

  // ---------- An owner ----------

  private ownerView(id: string): string {
    const a = actor(id)!;
    const h = holdings(id);
    const list = h
      .map(({ relation: r, depth }) => {
        const target = actor(r.target);
        const open = isApp(r.target) && r.target !== this.appId
          ? ` <button class="inline" data-act="select" data-type="owner" data-id="${id}" data-app="${r.target}">open</button>` : '';
        const when = r.until ? ` (until ${esc(r.until)})` : r.from ? ` (from ${esc(r.from)})` : '';
        return `<li style="margin-left:${depth * 16}px"><b>${esc(target?.name ?? r.target)}</b>${when}${open}
            ${depth ? `<span class="muted">through ${esc(appName(r.source))}</span>` : ''}
            ${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''} ${this.chips(r.evidence)}</li>`;
      })
      .join('');
    const related = cases.filter((c) => c.steps.some((s) => s.actor === id || s.to === id) || h.some((x) => c.venues.includes(x.relation.target) && c.drivers.includes('owner')));
    return `${this.back('All owners')}
      <header class="p-head"><p class="eyebrow">Owner · ${esc(kindLabel(a.kind))}${a.country ? ' · ' + esc(countryName(a.country)) : ''}</p><h2>${esc(a.name)}</h2>
        <p class="summary-text">Everything outlined in black in the scene answers to this owner. Ownership says who controls what; it does not by itself show that the owner steered anything.</p></header>
      <section><h3>Owns or controls</h3><ul class="plain">${list}</ul></section>
      ${related.length ? `<section><h3>Cases where ownership matters</h3><div class="cards">${related.map((c) => this.caseCard(c, c.venues.includes(this.appId) ? this.appId : c.venues[0], !c.venues.includes(this.appId))).join('')}</div></section>` : ''}
      ${this.sources(h.flatMap((x) => x.relation.evidence))}`;
  }

  // ---------- An actor ----------

  private actorView(id: string): string {
    const a = actor(id)!;
    const out = relations.filter((r) => r.source === id);
    const inn = relations.filter((r) => r.target === id);
    const rel = (label: string, other: string, ev: string[], note?: string) =>
      `<li>${label} <b>${esc(appName(other))}</b>${note ? ` <span class="muted">${esc(note)}</span>` : ''} ${this.chips(ev)}</li>`;
    const rels = [...out.map((r) => rel(r.kind.replace('_', ' '), r.target, r.evidence, r.note)), ...inn.map((r) => rel(`${r.kind.replace('_', ' ')} by`, r.source, r.evidence, r.note))].join('');
    const flags = [
      a.authentic === false ? `<span class="tag warn">${a.front_for ? `Front for ${esc(appName(a.front_for))}` : 'Not what it appears to be'}</span>` : '',
      a.mainstream ? '<span class="tag">Established news institution</span>' : '',
    ].join(' ');
    const inCases = casesWithActor(id);
    const ids = [...out, ...inn].flatMap((r) => r.evidence).concat(a.reach ? [a.reach.source] : []);
    return `${this.back('All cases')}
      <header class="p-head"><p class="eyebrow">${esc(kindLabel(a.kind))}${a.country ? ' · ' + esc(countryName(a.country)) : ''}</p><h2>${esc(a.name)}</h2>
        ${flags ? `<p>${flags}</p>` : ''}${a.note ? `<p class="summary-text">${esc(a.note)}</p>` : ''}
        ${a.reach ? `<p class="summary-text">Reach: ${esc(a.reach.figure)} ${this.chips([a.reach.source])}</p>` : ''}
        <p class="fine">Being named here does not imply wrongdoing. Each case says what the sources establish about this actor's part.</p></header>
      ${rels ? `<section><h3>Relations</h3><ul class="plain">${rels}</ul></section>` : ''}
      ${inCases.length ? `<section><h3>Appears in</h3><div class="cards">${inCases.map((c) => this.caseCard(c, c.venues.includes(this.appId) ? this.appId : c.venues[0], !c.venues.includes(this.appId))).join('')}</div></section>` : ''}
      ${this.sources(ids)}`;
  }
}

