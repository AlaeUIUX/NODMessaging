// @ts-nocheck
/**
 * The one genuine 3D moment in the prototype: a liquid-glass metaball blob,
 * rendered with MarchingCubes and a real reflective environment.
 *
 * Deliberately scoped to the Mind empty state — a low-frequency, low-stakes
 * screen where nothing else is competing for attention or frame budget.
 * Everything else in the app uses the far cheaper CSS/SVG techniques.
 *
 * Cost control:
 *  - three is only pulled in when this module is dynamically imported, so it
 *    never lands in the initial bundle.
 *  - rendering pauses when the canvas scrolls out of view (IntersectionObserver)
 *    and when the tab is backgrounded (visibilitychange).
 *  - prefers-reduced-motion renders a single static frame — the material is
 *    still there, the motion isn't.
 */
export async function mountLiquidOrb(container: HTMLElement, size = 132) {
  const THREE = await import("three");
  const { MarchingCubes } = await import("three/examples/jsm/objects/MarchingCubes.js");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.width = `${size}px`;
  renderer.domElement.style.height = `${size}px`;
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
  camera.position.set(0, 0, 2.55);

  // Procedural environment: a warm-to-cool vertical gradient used as an
  // equirect reflection map. Gives real specular highlights that travel across
  // the surface as it deforms — the "depth via light" the brief asks for —
  // without shipping an HDRI or pulling in RoomEnvironment.
  const envCanvas = document.createElement("canvas");
  envCanvas.width = 32;
  envCanvas.height = 128;
  const ictx = envCanvas.getContext("2d");
  const grad = ictx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, "#ffffff");
  grad.addColorStop(0.3, "#e8eefb");
  grad.addColorStop(0.58, "#b9ccee");
  grad.addColorStop(1.0, "#53637f");
  ictx.fillStyle = grad;
  ictx.fillRect(0, 0, 32, 128);
  // A blown-out band standing in for a window: without a bright, *narrow*
  // source there is no specular streak, and the surface reads as matte plastic
  // rather than glass.
  const band = ictx.createLinearGradient(0, 14, 0, 40);
  band.addColorStop(0, "rgba(255,255,255,0)");
  band.addColorStop(0.5, "#ffffff");
  band.addColorStop(1, "rgba(255,255,255,0)");
  ictx.fillStyle = band;
  ictx.fillRect(0, 14, 32, 26);
  const envTex = new THREE.CanvasTexture(envCanvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf2f7ff,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0.75,
    iridescenceIOR: 1.4,
    envMap: envTex,
    envMapIntensity: 2.2,
    specularIntensity: 1,
    // Real refraction, not just reflection — this is what separates the moment
    // from a CSS gradient. It needs something *behind* the blob to bend, hence
    // the backing disc below.
    transmission: 0.55,
    thickness: 1.8,
    ior: 1.48,
  });

  // Backing disc: the thing the glass refracts. A soft coloured gradient reads
  // as light behind frosted glass and makes the distortion legible.
  const discCanvas = document.createElement("canvas");
  discCanvas.width = discCanvas.height = 128;
  const dctx = discCanvas.getContext("2d");
  // No white core on purpose (a bright backing + transmission clips the blob to
  // flat white and destroys the specular form); no hard edge either, or the
  // disc reads as a solid badge behind the blob instead of light behind glass.
  const dg = dctx.createRadialGradient(64, 54, 4, 64, 64, 64);
  dg.addColorStop(0, "#8fb0e8");
  dg.addColorStop(0.35, "#6f93d8");
  dg.addColorStop(0.62, "rgba(79,111,174,.45)");
  dg.addColorStop(1, "rgba(79,111,174,0)");
  dctx.fillStyle = dg;
  dctx.fillRect(0, 0, 128, 128);
  const discTex = new THREE.CanvasTexture(discCanvas);
  discTex.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 3.1),
    new THREE.MeshBasicMaterial({ map: discTex, transparent: true, opacity: 0.5 }),
  );
  disc.position.set(0, 0, -1.15);
  scene.add(disc);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(1.4, 1.8, 1.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ab6ff, 1.2);
  rim.position.set(-1.6, -0.8, -1.2);
  scene.add(rim);

  const effect = new MarchingCubes(40, material, true, false, 60000);
  effect.scale.set(1, 1, 1);
  // Lower isolation = the implicit surface sits further out from each centre,
  // so neighbouring balls fuse instead of reading as separate spheres. This is
  // the whole point of using metaballs here rather than a few meshes.
  effect.isolation = 28;
  scene.add(effect);

  const BLOBS = 4;
  function fill(t: number) {
    effect.reset();
    const subtract = 10;
    const strength = 0.72;
    for (let i = 0; i < BLOBS; i++) {
      const o = i * (Math.PI * 2 / BLOBS);
      // Kept tight around the centre so the mass stays cohesive and centred
      // while still visibly churning.
      const x = 0.5 + 0.13 * Math.sin(t * 0.7 + o);
      const y = 0.5 + 0.13 * Math.cos(t * 0.58 + o * 1.25);
      const z = 0.5 + 0.11 * Math.sin(t * 0.47 + o * 0.8);
      effect.addBall(x, y, z, strength, subtract);
    }
    effect.update();
  }

  let raf = 0;
  let running = false;
  let visible = true;
  const start = performance.now();

  const frame = () => {
    const t = (performance.now() - start) / 1000;
    fill(t);
    effect.rotation.y = t * 0.22;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };

  const play = () => {
    if (running || reduced || !visible || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(frame);
  };
  const pause = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? play() : pause();
  }, { threshold: 0.05 });
  io.observe(renderer.domElement);

  const onVisibility = () => (document.hidden ? pause() : play());
  document.addEventListener("visibilitychange", onVisibility);

  // Always paint at least one frame so the material is visible even when
  // paused or when motion is reduced.
  fill(0);
  renderer.render(scene, camera);
  play();

  return function dispose() {
    pause();
    io.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    scene.remove(effect);
    scene.remove(disc);
    effect.material.dispose();
    if (effect.geometry) effect.geometry.dispose();
    disc.geometry.dispose();
    disc.material.dispose();
    discTex.dispose();
    envTex.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
