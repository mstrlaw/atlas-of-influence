import './ui/styles.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { loadAtlas } from './data/loader';
import { Stage } from './scene/stage';
import { Phone, PHONE, SCREEN_PX } from './scene/phone';
import { PlatformView } from './scene/platform';
import { NetworkView } from './scene/network';
import { layoutNetwork, type NetworkLayout } from './scene/layout';
import { paintFromDOM } from './scene/domPainter';
import { ScreenUI } from './ui/screen';
import { getView, go, onViewChange, startRouter, type View } from './state/store';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
type Pose = { p: THREE.Vector3Tuple; r: THREE.Vector3Tuple };
type Cam = { pos: THREE.Vector3; target: THREE.Vector3 };

async function boot() {
  const atlas = await loadAtlas();
  const stage = new Stage($('stage'));
  const phone = new Phone();
  const platform = new PlatformView(phone);
  stage.scene.add(phone.group);
  platform.addTo(stage.scene);

  // The network lives in the platform's frame (platform at origin, its front facing the phone).
  // Room for every line: data links (×2 channels), one website link per entity, gateway → platform lines.
  const network = new NetworkView(atlas.links.length * 2 + atlas.entities.length + 8);
  platform.group.add(network.root);
  const layouts = new Map<string, NetworkLayout>();
  // Wide screens: the network fans out behind and to the right (where the camera's sideways move reveals it);
  // tall screens: behind and upward. Cached per app and orientation.
  const layoutOf = (appId: string) => {
    const tall = stage.aspect < 0.85;
    const key = `${appId}|${tall ? 'tall' : 'wide'}`;
    if (!layouts.has(key)) layouts.set(key, layoutNetwork(atlas, appId, tall ? { x: 20, y: 230, kx: 0.09, ky: 0.02 } : { x: 190, y: 50 }));
    return layouts.get(key)!;
  };
  let net = layoutOf(atlas.phoneApps[0].id);
  network.build(net);

  const ui = new ScreenUI(atlas, (id) => go({ name: 'app', appId: id }));

  // The flat HTML screen sits exactly on the 3D screen rect while the phone faces the camera.
  function placeScreen() {
    const r = phone.screenRect(stage.camera, innerWidth, innerHeight);
    ui.root.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / SCREEN_PX.w})`;
  }
  const appIds = atlas.phoneApps.map((a) => a.id);
  const isApp = (id: string) => appIds.includes(id);

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
  // Camera: back, a bit right and a touch up (wide screens); back and a bit up (tall screens, network above).
  const viewDir = () => (stage.aspect < 0.85 ? new THREE.Vector3(0.1, 0.2, 1) : new THREE.Vector3(0.24, 0.1, 1)).normalize();
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
  /**
   * A modest move, not a fit-everything zoom-out: from the flat view, pull back ~1.7× and step a little to the
   * side, aiming slightly behind and beside the phone. The phone stays prominent and nearly front-on; the
   * platform and network appear behind it (and may run past the frame edges — orbit or zoom to see all).
   */
  function cameraFor(L: ReturnType<typeof layoutFor>): Cam {
    void L;
    const tall = stage.aspect < 0.85;
    const home = homeCamera();
    const d = home.pos.distanceTo(home.target) * (tall ? 2.4 : 2.0);
    const target = new THREE.Vector3(...L.phone.p).add(tall ? new THREE.Vector3(0.15, 0.75, -1.0) : new THREE.Vector3(0.75, 0.55, -1.0));
    return { pos: target.clone().addScaledVector(viewDir(), d), target };
  }
  function exploreSetup() {
    const L = layoutFor();
    return { L, cam: cameraFor(L) };
  }

  // ---------- Transition: one progress value drives everything ----------
  // ex.p = 0 is the flat "2D" view, 1 is explore. Every pose below is a smooth function of p,
  // so motion is continuous (no stalls between steps), reverse is the exact mirror,
  // and interrupting just retargets the same value.
  const ex = { p: 0 };
  let fromCam = homeCamera();
  let { L, cam: toCam } = exploreSetup();
  let tween: gsap.core.Tween | null = null;

  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
  const smooth = (t: number) => t * t * (3 - 2 * t);           // zero velocity at both ends
  const bump = (t: number) => Math.sin(Math.PI * t) ** 2;        // 0 → 1 → 0, zero slope at ends
  const backOut = (t: number) => { const c = 1.2; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  function applyPose(p: number) {
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
    network.update(p, stage.camera);
  }

  function takeCamera() {
    if (freeCamera) {
      // The user may have orbited: make "p = 1" mean wherever the camera is now, so nothing jumps.
      toCam = { pos: stage.camera.position.clone(), target: stage.controls.target.clone() };
    }
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
        },
      });
    };
    if (ex.p > 0) return start(); // reversing mid-way: screen is already the 3D copy

    // From flat: lay out this platform's network, fresh endpoints, then swap the HTML screen for its painted copy.
    net = layoutOf(appId);
    network.build(net);
    ({ L, cam: toCam } = exploreSetup());
    fromCam = homeCamera();
    platform.group.position.set(...L.platform);
    platform.group.rotation.y = L.platformRotY;
    network.root.rotation.set(0, 0, L.netRoll);
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
    caption.hidden = true;
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

  const inExplore = (v: View) => v.name === 'explore' || v.name === 'focus';

  stage.onTick((_, t) => {
    phone.setCrisp(ex.p < 0.004); // exact while (nearly) static, smooth once moving
    applyPose(ex.p); // camera is only driven when not free (see applyPose)
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
  const caption = $('caption');
  back.addEventListener('click', () => goBack());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') goBack();
    const v = getView();
    if (v.name === 'app' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) step(v.appId, e.key === 'ArrowRight' ? 1 : -1);
  });

  function goBack() {
    const v = getView();
    if (v.name === 'focus') go({ name: 'explore', appId: v.appId });
    else if (v.name === 'explore') go({ name: 'app', appId: v.appId });
    else if (v.name === 'app') go({ name: 'home' });
  }
  function step(appId: string, dir: number) {
    const i = appIds.indexOf(appId);
    go({ name: 'app', appId: appIds[(i + dir + appIds.length) % appIds.length] });
  }

  // Buttons inside the phone screen.
  ui.root.addEventListener('click', (ev) => {
    const act = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    const v = getView();
    if (act === 'home') go({ name: 'home' });
    if (v.name !== 'app') return;
    if (act === 'prev') step(v.appId, -1);
    if (act === 'next') step(v.appId, 1);
    if (act === 'explore') go({ name: 'explore', appId: v.appId });
  });

  // Horizontal swipe on the sheet switches apps.
  let sx = 0, sy = 0;
  $('app').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('app').addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    const v = getView();
    if (v.name === 'app' && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) step(v.appId, dx < 0 ? 1 : -1);
  });



  function repaint() {
    if (ex.p === 0) phone.setScreenResolution(phone.screenRect(stage.camera, innerWidth, innerHeight).width);
    paintFromDOM(ui.root, phone.screenCanvas);
    phone.uploadScreen(stage.renderer);
  }

  // ---------- View changes ----------
  function apply(next: View, prev: View) {
    document.body.dataset.view = next.name;
    back.hidden = next.name === 'home';
    if (!inExplore(next)) caption.hidden = true;

    const app = next.name === 'home' ? null : atlas.byId.get(next.appId)!;
    if (app && !inExplore(prev)) platform.setEntity(app);

    if (!app) ui.showHome();
    else ui.showApp(app, next.name === 'app' && prev.name === 'home');
    // Leaving explore straight to home: the tilted screen should already show the home grid.
    if (!app && inExplore(prev)) repaint();

    if (inExplore(next) && !inExplore(prev)) toExplore(next.appId);
    else if (!inExplore(next) && inExplore(prev)) toFlat();
  }

  onViewChange(apply);

  // Initial pose with no animation, then hand off to the router.
  applyPose(0);
  placeScreen();
  platform.setResolution(innerWidth, innerHeight);
  network.setResolution(innerWidth, innerHeight);
  document.body.dataset.view = 'home';
  // Repaint once web fonts are ready so the texture uses the same typeface as the HTML.
  // Pre-paint and upload the screen texture so the first Explore doesn't stall on a GPU upload.
  const warm = () => repaint();
  platform.setEntity(atlas.phoneApps[0]);
  network.showAllForWarmup();
  platform.prewarm(stage.renderer, stage.scene, stage.camera);
  document.fonts?.ready.then(() => { warm(); network.refreshLabels(); });
  warm();
  (window as any).__atlas = { get net() { return net; }, dbg: () => ({ aspect: stage.aspect, toCam, L, setup: exploreSetup() }), ex, stage, platform, repaint, canvas: phone.screenCanvas, tex: phone.screenTexture, rect: () => phone.screenRect(stage.camera, innerWidth, innerHeight) }; // debug hook for visual tests
  startRouter(isApp); // fires apply() for a deep-linked view

  $('loading').remove();
}

boot().catch((err) => {
  console.error(err);
  $('loading').textContent = 'Could not load the atlas.';
});
