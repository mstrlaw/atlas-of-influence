import './ui/styles.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { actor, apps, caseOf, graphFor, isApp, kindLabel, trailForActor, trailForCase, trailForNarrative, trailForOwner } from './data/model';
import type { Selection, TrailStep } from './data/types';
import { Stage } from './scene/stage';
import { Phone, PHONE, SCREEN_PX } from './scene/phone';
import { PlatformView } from './scene/platform';
import { NetworkView } from './scene/network';
import { layoutNetwork, type NetworkLayout } from './scene/layout';
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

  // The network lives in the platform's frame (platform at origin, its front facing the phone).
  const network = new NetworkView(480);
  platform.group.add(network.root);
  const layouts = new Map<string, NetworkLayout>();
  // Wide screens: the network fans out behind and to the right (where the camera's sideways move reveals it);
  // tall screens: behind and upward. Cached per app and orientation.
  const layoutOf = (appId: string) => {
    const tall = stage.aspect < 0.85;
    const key = `${appId}|${tall ? 'tall' : 'wide'}`;
    if (!layouts.has(key)) layouts.set(key, layoutNetwork(graphFor(appId), tall ? { x: 20, y: 230, kx: 0.09, ky: 0.02 } : { x: 190, y: 50 }));
    return layouts.get(key)!;
  };
  let net = layoutOf(apps[0].id);
  network.build(net);

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

  // Explore: subtle. The phone stays put and keeps (almost) facing the viewer; the camera eases back and a
  // little to the right, so the platform and network — stacked in depth directly behind the phone — peek out
  // from behind it, still partly hidden by it.
  const PHONE_TURN = 0.08;                                    // tiny turn toward the camera
  function layoutFor() {
    const phonePos = new THREE.Vector3(0, 0, 0);
    const phone: Pose = { p: phonePos.toArray() as THREE.Vector3Tuple, r: [0, PHONE_TURN, 0] };
    const back = new THREE.Vector3(-Math.sin(PHONE_TURN), 0, -Math.cos(PHONE_TURN)); // phone's back, into the scene
    // Same height as the phone, straight along its back axis: the feeding algorithm lines up with the phone.
    const platform = phonePos.clone().addScaledVector(back, 3.2);
    const toPhone = phonePos.clone().sub(platform);
    const platformRotY = Math.atan2(toPhone.x, toPhone.z); // platform front (+z) faces the phone
    const netRoll = 0;
    return { phone, platform: platform.toArray() as THREE.Vector3Tuple, platformRotY, netRoll };
  }
  /** The angle the scene is first shown from: three-quarters, from the side and above, so the pipeline from structure to the screen reads across the picture. */
  const viewDir = () => (stage.aspect < 0.85 ? new THREE.Vector3(0.5, 0.52, 0.69) : new THREE.Vector3(0.66, 0.36, 0.66)).normalize();

  /** Camera position and target that fit a set of world points into the part of the window the panel leaves free. */
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
    const d = Math.min(90, Math.max(halfH / (tanV * freeH), halfW / (tanV * stage.aspect * freeW)) + (hi.z - mid.z));
    const target = right.clone().multiplyScalar(mid.x).addScaledVector(up, mid.y).addScaledVector(dir, mid.z);
    return { pos: target.clone().addScaledVector(dir, d), target };
  }

  /** Corner points of the phone and the platform cube, so a framing never cuts them off. */
  function bodyPoints(phoneToo: boolean, platformToo: boolean): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    if (phoneToo) for (const x of [-1, 1]) for (const y of [-1, 1]) pts.push(new THREE.Vector3((x * PHONE.w) / 2, (y * PHONE.h) / 2, 0));
    if (platformToo) for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1])
      pts.push(platform.group.localToWorld(new THREE.Vector3(x * 0.95, y * 0.95, z * 0.95)));
    return pts;
  }
  /** Everything in the scene: the phone, the platform and the whole network behind it. */
  function overview(): Cam {
    const pts = bodyPoints(true, true);
    for (const n of net.nodes) { const p = network.worldPositionOf(n.id); if (p) pts.push(p); }
    return fit(pts, viewDir(), 1.06);
  }
  /** Place the platform for this layout and work out where the camera ends up. Needs `net` to be current. */
  function exploreSetup() {
    const L = layoutFor();
    platform.group.position.set(...L.platform);
    platform.group.rotation.y = L.platformRotY;
    network.root.rotation.set(0, 0, L.netRoll);
    platform.group.updateMatrixWorld(true);
    return { L, cam: overview() };
  }

  // ---------- Transition: one progress value drives everything ----------
  // ex.p = 0 is the flat "2D" view, 1 is explore. Every pose below is a smooth function of p,
  // so motion is continuous (no stalls between steps), reverse is the exact mirror,
  // and interrupting just retargets the same value.
  const ex = { p: 0 };
  /** Replays the network's reveal on its own (when switching app inside explore) without moving anything else. */
  const reveal = { p: 1, on: false };
  let fromCam = homeCamera();
  let { L, cam: toCam } = exploreSetup();
  let tween: gsap.core.Tween | null = null;

  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
  const smooth = (t: number) => t * t * (3 - 2 * t);           // zero velocity at both ends
  const bump = (t: number) => Math.sin(Math.PI * t) ** 2;        // 0 → 1 → 0, zero slope at ends
  const backOut = (t: number) => { const c = 1.2; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  function applyPose(p: number, dt: number, time: number) {
    // Phone: lifts off the page (z bump + top edge tipping back) while it travels and turns.
    const tPhone = smooth(seg(p, 0, 0.85));
    const lift = bump(seg(p, 0, 0.75)) * 0.4; // a gentle nudge, not a lift-off
    phone.group.position.set(
      lerp(HOME_POSE.p[0], L.phone.p[0], tPhone),
      lerp(HOME_POSE.p[1], L.phone.p[1], tPhone),
      lerp(HOME_POSE.p[2], L.phone.p[2], tPhone) + 0.25 * lift,
    );
    phone.group.rotation.set(
      lerp(HOME_POSE.r[0], L.phone.r[0], tPhone) - 0.14 * lift,
      lerp(HOME_POSE.r[1], L.phone.r[1], tPhone),
      lerp(HOME_POSE.r[2], L.phone.r[2], tPhone),
    );

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

    // Platform: rises, then algorithms dock one by one, then beams draw to the screen.
    platform.anim.rise = smooth(seg(p, 0.35, 0.85));
    platform.anim.dock.forEach((d, i) => (d.t = backOut(seg(p, 0.6 + i * 0.05, 0.84 + i * 0.05))));
    platform.anim.beams.forEach((b, i) => (b.t = smooth(seg(p, 0.8 + i * 0.03, 0.95 + i * 0.015))));
    // Network: revealed hop by hop from the platform.
    network.update(reveal.on ? Math.min(p, reveal.p) : p, stage.camera, dt, time);
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

    // From flat: lay out this platform's network, fresh endpoints, then swap the HTML screen for its painted copy.
    net = layoutOf(appId);
    network.build(net);
    ({ L, cam: toCam } = exploreSetup());
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

  /** Another app while already exploring: swap the network in place and replay its reveal. */
  function switchApp(appId: string) {
    net = layoutOf(appId);
    network.build(net);
    userMoved = false;
    pendingFocus = true;
    repaint();
    gsap.killTweensOf(reveal);
    reveal.on = true;
    reveal.p = 0.8;
    gsap.to(reveal, { p: 1, duration: 1.1, ease: 'power1.inOut', onComplete: () => { reveal.on = false; settled(); } });
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
    const cam = fit(points, dir, 1.12, minHalf);
    flyTo(cam.pos, cam.target, duration);
  }

  function pointsOf(steps: TrailStep[]): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (const s of steps) for (const id of s.nodes) { const p = network.worldPositionOf(id); if (p) pts.push(p); }
    pts.push(...bodyPoints(steps.some((s) => s.screen), steps.some((s) => s.platform)));
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
    const pick = (f: (s: TrailStep) => boolean) => shown.filter(f).map((s) => s.kind).sort((a, b) => (a === 'check' ? 1 : 0) - (b === 'check' ? 1 : 0))[0] ?? null;
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
    if (!freeCamera || reveal.on) { pendingFocus = true; return; }
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
    if (app && (!inExplore(prev) || appChanged)) platform.setEntity(app);

    if (!app) ui.showHome();
    else ui.showApp(app, next.name === 'app' && prev.name === 'home');
    // Leaving explore straight to home: the tilted screen should already show the home grid.
    if (!app && inExplore(prev)) repaint();

    if (inExplore(next) && !inExplore(prev)) toExplore(next.appId);
    else if (!inExplore(next) && inExplore(prev)) toFlat();
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
  document.body.dataset.view = 'home';
  // Repaint once web fonts are ready so the texture uses the same typeface as the HTML.
  // Pre-paint and upload the screen texture so the first Explore doesn't stall on a GPU upload.
  const warm = () => repaint();
  platform.setEntity(apps[0]);
  network.showAllForWarmup();
  platform.prewarm(stage.renderer, stage.scene, stage.camera);
  document.fonts?.ready.then(() => { warm(); network.refreshLabels(); });
  warm();
  // Debug hook for visual tests.
  (window as any).__atlas = { get net() { return net; }, ex, stage, platform, network, repaint, caseOf, trail: () => ({ steps: trail.length, lit: (network as any).lit.size, hot: (network as any).hot.length }) };
  startRouter(isApp); // fires apply() for a deep-linked view

  $('loading').remove();
}

boot().catch((err) => {
  console.error(err);
  $('loading').textContent = 'Could not load the atlas.';
});
