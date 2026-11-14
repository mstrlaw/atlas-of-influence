import './ui/styles.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { actor, apps, atlasGraph, caseOf, contextFor, isApp, kindLabel, trailForActor, trailForCase, trailForNarrative, trailForOwner } from './data/model';
import type { Selection, TrailStep } from './data/types';
import { Stage } from './scene/stage';
import { Phone, PHONE, SCREEN_PX } from './scene/phone';
import { PlatformView } from './scene/platform';
import { NetworkView } from './scene/network';
import { layoutNetwork } from './scene/layout';
import { paintFromDOM } from './scene/domPainter';
import { ScreenUI } from './ui/screen';
import { Panel } from './ui/panel';
import { getView, go, onViewChange, startRouter, type View } from './state/store';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
type Pose = { p: THREE.Vector3Tuple; r: THREE.Vector3Tuple };
type Cam = { pos: THREE.Vector3; target: THREE.Vector3 };

/** Width of the side panel on wide screens, and the share of the height its sheet takes on narrow ones. */
const PANEL_W = 420;
const SHEET_SHARE = 0.46;
const wide = () => innerWidth >= 900;

async function boot() {
  const stage = new Stage($('stage'));
  const phone = new Phone();
  const platform = new PlatformView(phone);
  stage.scene.add(phone.group);
  platform.addTo(stage.scene);

  // The atlas: every sphere and actor, laid out once from all the data. Nothing in it is added, removed or
  // moved by what is explored; a selection only changes what is lit and where the camera looks.
  // One platform stands between the phone and the atlas: the app being viewed. It changes with what is viewed.
  const DEPTH = 3.2; // from the phone to the platform
  const network = new NetworkView();
  network.root.position.set(0, 0, -DEPTH);
  stage.scene.add(network.root);
  const net = layoutNetwork(atlasGraph());
  network.build(net, DEPTH);
  network.root.updateMatrixWorld(true);
  platform.group.position.set(0, 0, -DEPTH);
  let openId = apps[0].id;
  /** 1 = the platform is fully open; dips to 0 while it swaps for another app's. */
  const sw = { k: 1, busy: false };

  const ui = new ScreenUI((id) => go({ name: 'app', appId: id }));

  // The flat HTML screen sits exactly on the 3D screen rect while the phone faces the camera.
  function placeScreen() {
    const r = phone.screenRect(stage.camera, innerWidth, innerHeight);
    ui.root.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / SCREEN_PX.w})`;
  }
  const appIds = apps.map((a) => a.id);

  // ---------- Layouts ----------
  const camTarget = new THREE.Vector3();
  let freeCamera = false; // true once OrbitControls own the camera

  // On narrow screens reserve a strip at the top for the HUD (Back button) so it never covers the phone.
  function homeCamera(): Cam {
    const reserve = innerWidth <= 600 ? 52 : 0;
    const k = innerHeight / Math.max(1, innerHeight - reserve);
    const d = stage.fitDistance(PHONE.w, PHONE.h * k, 1.06);
    const worldH = 2 * d * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
    const dy = (reserve / 2 / innerHeight) * worldH;
    return { pos: new THREE.Vector3(0, dy, d), target: new THREE.Vector3(0, dy, 0) };
  }
  const HOME_POSE: Pose = { p: [0, 0, 0], r: [0, 0, 0] };

  /** The angle the scene is first shown from: mostly from the side, a little from the front and above, so the pipeline reads across the picture from the screen (left) back to structure (right). */
  const viewDir = () => (stage.aspect < 0.85 ? new THREE.Vector3(0.62, 0.5, 0.6) : new THREE.Vector3(0.79, 0.3, 0.55)).normalize();

  /** Camera position and target that fit a set of world points into the part of the window the panel leaves free. */
  const probe = new THREE.PerspectiveCamera();
  function fit(points: THREE.Vector3[], dir: THREE.Vector3, margin = 1.12, minHalf = 1.6): Cam {
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of points) {
      const q = new THREE.Vector3(p.dot(right), p.dot(up), p.dot(dir));
      lo.min(q); hi.max(q);
    }
    const mid = lo.clone().add(hi).multiplyScalar(0.5);
    const halfW = Math.max(minHalf, ((hi.x - lo.x) / 2) * margin + 0.5), halfH = Math.max(minHalf, ((hi.y - lo.y) / 2) * margin + 0.5);
    const tanV = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
    const freeW = wide() ? (innerWidth - PANEL_W) / innerWidth : 1;
    const freeH = wide() ? 1 : 1 - SHEET_SHARE;
    // First guess: as if everything stood at the depth nearest the camera.
    let d = Math.max(halfH / (tanV * freeH), halfW / (tanV * stage.aspect * freeW)) + (hi.z - mid.z);
    const target = right.clone().multiplyScalar(mid.x).addScaledVector(up, mid.y).addScaledVector(dir, mid.z);
    // Then tighten it by looking: project the points, centre what is seen, and close in until it fills the free part.
    probe.fov = stage.camera.fov; probe.aspect = stage.aspect; probe.near = 0.1; probe.far = 400;
    probe.updateProjectionMatrix();
    const q = new THREE.Vector3();
    for (let i = 0; i < 5; i++) {
      probe.position.copy(target).addScaledVector(dir, d);
      probe.lookAt(target);
      probe.updateMatrixWorld(true);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of points) { q.copy(p).project(probe); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      target.addScaledVector(right, ((x0 + x1) / 2) * d * tanV * stage.aspect).addScaledVector(up, ((y0 + y1) / 2) * d * tanV);
      const pad = 0.5 / d; // half a unit of air around the picture
      const fill = Math.max(((x1 - x0) / 2 * margin + pad / (tanV * stage.aspect)) / freeW, ((y1 - y0) / 2 * margin + pad / tanV) / freeH);
      const floor = Math.max(minHalf / (tanV * freeH), minHalf / (tanV * stage.aspect * freeW));
      d = Math.max(floor, d * fill);
    }
    d = Math.min(115, d);
    return { pos: target.clone().addScaledVector(dir, d), target };
  }

  /** Corner points of the phone and the platform, so a framing never cuts them off. */
  function bodyPoints(phoneToo: boolean, platformToo: boolean): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    if (phoneToo) for (const x of [-1, 1]) for (const y of [-1, 1]) pts.push(new THREE.Vector3((x * PHONE.w) / 2, (y * PHONE.h) / 2, 0));
    if (platformToo) for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1])
      pts.push(new THREE.Vector3(x * 0.95, y * 0.95 + (y > 0 ? 0.45 : 0), -DEPTH + z * 0.95));
    return pts;
  }
  /** The whole atlas with the phone and the platform in front of it. It is the same picture whichever app is open. */
  function overview(): Cam {
    return fit([...network.extent(), ...bodyPoints(true, true)], viewDir(), 1.04);
  }

  // ---------- Transition: one progress value drives everything ----------
  // ex.p = 0 is the flat "2D" view, 1 is explore. Every pose below is a smooth function of p,
  // so motion is continuous (no stalls between steps), reverse is the exact mirror,
  // and interrupting just retargets the same value.
  const ex = { p: 0 };
  let fromCam = homeCamera();
  let toCam = overview();
  let tween: gsap.core.Tween | null = null;

  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
  const smooth = (t: number) => t * t * (3 - 2 * t);           // zero velocity at both ends
  const bump = (t: number) => Math.sin(Math.PI * t) ** 2;        // 0 → 1 → 0, zero slope at ends
  const backOut = (t: number) => { const c = 1.2; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

  function applyPose(p: number, dt: number, time: number) {
    // Phone: lifts off the page (z bump + top edge tipping back) while it travels and turns.
    const lift = bump(seg(p, 0, 0.75)) * 0.4; // a gentle nudge, not a lift-off
    phone.group.position.set(HOME_POSE.p[0], HOME_POSE.p[1], HOME_POSE.p[2] + 0.25 * lift);
    phone.group.rotation.set(HOME_POSE.r[0] - 0.14 * lift, HOME_POSE.r[1], HOME_POSE.r[2]);

    // The panel takes part of the window in explore: slide the picture into the part that stays free.
    const k = smooth(seg(p, 0.25, 1));
    if (wide()) stage.setShift((PANEL_W / 2) * k, 0);
    else stage.setShift(0, ((innerHeight * SHEET_SHARE) / 2) * k * (panel.root.classList.contains('collapsed') ? 0.15 : 1));

    // Camera: pulls back along a gentle upward arc.
    if (!freeCamera) {
      const tCam = smooth(seg(p, 0.03, 1));
      stage.camera.position.lerpVectors(fromCam.pos, toCam.pos, tCam);
      stage.camera.position.y += 0.12 * bump(tCam);
      camTarget.lerpVectors(fromCam.target, toCam.target, tCam);
      stage.camera.lookAt(camTarget);
    }

    // The platform: opens, then its algorithms dock one by one, then beams draw to the screen.
    // `sw.k` closes and reopens it when another app is chosen.
    const k2 = sw.k;
    platform.anim.rise = smooth(seg(p, 0.4, 0.85)) * smooth(seg(k2, 0, 0.6));
    platform.anim.dock.forEach((d, i) => (d.t = backOut(seg(p, 0.6 + i * 0.05, 0.84 + i * 0.05)) * smooth(seg(k2, 0.3 + i * 0.06, 0.8 + i * 0.04))));
    platform.anim.beams.forEach((b, i) => (b.t = smooth(seg(p, 0.8 + i * 0.03, 0.95 + i * 0.015)) * smooth(seg(k2, 0.7, 1))));
    network.setOpen(openId, platform.anim.rise);
    // The atlas: revealed once, hop by hop from the platform.
    network.update(p, stage.camera, dt, time);
  }

  function takeCamera() {
    if (freeCamera) {
      // The user may have orbited: make "p = 1" mean wherever the camera is now, so nothing jumps.
      toCam = { pos: stage.camera.position.clone(), target: stage.controls.target.clone() };
    }
    fly?.kill();
    freeCamera = false;
    stage.controls.enabled = false;
  }

  /** 2D → 3D. */
  function toExplore(appId: string) {
    tween?.kill();
    takeCamera();
    const start = () => {
      tween = gsap.to(ex, {
        p: 1, duration: 2.6 * (1 - ex.p), ease: 'power1.inOut',
        onComplete: () => {
          stage.controls.target.copy(camTarget);
          stage.controls.enabled = true;
          freeCamera = true;
          settled();
        },
      });
    };
    if (ex.p > 0) return start(); // reversing mid-way: screen is already the 3D copy

    // From flat: open this app's platform, fresh endpoints, then swap the HTML screen for its painted copy.
    openNow(appId);
    toCam = overview();
    fromCam = homeCamera();
    userMoved = false;
    repaint();
    ui.root.classList.add('off');                 // no taps during the move
    // Wait until a frame containing the fresh texture has been drawn, then crossfade (phone still static).
    stage.afterNextRender(() => {
      tween = gsap.to(ui.root, { opacity: 0, duration: 0.14, ease: 'none', onComplete: start });
    });
  }

  /** 3D → 2D. */
  function toFlat() {
    tween?.kill();
    takeCamera();
    fromCam = homeCamera();
    tween = gsap.to(ex, {
      p: 0, duration: 1.9 * ex.p, ease: 'power1.inOut',
      onComplete: () => {
        // Phone is flat and aligned again: bring the live HTML back over its copy.
        placeScreen();
        tween = gsap.to(ui.root, { opacity: 1, duration: 0.14, ease: 'none', onComplete: () => ui.root.classList.remove('off') });
      },
    });
  }

  /** Open a platform at once (while it cannot be seen). */
  function openNow(appId: string) {
    gsap.killTweensOf(sw);
    openId = appId;
    platform.setEntity(actor(appId)!);
    sw.k = 1; sw.busy = false;
    network.setContext(contextFor(appId));
  }

  /**
   * Another app while already exploring. The atlas stays exactly as it is: the platform behind the phone
   * closes, becomes the other app's, and opens again; the links into it change with it.
   */
  function switchApp(appId: string) {
    userMoved = false;
    pendingFocus = true;
    repaint();
    gsap.killTweensOf(sw);
    sw.busy = true;
    network.setContext(contextFor(appId));
    gsap.to(sw, {
      k: 0, duration: 0.3 * sw.k, ease: 'power1.in',
      onComplete: () => {
        openId = appId;
        platform.setEntity(actor(appId)!);
        gsap.to(sw, { k: 1, duration: 0.95, ease: 'none', onComplete: () => { sw.busy = false; settled(); } });
      },
    });
  }

  // ---------- Camera moves in explore ----------
  let fly: gsap.core.Tween | null = null;
  let userMoved = false;       // the visitor has orbited since the last camera move we made
  let pendingFocus = false;    // a selection arrived before the scene finished opening
  stage.controls.addEventListener('start', () => { userMoved = true; fly?.kill(); stage.controls.enabled = true; });

  function flyTo(pos: THREE.Vector3, target: THREE.Vector3, duration = 1.1) {
    if (!freeCamera) return;
    fly?.kill();
    const p0 = stage.camera.position.clone(), t0 = stage.controls.target.clone();
    const s = { t: 0 };
    fly = gsap.to(s, {
      t: 1, duration, ease: 'power2.inOut',
      onUpdate: () => {
        stage.camera.position.lerpVectors(p0, pos, s.t);
        stage.controls.target.lerpVectors(t0, target, s.t);
        stage.camera.lookAt(stage.controls.target);
      },
    });
  }

  /** Move the camera so a set of world points fills the free part of the window. Keeps the visitor's angle if they chose one. */
  function frame(points: THREE.Vector3[], duration = 1.1, minHalf = 1.6) {
    if (!points.length) return;
    const dir = userMoved ? stage.camera.position.clone().sub(stage.controls.target).normalize() : viewDir();
    const cam = fit(points, dir, 1.3, minHalf);
    flyTo(cam.pos, cam.target, duration);
  }

  function pointsOf(steps: TrailStep[]): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (const s of steps) for (const id of s.nodes) { const p = network.worldPositionOf(id); if (p) pts.push(p); }
    const here = steps.some((s) => s.platform);
    pts.push(...bodyPoints(steps.some((s) => s.screen), here));
    return pts;
  }

  // ---------- Trails and playback ----------
  let trail: TrailStep[] = [];
  const play = { upto: 0, step: -1, playing: false };
  let playTween: gsap.core.Tween | null = null;
  let playWait: gsap.core.Tween | null = null;

  /** Tell the platform cube and the beams how much of the trail involves them. */
  function glow(upto = trail.length) {
    const shown = trail.slice(0, Math.max(0, Math.ceil(upto)));
    const pick = (f: (s: TrailStep) => boolean) => shown.find(f)?.kind ?? null;
    platform.setGlow(trail.length > 0, pick((s) => s.platform), pick((s) => s.screen));
  }

  function stopPlayback() {
    playTween?.kill(); playWait?.kill();
    playTween = playWait = null;
    play.playing = false;
  }

  function showWholeTrail() {
    stopPlayback();
    play.step = -1;
    network.setTrail(trail);
    glow();
    panel.setPlayback(-1, false);
  }

  function playStep(i: number) {
    if (i >= trail.length) { showWholeTrail(); frame(pointsOf(trail), 1.3); return; }
    play.step = i;
    play.playing = true;
    play.upto = i;
    panel.setPlayback(i, true);
    frame(pointsOf(trail.slice(Math.max(0, i - 1), i + 2)), 1.0, 3.6);
    playTween = gsap.to(play, {
      upto: i + 1, duration: 1.7, ease: 'power1.inOut',
      onUpdate: () => { network.setProgress(play.upto); glow(play.upto); },
      onComplete: () => { playWait = gsap.delayedCall(1.5, () => playStep(i + 1)); },
    });
  }

  function jumpToStep(i: number) {
    stopPlayback();
    play.step = i;
    play.upto = i + 1;
    network.setTrail(trail, play.upto);
    glow(play.upto);
    panel.setPlayback(i, false);
    frame(pointsOf(trail.slice(Math.max(0, i - 1), i + 2)), 0.9, 3.6);
  }

  const panel = new Panel({
    select: (sel, appId) => {
      const v = getView();
      const current = v.name === 'home' ? appIds[0] : v.appId;
      go({ name: 'explore', appId: appId ?? current, sel: sel ?? undefined });
    },
    step: (i) => jumpToStep(i),
    togglePlay: () => {
      if (play.playing) { stopPlayback(); panel.setPlayback(play.step, false); return; }
      network.setTrail(trail, Math.max(0, play.step));
      playStep(play.step >= 0 && play.step < trail.length - 1 ? play.step : 0);
    },
  });

  function trailFor(sel: Selection | undefined, appId: string): TrailStep[] {
    if (!sel) return [];
    if (sel.type === 'case') return trailForCase(sel.id, appId);
    if (sel.type === 'narrative') return trailForNarrative(sel.id, appId);
    if (sel.type === 'owner') return trailForOwner(sel.id, appId);
    return trailForActor(sel.id, appId);
  }

  /** Light up the current selection and point the camera at it. */
  function applySelection(v: Extract<View, { name: 'explore' }>, move: boolean) {
    stopPlayback();
    trail = trailFor(v.sel, v.appId);
    play.step = -1;
    network.setTrail(trail.length ? trail : null);
    glow();
    panel.show(v.appId, v.sel);
    panel.setPlayback(-1, false);
    if (!move && !freeCamera) return;
    if (!freeCamera || sw.busy) { pendingFocus = true; return; }
    focusSelection();
  }

  function focusSelection() {
    pendingFocus = false;
    const pts = pointsOf(trail);
    if (pts.length) frame(pts.length < 3 ? [...pts, ...bodyPoints(false, true)] : pts);
    else { const cam = overview(); flyTo(cam.pos, cam.target); }
  }

  /** The scene has finished opening (or switching app): honour a selection that was waiting. */
  function settled() {
    if (pendingFocus) focusSelection();
  }

  const inExplore = (v: View): v is Extract<View, { name: 'explore' }> => v.name === 'explore';

  stage.onTick((dt, t) => {
    phone.setCrisp(ex.p < 0.004); // exact while (nearly) static, smooth once moving
    applyPose(ex.p, dt, t); // camera is only driven when not free (see applyPose)
    placeScreen();
    platform.update(t);
  });
  stage.onResize(() => {
    platform.setResolution(innerWidth, innerHeight);
    network.setResolution(innerWidth, innerHeight);
    network.labelBoost = wide() ? 1 : 1.5;
    if (ex.p === 0) fromCam = homeCamera();
  });

  // ---------- HUD ----------
  const back = $('back');
  const reset = $('reset');
  const legend = $('legend');
  back.addEventListener('click', () => goBack());
  reset.addEventListener('click', () => {
    userMoved = false;
    const v = getView();
    if (inExplore(v) && trail.length) focusSelection();
    else { const cam = overview(); flyTo(cam.pos, cam.target, 1.2); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') goBack();
    const v = getView();
    if (v.name === 'app' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) step(v.appId, e.key === 'ArrowRight' ? 1 : -1);
    // In a case: ← → step through the path.
    if (inExplore(v) && v.sel?.type === 'case' && trail.length && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      jumpToStep(Math.max(0, Math.min(trail.length - 1, play.step + (e.key === 'ArrowRight' ? 1 : -1))));
    }
  });

  function goBack() {
    const v = getView();
    if (v.name === 'explore' && v.sel) go({ name: 'explore', appId: v.appId });
    else if (v.name === 'explore') go({ name: 'app', appId: v.appId });
    else if (v.name === 'app') go({ name: 'home' });
  }
  function step(appId: string, dir: number) {
    const i = appIds.indexOf(appId);
    go({ name: 'app', appId: appIds[(i + dir + appIds.length) % appIds.length] });
  }

  // Buttons inside the phone screen.
  ui.root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const act = el?.dataset.act;
    const v = getView();
    if (act === 'home') go({ name: 'home' });
    if (v.name !== 'app') return;
    if (act === 'prev') step(v.appId, -1);
    if (act === 'next') step(v.appId, 1);
    if (act === 'explore') go({ name: 'explore', appId: v.appId });
    if (act === 'case') go({ name: 'explore', appId: v.appId, sel: { type: 'case', id: el!.dataset.id! } });
  });

  // Horizontal swipe on the sheet switches apps.
  let sx = 0, sy = 0;
  $('app').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('app').addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    const v = getView();
    if (v.name === 'app' && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) step(v.appId, dx < 0 ? 1 : -1);
  });

  // Click a cube to read about that actor. (Everything can also be reached from the panel.)
  {
    const canvas = stage.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number; t: number } | null = null;
    const tip = $('tip');
    const hit = (ev: PointerEvent) => {
      ndc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, stage.camera);
      const h = ray.intersectObjects(network.pickables(), false)[0];
      return (h?.object.userData.node?.id as string | undefined) ?? null;
    };
    // Names are small from far away: pointing at a cube says who it is.
    const showTip = (id: string | null, ev: PointerEvent) => {
      const a = id ? actor(id) : null;
      tip.hidden = !a;
      if (!a) return;
      tip.innerHTML = `<b></b><span></span>`;
      tip.firstElementChild!.textContent = a.name;
      tip.lastElementChild!.textContent = kindLabel(a.kind) + (a.authentic === false ? ' · front or fake account' : '');
      tip.style.transform = `translate(${Math.min(ev.clientX + 14, innerWidth - 260)}px, ${ev.clientY + 16}px)`;
    };
    canvas.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY, t: performance.now() }; tip.hidden = true; });
    canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
    canvas.addEventListener('pointerup', (ev) => {
      const d = down; down = null;
      const v = getView();
      if (!d || !inExplore(v) || !freeCamera) return;
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6 || performance.now() - d.t > 500) return;
      const id = hit(ev);
      if (id) go({ name: 'explore', appId: v.appId, sel: { type: 'actor', id } });
    });
    let queued = false;
    canvas.addEventListener('pointermove', (ev) => {
      if (queued || ev.buttons || !freeCamera) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const id = inExplore(getView()) ? hit(ev) : null;
        canvas.style.cursor = id ? 'pointer' : '';
        showTip(id, ev);
      });
    });
  }

  function repaint() {
    if (ex.p === 0) phone.setScreenResolution(phone.screenRect(stage.camera, innerWidth, innerHeight).width);
    paintFromDOM(ui.root, phone.screenCanvas);
    phone.uploadScreen(stage.renderer);
  }

  // ---------- View changes ----------
  function apply(next: View, prev: View) {
    document.body.dataset.view = next.name;
    back.hidden = next.name === 'home';
    reset.hidden = legend.hidden = !inExplore(next);
    $('tip').hidden = true;

    const app = next.name === 'home' ? null : actor(next.appId)!;
    const appChanged = !!app && (prev.name === 'home' || prev.appId !== app.id);

    if (!app) ui.showHome();
    else ui.showApp(app, next.name === 'app' && prev.name === 'home');
    // Leaving explore straight to home: the tilted screen should already show the home grid.
    if (!app && inExplore(prev)) repaint();

    if (inExplore(next) && !inExplore(prev)) {
      // Coming back mid-way with another app: the platform is already in view, so swap it in the scene.
      if (ex.p > 0 && next.appId !== openId) switchApp(next.appId);
      toExplore(next.appId);
    } else if (!inExplore(next) && inExplore(prev)) toFlat();
    else if (inExplore(next) && inExplore(prev) && appChanged) switchApp(next.appId);

    if (inExplore(next)) {
      const selChanged = !inExplore(prev) || appChanged || prev.sel?.type !== next.sel?.type || prev.sel?.id !== next.sel?.id;
      if (selChanged) applySelection(next, !!next.sel);
    } else {
      stopPlayback();
      trail = [];
      network.setTrail(null);
      platform.setGlow(false);
      panel.hide();
      pendingFocus = false;
    }
  }

  onViewChange(apply);

  // Initial pose with no animation, then hand off to the router.
  applyPose(0, 0, 0);
  placeScreen();
  platform.setResolution(innerWidth, innerHeight);
  network.setResolution(innerWidth, innerHeight);
  network.labelBoost = wide() ? 1 : 1.5;
  document.body.dataset.view = 'home';
  // Repaint once web fonts are ready so the texture uses the same typeface as the HTML.
  // Pre-paint and upload the screen texture so the first Explore doesn't stall on a GPU upload.
  const warm = () => repaint();
  openNow(apps[0].id);
  network.showAllForWarmup();
  platform.prewarm(stage.renderer, stage.scene, stage.camera);
  document.fonts?.ready.then(() => { warm(); network.refreshLabels(); });
  warm();
  // Debug hook for visual tests.
  (window as any).__atlas = { net, ex, sw, get openId() { return openId; }, stage, platform, network, repaint, caseOf, trail: () => ({ steps: trail.length, lit: (network as any).lit.size, hot: (network as any).hot.length }) };
  startRouter(isApp); // fires apply() for a deep-linked view

  $('loading').remove();
}

boot().catch((err) => {
  console.error(err);
  $('loading').textContent = 'Could not load the atlas.';
});
