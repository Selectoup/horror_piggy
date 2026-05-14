(function () {
  const TILE = 2.35;
  const WALL_HEIGHT = 2.85;
  const CAMERA_HEIGHT = 1.56;
  const ATLAS_SRC = "src/assets/world-atlas.png";
  const params = new URLSearchParams(window.location.search);
  const runtime = {
    ready: false,
    config: null,
    quality: null,
    renderer: null,
    scene: null,
    camera: null,
    clock: null,
    materials: {},
    groups: {},
    meshes: {
      doors: new Map(),
      props: [],
      objects: new Map(),
      weapons: new Map(),
      characters: new Map(),
      blood: []
    },
    heldWeapon: null,
    shotLine: null,
    muzzleLight: null,
    lastShotUntil: 0,
    lastRenderAt: 0,
    swayingLights: [],
    assetRevision: "geometry-horror-pig-family-v2"
  };

  function init(config) {
    if (!window.THREE) return false;
    const canvas = document.querySelector("#world3d");
    if (!canvas) return false;
    runtime.quality = createQualityProfile();
    if (runtime.quality.mode === "2d") return false;

    runtime.config = config;
    runtime.scene = new THREE.Scene();
    runtime.scene.background = new THREE.Color(0x050506);
    runtime.scene.fog = new THREE.FogExp2(0x060404, 0.052);

    runtime.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 140);
    runtime.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: runtime.quality.antialias,
      alpha: false,
      powerPreference: "high-performance"
    });
    runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, runtime.quality.pixelRatio));
    runtime.renderer.setSize(window.innerWidth, window.innerHeight, false);
    runtime.renderer.shadowMap.enabled = runtime.quality.shadows;
    runtime.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding) runtime.renderer.outputEncoding = THREE.sRGBEncoding;

    runtime.clock = new THREE.Clock();
    runtime.groups.world = new THREE.Group();
    runtime.groups.dynamic = new THREE.Group();
    runtime.scene.add(runtime.groups.world, runtime.groups.dynamic);

    createFallbackMaterials();
    buildWorld();
    loadAtlasMaterials();
    attachResize();
    document.body.classList.add("has-webgl");
    runtime.ready = true;
    return true;
  }

  function createQualityProfile() {
    const forced = (params.get("quality") || params.get("perf") || "").toLowerCase();
    if (forced === "2d" || forced === "canvas") return { mode: "2d" };
    const mobile = window.matchMedia?.("(pointer: coarse)")?.matches || Math.min(window.innerWidth, window.innerHeight) < 760;
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    const saveData = Boolean(navigator.connection?.saveData);
    const autoLow = saveData || mobile || cores <= 4 || memory <= 4 || window.devicePixelRatio > 1.6;
    const mode = ["low", "medium", "high"].includes(forced) ? forced : autoLow ? "low" : "medium";
    const profiles = {
      low: { mode, pixelRatio: 1, antialias: false, shadows: false, dynamicLights: false, animatedSetDressing: false, textureSize: 256, anisotropy: 1, extraDressing: false, maxBloodDrops: 6, frameInterval: 1000 / 30 },
      medium: { mode, pixelRatio: 1.2, antialias: false, shadows: false, dynamicLights: false, animatedSetDressing: true, textureSize: 384, anisotropy: 2, extraDressing: true, maxBloodDrops: 10, frameInterval: 1000 / 45 },
      high: { mode, pixelRatio: 1.6, antialias: true, shadows: true, dynamicLights: true, animatedSetDressing: true, textureSize: 512, anisotropy: 8, extraDressing: true, maxBloodDrops: 24, frameInterval: 0 }
    };
    return profiles[mode];
  }

  function createFallbackMaterials() {
    runtime.materials.wall = standard("#4a302b", 0.18, 0.92);
    runtime.materials.door = standard("#2b1810", 0.72, 0.82);
    runtime.materials.floor = standard("#35251b", 0.78, 0.88);
    runtime.materials.basement = standard("#26302b", 0.92, 0.96);
    runtime.materials.ceiling = standard("#1a1411", 0.94, 0.94);
    runtime.materials.darkWood = standard("#2b1b12", 0.78, 0.9);
    runtime.materials.wornWood = standard("#5a3a24", 0.72, 0.88);
    runtime.materials.fabric = standard("#3f2b30", 0.86, 0.98);
    runtime.materials.metal = standard("#a7a090", 0.32, 0.52);
    runtime.materials.paper = standard("#e0c894", 0.9, 0.98);
    runtime.materials.key = standard("#f1bd48", 0.34, 0.36, "#f1bd48", 0.35);
    runtime.materials.weapon = standard("#8c765c", 0.44, 0.54);
    runtime.materials.glowGold = standard("#ffd568", 0.48, 0.42, "#ffd568", 1.3);
    runtime.materials.glowBlue = standard("#aeb8ff", 0.48, 0.42, "#aeb8ff", 0.9);
    runtime.materials.black = standard("#080606", 0.8, 0.98);
    runtime.materials.blood = standard("#4f0505", 0.08, 0.76, "#210000", 0.18);
    runtime.materials.bone = standard("#c8b99d", 0.06, 0.84);
    runtime.materials.cobweb = new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    runtime.materials.shadowMist = new THREE.MeshBasicMaterial({
      color: 0x18070a,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }

  function standard(color, metalness = 0.1, roughness = 0.8, emissive = "#000000", intensity = 0) {
    return new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      emissive,
      emissiveIntensity: intensity
    });
  }

  function loadAtlasMaterials() {
    const loader = new THREE.ImageLoader();
    loader.load(
      ATLAS_SRC,
      (image) => {
        runtime.materials.wall.map = makeTileTexture(image, 0, 0, 1.4, 1.15);
        runtime.materials.door.map = makeTileTexture(image, 1, 0, 1, 1);
        runtime.materials.floor.map = makeTileTexture(image, 0, 1, 7, 7);
        runtime.materials.basement.map = makeTileTexture(image, 1, 1, 5, 5);
        runtime.materials.wornWood.map = makeTileTexture(image, 0, 1, 1.8, 1.8);
        runtime.materials.darkWood.map = makeTileTexture(image, 1, 0, 1, 1);
        for (const material of Object.values(runtime.materials)) {
          material.needsUpdate = true;
        }
      },
      undefined,
      () => {}
    );
  }

  function makeTileTexture(image, col, row, repeatX, repeatY) {
    const source = Math.floor(Math.min(image.width, image.height) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = runtime.quality.textureSize;
    canvas.height = runtime.quality.textureSize;
    const c = canvas.getContext("2d");
    c.drawImage(image, col * source, row * source, source, source, 0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = Math.min(runtime.quality.anisotropy, runtime.renderer.capabilities.getMaxAnisotropy());
    if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function buildWorld() {
    addLights();
    addFloorsAndCeilings();
    addWallsAndDoors();
    addProps();
    addHorrorSetDressing();
    addPickups();
    addCharacters();
    addHeldWeapon();
    addAtmosphereSetDressing();
  }

  function addLights() {
    const hemi = new THREE.HemisphereLight(0x516070, 0x170807, 0.22);
    runtime.scene.add(hemi);

    const moon = new THREE.DirectionalLight(0x8fa7d8, 0.32);
    moon.position.set(-12, 18, 11);
    moon.castShadow = runtime.quality.shadows;
    moon.shadow.mapSize.set(1024, 1024);
    runtime.scene.add(moon);

    addPointLight(4.9, 2.2, 0xffd568, 1.6, 8);
    addPointLight(16.35, 2.55, 0xf0c473, 1.35, 7);
    addPointLight(4.35, 8.55, 0xf7bf5a, 1.25, 7);
    addPointLight(10.5, 5.5, 0xb96a3a, 0.72, 10);
    addPointLight(10.5, 18.5, 0x6c8f76, 0.7, 10);
    addPointLight(10.5, 11.6, 0x9b1111, 1.15, 8);
    addPointLight(16.2, 18.4, 0x7f88ff, 0.82, 7);

    runtime.muzzleLight = new THREE.PointLight(0xffc46d, 0, 8, 2);
    runtime.camera.add(runtime.muzzleLight);
    runtime.scene.add(runtime.camera);
  }

  function addPointLight(x, y, color, intensity, distance) {
    const point = toWorld(x, y, 1.9);
    let light = null;
    if (runtime.quality.dynamicLights) {
      light = new THREE.PointLight(color, intensity, distance, 1.75);
      light.position.copy(point);
      light.castShadow = false;
      runtime.scene.add(light);
    }

    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), runtime.materials.glowGold);
    flame.position.copy(point);
    runtime.scene.add(flame);
    runtime.swayingLights.push({ light, flame, base: point.clone(), phase: x * 0.7 + y * 0.31, intensity });
  }

  function addFloorsAndCeilings() {
    const width = runtime.config.world.width * TILE;
    const depth = runtime.config.world.height * TILE;
    const center = toWorld(runtime.config.world.width / 2, runtime.config.world.height / 2, 0);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), runtime.materials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, 0, center.z);
    floor.receiveShadow = true;
    runtime.groups.world.add(floor);

    const basement = new THREE.Mesh(new THREE.PlaneGeometry(width, depth * 0.43), runtime.materials.basement);
    basement.rotation.x = -Math.PI / 2;
    basement.position.set(center.x, 0.012, toWorld(0, 16.2, 0).z);
    basement.receiveShadow = true;
    runtime.groups.world.add(basement);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), runtime.materials.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(center.x, WALL_HEIGHT, center.z);
    runtime.groups.world.add(ceiling);

    for (let y = 1.5; y < runtime.config.world.height; y += 2.8) {
      const pos = toWorld(runtime.config.world.width / 2, y, WALL_HEIGHT - 0.12);
      const beam = box(width * 0.96, 0.18, 0.16, runtime.materials.darkWood, pos.x, pos.y, pos.z);
      beam.castShadow = true;
      runtime.groups.world.add(beam);
    }
  }

  function addWallsAndDoors() {
    const map = runtime.config.map;
    for (let y = 0; y < map.length; y += 1) {
      for (let x = 0; x < map[y].length; x += 1) {
        const tile = map[y][x];
        if (tile !== "#") continue;
        const pos = toWorld(x + 0.5, y + 0.5, WALL_HEIGHT / 2);
        const wall = box(TILE, WALL_HEIGHT, TILE, runtime.materials.wall, pos.x, pos.y, pos.z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        runtime.groups.world.add(wall);

        if (hasOpenNeighbor(x, y)) {
          addWallTrim(x, y);
        }
      }
    }

    for (const door of Object.values(runtime.config.world.doors)) {
      const mesh = createDoor(door);
      runtime.meshes.doors.set(door.id, mesh);
      runtime.groups.world.add(mesh);
    }
  }

  function hasOpenNeighbor(x, y) {
    const map = runtime.config.map;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    return dirs.some(([dx, dy]) => map[y + dy]?.[x + dx] && map[y + dy][x + dx] !== "#");
  }

  function addWallTrim(x, y) {
    const pos = toWorld(x + 0.5, y + 0.5, 0);
    const trimMat = runtime.materials.darkWood;
    const pieces = [
      box(TILE * 0.94, 0.08, 0.07, trimMat, pos.x, 0.38, pos.z - TILE * 0.49),
      box(TILE * 0.94, 0.08, 0.07, trimMat, pos.x, 2.44, pos.z - TILE * 0.49),
      box(TILE * 0.94, 0.08, 0.07, trimMat, pos.x, 0.38, pos.z + TILE * 0.49),
      box(TILE * 0.94, 0.08, 0.07, trimMat, pos.x, 2.44, pos.z + TILE * 0.49),
      box(0.07, 0.08, TILE * 0.94, trimMat, pos.x - TILE * 0.49, 0.38, pos.z),
      box(0.07, 0.08, TILE * 0.94, trimMat, pos.x - TILE * 0.49, 2.44, pos.z),
      box(0.07, 0.08, TILE * 0.94, trimMat, pos.x + TILE * 0.49, 0.38, pos.z),
      box(0.07, 0.08, TILE * 0.94, trimMat, pos.x + TILE * 0.49, 2.44, pos.z)
    ];
    for (const piece of pieces) runtime.groups.world.add(piece);
  }

  function createDoor(door) {
    const group = new THREE.Group();
    const pos = toWorld(door.x + 0.5, door.y + 0.5, WALL_HEIGHT / 2);
    group.position.set(pos.x, pos.y, pos.z);
    const panel = box(TILE * 0.78, WALL_HEIGHT * 0.86, 0.22, runtime.materials.door, 0, 0, 0);
    panel.castShadow = true;
    group.add(panel);
    group.add(box(TILE * 0.86, 0.08, 0.28, runtime.materials.darkWood, 0, WALL_HEIGHT * 0.28, 0));
    group.add(box(TILE * 0.86, 0.08, 0.28, runtime.materials.darkWood, 0, -WALL_HEIGHT * 0.12, 0));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), runtime.materials.key);
    knob.position.set(TILE * 0.25, 0.05, -0.15);
    knob.castShadow = true;
    group.add(knob);
    return group;
  }

  function addProps() {
    for (const prop of runtime.config.props) {
      const group = createProp(prop);
      runtime.meshes.props.push({ prop, group });
      runtime.groups.dynamic.add(group);
    }
  }

  function createProp(prop) {
    const group = new THREE.Group();
    const pos = toWorld(prop.x, prop.y, 0);
    group.position.set(pos.x, 0, pos.z);

    if (prop.kind === "bed") addBed(group, prop);
    else if (prop.kind === "fridge") addFridge(group, prop);
    else if (prop.kind === "clock") addClock(group, prop);
    else if (prop.kind === "chair") addChair(group, prop);
    else if (prop.kind === "sofa") addSofa(group, prop);
    else if (prop.kind === "table" || prop.kind === "counter") addTable(group, prop);
    else if (prop.kind === "box") addCrate(group, prop);
    else addCabinet(group, prop);

    return group;
  }

  function addBed(group, prop) {
    const w = prop.w * TILE;
    const d = prop.h * TILE;
    group.add(box(w, 0.28, d, runtime.materials.darkWood, 0, 0.22, 0));
    group.add(box(w * 0.88, 0.18, d * 0.82, runtime.materials.fabric, 0, 0.48, 0));
    group.add(box(w * 0.34, 0.14, d * 0.72, runtime.materials.paper, -w * 0.22, 0.68, 0));
    group.add(box(0.12, 1.0, d * 1.05, runtime.materials.darkWood, -w * 0.53, 0.62, 0));
    group.add(box(0.12, 0.62, d * 1.05, runtime.materials.darkWood, w * 0.53, 0.42, 0));
  }

  function addCabinet(group, prop) {
    const w = prop.w * TILE;
    const d = prop.h * TILE;
    const h = prop.kind === "shelf" || prop.kind === "wardrobe" ? 2.05 : 1.12;
    group.add(box(w, h, d, runtime.materials.darkWood, 0, h / 2, 0));
    for (let i = 0; i < 3; i += 1) {
      group.add(box(w * 0.86, 0.035, d * 0.08, runtime.materials.wornWood, 0, 0.45 + i * 0.45, -d * 0.53));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), runtime.materials.key);
      knob.position.set(w * 0.24, 0.44 + i * 0.45, -d * 0.59);
      group.add(knob);
    }
  }

  function addFridge(group, prop) {
    const w = prop.w * TILE;
    const d = prop.h * TILE;
    group.add(box(w, 2.05, d, runtime.materials.metal, 0, 1.02, 0));
    group.add(box(w * 0.82, 0.04, 0.035, runtime.materials.paper, -w * 0.08, 1.28, -d * 0.52));
    group.add(box(0.05, 0.92, 0.05, runtime.materials.darkWood, w * 0.32, 1.15, -d * 0.55));
  }

  function addTable(group, prop) {
    const w = prop.w * TILE;
    const d = prop.h * TILE;
    const topY = prop.kind === "counter" ? 0.92 : 0.76;
    group.add(box(w, 0.14, d, runtime.materials.wornWood, 0, topY, 0));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        group.add(box(0.12, topY, 0.12, runtime.materials.darkWood, sx * w * 0.38, topY * 0.5, sz * d * 0.34));
      }
    }
    if (prop.kind === "counter") {
      group.add(box(w * 0.9, 0.72, d * 0.82, runtime.materials.darkWood, 0, 0.38, 0));
    }
  }

  function addChair(group, prop) {
    const w = prop.w * TILE;
    const d = prop.h * TILE;
    group.add(box(w * 0.8, 0.12, d * 0.72, runtime.materials.wornWood, 0, 0.56, 0));
    group.add(box(w * 0.85, 1.08, 0.13, runtime.materials.darkWood, 0, 1.08, d * 0.33));
    group.add(box(w * 0.92, 0.08, 0.08, runtime.materials.wornWood, 0, 0.12, d * 0.4));
    group.add(box(w * 0.92, 0.08, 0.08, runtime.materials.wornWood, 0, 0.12, -d * 0.4));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        group.add(box(0.08, 0.52, 0.08, runtime.materials.darkWood, sx * w * 0.35, 0.28, sz * d * 0.28));
      }
    }
  }

  function addClock(group, prop) {
    const w = prop.w * TILE;
    const d = prop.h * TILE;
    group.add(box(w * 0.78, 2.15, d * 0.64, runtime.materials.darkWood, 0, 1.08, 0));
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), runtime.materials.paper);
    face.position.set(0, 1.72, -d * 0.34);
    group.add(face);
    const pendulum = box(0.055, 0.56, 0.025, runtime.materials.key, 0, 0.85, -d * 0.36);
    group.add(pendulum);
  }

  function addSofa(group, prop) {
    const w = prop.w * TILE;
    const d = prop.h * TILE;
    group.add(box(w, 0.42, d, runtime.materials.fabric, 0, 0.42, 0));
    group.add(box(w, 0.82, 0.22, runtime.materials.fabric, 0, 0.72, d * 0.45));
    group.add(box(0.24, 0.58, d, runtime.materials.fabric, -w * 0.56, 0.56, 0));
    group.add(box(0.24, 0.58, d, runtime.materials.fabric, w * 0.56, 0.56, 0));
  }

  function addCrate(group, prop) {
    const w = prop.w * TILE;
    const d = prop.h * TILE;
    group.add(box(w, 0.9, d, runtime.materials.wornWood, 0, 0.45, 0));
    group.add(box(w * 1.05, 0.07, 0.08, runtime.materials.darkWood, 0, 0.78, -d * 0.5));
    group.add(box(w * 1.05, 0.07, 0.08, runtime.materials.darkWood, 0, 0.24, -d * 0.5));
  }

  function addHorrorSetDressing() {
    const bloodSpots = [
      [5.2, 5.35, 0.72],
      [11.0, 10.6, 1.05],
      [4.2, 15.7, 0.82],
      [15.8, 15.1, 0.68],
      [17.2, 8.7, 0.9]
    ];
    for (const [x, y, scale] of bloodSpots) {
      addFloorStain(x, y, scale);
      addDraggedMarks(x + 0.15, y + 0.2, scale);
    }

    if (!runtime.quality.extraDressing) return;

    const hanging = [
      [5.4, 6.1],
      [10.5, 10.8],
      [15.7, 6.0],
      [4.4, 18.2],
      [16.8, 18.1]
    ];
    for (const [x, y] of hanging) addHangingShape(x, y);

    const webs = [
      [1.15, 1.15],
      [7.75, 1.15],
      [13.15, 1.15],
      [19.75, 5.7],
      [1.2, 13.2],
      [19.7, 18.8]
    ];
    for (const [x, y] of webs) addCobweb(x, y);

    const bones = [
      [6.6, 8.8],
      [14.8, 9.3],
      [3.6, 16.1],
      [15.9, 18.2]
    ];
    for (const [x, y] of bones) addBones(x, y);

    for (let i = 0; i < 18; i += 1) {
      const x = 1.7 + ((i * 4.37) % (runtime.config.world.width - 3.4));
      const y = 1.8 + ((i * 6.19) % (runtime.config.world.height - 3.6));
      if (runtime.config.map[Math.floor(y)]?.[Math.floor(x)] !== ".") continue;
      addMistPool(x, y, 0.7 + (i % 4) * 0.16);
    }
  }

  function addFloorStain(x, y, scale) {
    const p = toWorld(x, y, 0.025);
    const stain = new THREE.Mesh(new THREE.CircleGeometry(scale, 18), runtime.materials.blood);
    stain.rotation.x = -Math.PI / 2;
    stain.scale.set(1.35, 0.48, 1);
    stain.position.set(p.x, p.y, p.z);
    stain.rotation.z = x * 0.7 + y;
    runtime.groups.world.add(stain);
  }

  function addDraggedMarks(x, y, scale) {
    const p = toWorld(x, y, 0.033);
    for (let i = 0; i < 4; i += 1) {
      const mark = box(scale * 0.08, 0.012, scale * (0.75 + i * 0.1), runtime.materials.blood, p.x + (i - 1.5) * scale * 0.15, p.y, p.z + i * scale * 0.12);
      mark.rotation.y = 0.35;
      runtime.groups.world.add(mark);
    }
  }

  function addHangingShape(x, y) {
    const p = toWorld(x, y, WALL_HEIGHT - 0.08);
    const group = new THREE.Group();
    group.position.set(p.x, p.y, p.z);
    const cord = box(0.025, 0.92, 0.025, runtime.materials.black, 0, -0.42, 0);
    const bundle = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.78, 9), runtime.materials.fabric);
    bundle.position.y = -0.95;
    bundle.rotation.z = 0.14;
    bundle.castShadow = true;
    group.add(cord, bundle);
    runtime.groups.world.add(group);
  }

  function addCobweb(x, y) {
    const p = toWorld(x, y, 2.28);
    const web = new THREE.Mesh(new THREE.CircleGeometry(0.58, 5), runtime.materials.cobweb);
    web.position.set(p.x, p.y, p.z);
    web.rotation.set(0.3, x < runtime.config.world.width / 2 ? Math.PI / 2 : -Math.PI / 2, 0.2);
    runtime.groups.world.add(web);
  }

  function addBones(x, y) {
    const p = toWorld(x, y, 0.08);
    for (let i = 0; i < 3; i += 1) {
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.54 + i * 0.08, 10), runtime.materials.bone);
      bone.position.set(p.x + (i - 1) * 0.18, p.y + 0.03, p.z + i * 0.12);
      bone.rotation.set(Math.PI / 2, 0.3 + i * 0.42, 0.1);
      bone.castShadow = true;
      runtime.groups.world.add(bone);
    }
  }

  function addMistPool(x, y, scale) {
    const p = toWorld(x, y, 0.08);
    const mist = new THREE.Mesh(new THREE.CircleGeometry(scale, 16), runtime.materials.shadowMist.clone());
    mist.rotation.x = -Math.PI / 2;
    mist.position.set(p.x, p.y, p.z);
    mist.userData.phase = x * 0.4 + y * 0.8;
    runtime.groups.world.add(mist);
  }

  function addPickups() {
    for (const obj of runtime.config.objects) {
      const group = obj.type === "key" ? createKey() : createClue(obj);
      runtime.meshes.objects.set(obj.id, group);
      runtime.groups.dynamic.add(group);
    }
    for (const weapon of runtime.config.weaponPickups) {
      const group = createWorldWeapon(weapon);
      runtime.meshes.weapons.set(weapon.id, group);
      runtime.groups.dynamic.add(group);
    }
  }

  function createClue(obj) {
    const group = new THREE.Group();
    const pos = toWorld(obj.x, obj.y, 0.78);
    group.position.copy(pos);
    const paper = box(0.55, 0.035, 0.38, runtime.materials.paper, 0, 0, 0);
    paper.rotation.y = 0.5;
    group.add(paper);
    if (runtime.quality.dynamicLights) {
      const light = new THREE.PointLight(0xffd568, 0.8, 2.8, 2);
      group.add(light);
    }
    return group;
  }

  function createKey() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.028, 10, 28), runtime.materials.key);
    ring.rotation.x = Math.PI / 2;
    const shaft = box(0.34, 0.045, 0.045, runtime.materials.key, 0.22, 0, 0);
    const tooth = box(0.07, 0.12, 0.045, runtime.materials.key, 0.38, -0.035, 0);
    group.add(ring, shaft, tooth);
    if (runtime.quality.dynamicLights) group.add(new THREE.PointLight(0xffc451, 1.2, 3, 2));
    return group;
  }

  function createWorldWeapon(weapon) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(weapon.color),
      metalness: 0.56,
      roughness: 0.46,
      emissive: new THREE.Color(weapon.flash),
      emissiveIntensity: 0.08
    });
    buildGunModel(group, weapon, mat, 0.62);
    if (runtime.quality.dynamicLights) {
      const glow = new THREE.PointLight(weapon.flash, 0.65, 2.6, 2);
      group.add(glow);
    }
    return group;
  }

  function buildGunModel(group, weapon, metalMat, scale = 1) {
    const railY = 0.03 * scale;
    const isPistol = weapon.id === "pistol";
    if (isPistol) {
      group.add(box(0.24 * scale, 0.16 * scale, 0.46 * scale, metalMat, 0, railY, -0.46 * scale));
      group.add(gunBarrel(0.045 * scale, 0.54 * scale, metalMat, 0, railY + 0.01 * scale, -0.94 * scale));
      group.add(gunBarrel(0.057 * scale, 0.045 * scale, runtime.materials.black, 0, railY + 0.01 * scale, -1.23 * scale));
      const grip = box(0.17 * scale, 0.42 * scale, 0.16 * scale, runtime.materials.darkWood, 0, -0.23 * scale, -0.24 * scale);
      grip.rotation.x = -0.22;
      group.add(grip);
      group.add(box(0.08 * scale, 0.035 * scale, 0.08 * scale, runtime.materials.black, 0, railY + 0.11 * scale, -0.72 * scale));
      return;
    }

    const receiverLength = 0.44 * scale;
    const barrelLength = weapon.id === "shotgun" ? 0.86 * scale : 1.05 * scale;
    group.add(box(0.26 * scale, 0.16 * scale, receiverLength, metalMat, 0, railY, -0.38 * scale));
    group.add(box(0.28 * scale, 0.18 * scale, 0.48 * scale, runtime.materials.darkWood, 0, railY - 0.01 * scale, 0.08 * scale));
    group.add(gunBarrel(0.045 * scale, barrelLength, metalMat, 0, railY + 0.01 * scale, -0.96 * scale));
    if (weapon.id === "shotgun") {
      group.add(gunBarrel(0.038 * scale, barrelLength * 0.86, metalMat, 0, railY - 0.075 * scale, -0.9 * scale));
    }
    group.add(box(0.24 * scale, 0.09 * scale, 0.46 * scale, runtime.materials.wornWood, 0, railY - 0.09 * scale, -0.76 * scale));
    group.add(gunBarrel(0.058 * scale, 0.05 * scale, runtime.materials.black, 0, railY + 0.01 * scale, -1.42 * scale));
  }

  function gunBarrel(radius, length, material, x, y, z) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 18), material);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(x, y, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    return barrel;
  }

  function addCharacters() {
    for (const character of runtime.config.characters) {
      const group = createCharacter(character);
      runtime.meshes.characters.set(character.id, group);
      runtime.groups.dynamic.add(group);
    }
  }

  function createCharacter(character) {
    const group = new THREE.Group();
    const pig = pigProfile(character);
    addCharacterDepthModel(group, pig);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(pig.cardWidth * 0.36, 24), runtime.materials.shadowMist);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.015, 0.05);
    shadow.scale.set(1.4, 0.55, 1);
    group.add(shadow);
    if (runtime.quality.dynamicLights) {
      const aura = new THREE.PointLight(pig.light, 2.45, 6.8, 2);
      aura.position.set(0, 1.3, 0.35);
      group.add(aura);
      const faceLight = new THREE.PointLight(0xffd7d7, 1.15, 3.2, 2);
      faceLight.position.set(0, 1.55, 0.9);
      group.add(faceLight);
    }
    return group;
  }

  function cartoonMaterial(color, emissive = color, intensity = 0.22) {
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.02,
      roughness: 0.44,
      emissive,
      emissiveIntensity: intensity
    });
    material.toneMapped = false;
    return material;
  }

  function addCharacterDepthModel(group, pig) {
    const skin = cartoonMaterial(pig.skin, pig.skin, 0.18);
    const cloth = cartoonMaterial(pig.dress, pig.dress, 0.12);
    const black = cartoonMaterial("#090707", "#000000", 0);
    const outline = cartoonMaterial("#5b2542", "#18030a", 0.02);
    const cheekMat = cartoonMaterial(pig.cheek, pig.cheek, 0.18);
    const blood = new THREE.MeshStandardMaterial({
      color: 0x7b0000,
      metalness: 0.02,
      roughness: 0.28,
      emissive: 0x240000,
      emissiveIntensity: 0.38
    });
    blood.toneMapped = false;
    const eyeGlow = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const detailZ = 0.72;
    const body = new THREE.Mesh(new THREE.SphereGeometry(pig.radius * 1.48, 48, 28), cloth);
    body.scale.set(pig.bodyRound ? 1.18 : 0.98, pig.bodyRound ? 1.2 : 1.42, 0.62);
    body.position.set(0, pig.child ? 0.68 : 0.82, 0.02);
    body.castShadow = true;
    group.add(body);

    const bodyOutline = new THREE.Mesh(new THREE.SphereGeometry(pig.radius * 1.51, 48, 22), outline);
    bodyOutline.scale.set((pig.bodyRound ? 1.18 : 0.98) * 1.03, (pig.bodyRound ? 1.2 : 1.42) * 1.035, 0.64);
    bodyOutline.position.set(0, pig.child ? 0.68 : 0.82, -0.035);
    bodyOutline.renderOrder = -1;
    group.add(bodyOutline);

    const headY = pig.child ? 1.24 : 1.56;
    const backHead = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 1.03, 56, 26), outline);
    backHead.scale.set(pig.headScaleX * 1.2, pig.headScaleY * 1.1, 0.68);
    backHead.position.set(0, headY, 0.08);
    backHead.renderOrder = -1;
    group.add(backHead);

    const head = new THREE.Mesh(new THREE.SphereGeometry(pig.head, 56, 32), skin);
    head.scale.set(pig.headScaleX * 1.16, pig.headScaleY * 1.06, 0.64);
    head.position.set(0, headY, 0.15);
    head.castShadow = true;
    group.add(head);

    const snoutOutline = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.355, 38, 18), outline);
    snoutOutline.scale.set(2.52, 0.76, 0.62);
    snoutOutline.position.set(-pig.head * 1.04, headY - pig.head * 0.02, 0.205);
    group.add(snoutOutline);

    const snout = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.34, 38, 20), skin);
    snout.scale.set(2.42, 0.7, 0.58);
    snout.position.set(-pig.head * 1.02, headY - pig.head * 0.02, 0.24);
    snout.castShadow = true;
    group.add(snout);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.065, 18, 12), eyeGlow);
      eye.scale.set(1.08, 1.02, 0.34);
      eye.position.set(side * pig.head * 0.19, headY + pig.head * 0.11, detailZ);
      eye.renderOrder = 12;
      group.add(eye);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.025, 10, 8), black);
      pupil.scale.set(1, 1, 0.3);
      pupil.position.set(side * pig.head * 0.19 + pig.head * 0.011, headY + pig.head * 0.108, detailZ + 0.02);
      pupil.renderOrder = 14;
      group.add(pupil);

      const tear = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.022, 10, 7), blood);
      tear.scale.set(0.72, 2.2, 0.24);
      tear.position.set(side * pig.head * 0.215, headY + pig.head * 0.005, detailZ + 0.025);
      tear.renderOrder = 14;
      group.add(tear);

      const socket = new THREE.Mesh(new THREE.TorusGeometry(pig.head * 0.09, pig.head * 0.011, 8, 24), black);
      socket.position.set(side * pig.head * 0.19, headY + pig.head * 0.11, detailZ - 0.012);
      socket.renderOrder = 11;
      group.add(socket);
    }

    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.026, 10, 8), black);
      nostril.scale.set(1, 0.72, 0.4);
      nostril.position.set(-pig.head * (1.07 + side * 0.14), headY - pig.head * 0.01, detailZ - 0.02);
      nostril.renderOrder = 12;
      group.add(nostril);
    }

    addBloodDetails(group, pig, blood, headY, detailZ);
    addFaceCuts(group, pig, black, headY, detailZ);
    addSmileAndCheek(group, pig, black, cheekMat, headY, detailZ);

    for (const side of [-1, 1]) {
      const earOutline = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.192, 24, 12), outline);
      earOutline.scale.set(0.66, 1.76, 0.5);
      earOutline.position.set(side * pig.head * 0.38, headY + pig.head * 0.76, 0.18);
      earOutline.rotation.z = -side * 0.2;
      group.add(earOutline);

      const ear = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.18, 24, 14), skin);
      ear.scale.set(0.62, 1.68, 0.46);
      ear.position.set(side * pig.head * 0.38, headY + pig.head * 0.76, 0.22);
      ear.rotation.z = -side * 0.2;
      ear.castShadow = true;
      group.add(ear);

      const innerEar = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.11, 18, 10), cheekMat);
      innerEar.scale.set(0.52, 1.25, 0.18);
      innerEar.position.set(side * pig.head * 0.38, headY + pig.head * 0.76, 0.5);
      innerEar.rotation.z = -side * 0.2;
      innerEar.renderOrder = 12;
      group.add(innerEar);
    }

    addLimb(group, -pig.radius * 0.94, pig.child ? 0.7 : 0.86, 0.1, -pig.radius * 1.44, pig.child ? 0.48 : 0.62, 0.24, pig.head * 0.035, skin);
    addLimb(group, pig.radius * 0.94, pig.child ? 0.7 : 0.86, 0.1, pig.radius * 1.44, pig.child ? 0.48 : 0.62, 0.24, pig.head * 0.035, skin);
    addHoofHand(group, -pig.radius * 1.47, pig.child ? 0.46 : 0.6, 0.25, pig, skin);
    addHoofHand(group, pig.radius * 1.47, pig.child ? 0.46 : 0.6, 0.25, pig, skin);
    for (const side of [-1, 1]) {
      addLimb(group, side * pig.radius * 0.36, 0.16, 0.08, side * pig.radius * 0.36, 0.02, 0.08, pig.head * 0.04, skin);
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.09, 16, 10), black);
      shoe.scale.set(2.05, 0.54, 0.92);
      shoe.position.set(side * pig.radius * 0.42, 0.035, 0.22);
      group.add(shoe);
    }
    addCurlyTail(group, pig, skin);
    addClothingDetails(group, pig, black);
    addCharacterAccessory(group, pig, black, headY);

    if (pig.glasses) {
      const glass = cartoonMaterial("#111111", "#000000", 0);
      for (const side of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(pig.head * 0.13, pig.head * 0.018, 8, 32), glass);
        ring.position.set(side * pig.head * 0.19, headY + pig.head * 0.12, detailZ + 0.018);
        ring.renderOrder = 13;
        group.add(ring);
      }
      const bridge = box(pig.head * 0.3, pig.head * 0.024, pig.head * 0.024, glass, 0, headY + pig.head * 0.12, detailZ + 0.018);
      bridge.renderOrder = 13;
      group.add(bridge);
    }

    if (pig.lashes) {
      for (const side of [-1, 1]) {
        for (let i = -1; i <= 1; i += 1) {
          const lash = box(pig.head * 0.008, pig.head * 0.095, pig.head * 0.008, black, side * pig.head * (0.18 + i * 0.012), headY + pig.head * 0.22, detailZ + 0.012);
          lash.rotation.z = side * (0.3 + i * 0.12);
          lash.renderOrder = 13;
          group.add(lash);
        }
      }
    }

    if (pig.beard) {
      const beardMat = cartoonMaterial("#7c5860", "#2b1218", 0.04);
      for (let i = 0; i < 28; i += 1) {
        const angle = i * 1.31;
        const spot = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.015, 8, 6), beardMat);
        spot.scale.set(1, 1, 0.24);
        spot.position.set(Math.cos(angle) * pig.head * 0.36, headY - pig.head * (0.18 + Math.abs(Math.sin(angle)) * 0.16), detailZ + 0.01);
        spot.renderOrder = 12;
        group.add(spot);
      }
    }

    if (pig.assetKey === "grannyPig") {
      addWideHat(group, pig, headY);
    }

    if (pig.assetKey === "grandpaPig") {
      addSailorCap(group, pig, headY);
    }
  }

  function addWideHat(group, pig, headY) {
    const cream = cartoonMaterial("#f3ead2", "#f3ead2", 0.1);
    const bandMat = cartoonMaterial("#e64d86", "#7b1234", 0.14);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(pig.head * 0.62, pig.head * 0.62, pig.head * 0.035, 48), cream);
    brim.scale.set(1.85, 0.38, 0.72);
    brim.position.set(0.05, headY + pig.head * 0.58, 0.5);
    brim.rotation.z = -0.08;
    brim.castShadow = true;
    group.add(brim);

    const crown = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.39, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.68), cream);
    crown.scale.set(1.14, 0.72, 0.86);
    crown.position.set(0.08, headY + pig.head * 0.63, 0.48);
    crown.rotation.z = -0.08;
    crown.castShadow = true;
    group.add(crown);

    const band = new THREE.Mesh(new THREE.TorusGeometry(pig.head * 0.37, pig.head * 0.024, 8, 36), bandMat);
    band.scale.set(1.18, 0.2, 0.42);
    band.position.set(0.08, headY + pig.head * 0.58, 0.64);
    band.rotation.x = Math.PI / 2;
    band.rotation.z = -0.08;
    band.renderOrder = 14;
    group.add(band);
  }

  function addSailorCap(group, pig, headY) {
    const purple = cartoonMaterial("#453069", "#1b0d34", 0.16);
    const trim = cartoonMaterial("#f2f0df", "#f2f0df", 0.08);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.38, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), purple);
    cap.scale.set(1.42, 0.66, 0.86);
    cap.position.set(0.08, headY + pig.head * 0.63, 0.48);
    cap.rotation.z = -0.1;
    cap.castShadow = true;
    group.add(cap);

    const brim = new THREE.Mesh(new THREE.CylinderGeometry(pig.head * 0.32, pig.head * 0.36, pig.head * 0.028, 36), purple);
    brim.scale.set(1.45, 0.42, 0.42);
    brim.position.set(-pig.head * 0.08, headY + pig.head * 0.53, 0.66);
    brim.rotation.z = -0.1;
    brim.castShadow = true;
    group.add(brim);

    const badge = new THREE.Mesh(new THREE.TorusGeometry(pig.head * 0.055, pig.head * 0.008, 6, 18), trim);
    badge.scale.set(0.65, 1.15, 0.2);
    badge.position.set(0.08, headY + pig.head * 0.69, 0.82);
    badge.renderOrder = 16;
    group.add(badge);
    const stem = box(pig.head * 0.012, pig.head * 0.13, pig.head * 0.01, trim, 0.08, headY + pig.head * 0.65, 0.825);
    stem.renderOrder = 16;
    group.add(stem);
  }

  function addHoofHand(group, x, y, z, pig, material) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.055, 14, 8), material);
    hand.scale.set(0.8, 0.8, 0.36);
    hand.position.set(x, y, z);
    hand.castShadow = true;
    group.add(hand);
  }

  function addCharacterAccessory(group, pig, lineMat, headY) {
    if (pig.assetKey === "george") {
      const toyMat = cartoonMaterial("#5d3f2d", "#1c0d08", 0.04);
      const bear = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.095, 18, 10), toyMat);
      bear.scale.set(1.05, 1.2, 0.5);
      bear.position.set(pig.radius * 0.78, 0.55, 0.55);
      bear.castShadow = true;
      group.add(bear);
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.035, 10, 6), toyMat);
        ear.position.set(pig.radius * 0.78 + side * pig.head * 0.065, 0.66, 0.58);
        group.add(ear);
      }
      const toyBlood = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.026, 8, 6), runtime.materials.blood);
      toyBlood.position.set(pig.radius * 0.74, 0.58, 0.61);
      group.add(toyBlood);
      return;
    }

    if (pig.assetKey === "mummyPig") {
      const pearl = cartoonMaterial("#ffe8e6", "#ffe8e6", 0.16);
      for (let i = 0; i < 9; i += 1) {
        const a = -Math.PI * 0.78 + i * Math.PI * 0.195;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.025, 10, 8), pearl);
        bead.position.set(Math.cos(a) * pig.radius * 0.38, 1.02 + Math.sin(a) * pig.radius * 0.13, 0.62);
        bead.renderOrder = 15;
        group.add(bead);
      }
      return;
    }

    if (pig.assetKey === "daddyPig") {
      const strapMat = cartoonMaterial("#16100f", "#000000", 0);
      const tie = box(pig.radius * 0.12, pig.radius * 0.68, 0.018, strapMat, 0, 0.9, 0.62);
      tie.rotation.z = 0.04;
      tie.renderOrder = 15;
      group.add(tie);
      return;
    }

    if (pig.assetKey === "peppa") {
      const bowMat = cartoonMaterial("#991b38", "#3a020d", 0.16);
      for (const side of [-1, 1]) {
        const bow = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.075, 14, 8), bowMat);
        bow.scale.set(1.3, 0.82, 0.28);
        bow.position.set(side * pig.head * 0.12, headY + pig.head * 0.72, 0.72);
        bow.rotation.z = side * 0.55;
        bow.renderOrder = 16;
        group.add(bow);
      }
      const knot = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.034, 10, 8), lineMat);
      knot.position.set(0, headY + pig.head * 0.72, 0.75);
      knot.renderOrder = 17;
      group.add(knot);
    }
  }

  function addSmileAndCheek(group, pig, mouthMat, cheekMat, headY, z) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(pig.head * 0.105, 18, 10), cheekMat);
    cheek.scale.set(1.15, 1, 0.22);
    cheek.position.set(pig.head * 0.42, headY - pig.head * 0.05, z + 0.028);
    cheek.renderOrder = 13;
    group.add(cheek);

    const smile = new THREE.Mesh(new THREE.TorusGeometry(pig.head * 0.16, pig.head * 0.012, 8, 28, Math.PI * 0.84), mouthMat);
    smile.position.set(-pig.head * 0.08, headY - pig.head * 0.24, z + 0.036);
    smile.rotation.z = Math.PI * 1.06;
    smile.renderOrder = 13;
    group.add(smile);

    const mouthShadow = new THREE.Mesh(new THREE.TorusGeometry(pig.head * 0.2, pig.head * 0.009, 6, 30, Math.PI * 0.64), mouthMat);
    mouthShadow.position.set(pig.head * 0.04, headY - pig.head * 0.31, z + 0.03);
    mouthShadow.rotation.z = Math.PI * 1.18;
    mouthShadow.renderOrder = 13;
    group.add(mouthShadow);
  }

  function addCurlyTail(group, pig, material) {
    const tail = new THREE.Mesh(new THREE.TorusGeometry(pig.head * 0.085, pig.head * 0.014, 8, 28, Math.PI * 1.75), material);
    tail.scale.set(1, 1, 0.34);
    tail.position.set(pig.radius * 1.15, pig.child ? 0.64 : 0.82, -0.04);
    tail.rotation.set(0.2, 0.15, -0.4);
    tail.castShadow = true;
    group.add(tail);
  }

  function addClothingDetails(group, pig, lineMat) {
    const bodyY = pig.child ? 0.68 : 0.82;
    const stainMat = runtime.materials.blood.clone();
    stainMat.transparent = true;
    stainMat.opacity = 0.72;
    stainMat.depthWrite = false;
    stainMat.toneMapped = false;
    for (let i = 0; i < 4; i += 1) {
      const slash = box(pig.radius * 0.04, pig.radius * (0.34 + i * 0.02), 0.012, stainMat, pig.radius * (-0.35 + i * 0.24), bodyY + pig.radius * (0.15 - i * 0.08), 0.58);
      slash.rotation.z = -0.24 + i * 0.18;
      slash.renderOrder = 14;
      group.add(slash);
    }

    const collarMat = cartoonMaterial("#f1dcbf", "#f1dcbf", 0.06);
    for (const side of [-1, 1]) {
      const collar = box(pig.radius * 0.34, pig.radius * 0.06, 0.014, collarMat, side * pig.radius * 0.18, bodyY + pig.radius * 0.55, 0.61);
      collar.rotation.z = side * 0.32;
      collar.renderOrder = 15;
      group.add(collar);
    }

    for (let i = 0; i < 3; i += 1) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(pig.radius * 0.035, 12, 8), lineMat);
      button.scale.set(1, 1, 0.26);
      button.position.set(0.02, bodyY + pig.radius * (0.32 - i * 0.22), 0.625);
      button.renderOrder = 15;
      group.add(button);
    }

    const hem = new THREE.Mesh(new THREE.TorusGeometry(pig.radius * 0.48, pig.radius * 0.012, 6, 40, Math.PI), lineMat);
    hem.scale.set(1.7, 0.35, 0.35);
    hem.position.set(0, pig.child ? 0.3 : 0.36, 0.55);
    hem.rotation.z = Math.PI;
    hem.renderOrder = 13;
    group.add(hem);
  }

  function addBloodDetails(group, pig, material, headY, z) {
    const splats = [
      [-0.08, -0.04, 0.06],
      [0.06, -0.1, 0.044],
      [0.14, -0.2, 0.036],
      [-0.22, -0.18, 0.03],
      [0.0, -0.3, 0.026],
      [-0.42, 0.1, 0.038],
      [0.34, -0.02, 0.032]
    ];
    for (const [x, y, radius] of splats) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(pig.head * radius, 12, 8), material);
      drop.scale.set(1.2, 0.8 + radius * 7, 0.22);
      drop.position.set(pig.head * x, headY + pig.head * y, z + 0.026);
      drop.renderOrder = 14;
      group.add(drop);
    }
    for (let i = 0; i < 8; i += 1) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(pig.head * (0.014 + (i % 3) * 0.006), 8, 6), material);
      drop.scale.set(1, 1, 0.24);
      drop.position.set(
        pig.head * (-0.28 + i * 0.075),
        headY - pig.head * (0.06 + (i % 4) * 0.065),
        z + 0.032
      );
      drop.renderOrder = 14;
      group.add(drop);
    }

    const smear = box(pig.head * 0.045, pig.head * 0.48, pig.head * 0.014, material, pig.head * 0.32, headY - pig.head * 0.18, z + 0.045);
    smear.rotation.z = -0.12;
    smear.renderOrder = 15;
    group.add(smear);
  }

  function addFaceCuts(group, pig, material, headY, z) {
    const cuts = [
      [-0.22, 0.21, 0.22],
      [0.22, 0.18, -0.18],
      [0.12, -0.32, 0.34],
      [-0.42, -0.02, -0.42],
      [0.36, 0.02, 0.48]
    ];
    for (const [x, y, rotation] of cuts) {
      const cut = box(pig.head * 0.014, pig.head * 0.19, pig.head * 0.012, material, pig.head * x, headY + pig.head * y, z + 0.038);
      cut.rotation.z = rotation;
      cut.renderOrder = 15;
      group.add(cut);
    }
  }

  function addLimb(group, x1, y1, z1, x2, y2, z2, radius, material) {
    const start = new THREE.Vector3(x1, y1, z1);
    const end = new THREE.Vector3(x2, y2, z2);
    const delta = new THREE.Vector3().subVectors(end, start);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 12), material);
    limb.position.copy(start).add(end).multiplyScalar(0.5);
    limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    limb.castShadow = true;
    group.add(limb);
    return limb;
  }

  function pigProfile(character) {
    const profiles = {
      george: { assetKey: "george", skin: "#ff9eb0", cloth: "#2f7ee6", dress: "#2f7ee6", height: 0.86, radius: 0.25, head: 0.32, headY: 0.4, light: 0x6ca8ff, glasses: false, lashes: false, beard: false, cheek: "#ff6b86", bodyTop: 0.7, bodyBottom: 1.05, bodyDepth: 0.48, headScaleX: 1.42, headScaleY: 1.02, headDepth: 0.36, faceZ: 0.16, cardWidth: 1.06, cardHeight: 2.22, child: true, bodyRound: true },
      grandpaPig: { assetKey: "grandpaPig", skin: "#f49aaa", cloth: "#2f9b4f", dress: "#4b9760", height: 1.42, radius: 0.36, head: 0.42, headY: 0.43, light: 0xffb45c, glasses: true, lashes: false, beard: true, cheek: "#de5b70", bodyTop: 0.82, bodyBottom: 1.16, bodyDepth: 0.52, headScaleX: 1.43, headScaleY: 1.04, headDepth: 0.38, faceZ: 0.2, cardWidth: 1.43, cardHeight: 2.58, bodyRound: true },
      mummyPig: { assetKey: "mummyPig", skin: "#ff9fb2", cloth: "#f05b95", dress: "#f06a2f", height: 1.28, radius: 0.32, head: 0.38, headY: 0.42, light: 0xff77aa, glasses: false, lashes: true, beard: false, cheek: "#ef5b7a", bodyTop: 0.7, bodyBottom: 1.18, bodyDepth: 0.5, headScaleX: 1.42, headScaleY: 1.03, headDepth: 0.37, faceZ: 0.19, cardWidth: 1.43, cardHeight: 2.64 },
      daddyPig: { assetKey: "daddyPig", skin: "#f29aa8", cloth: "#35a8e0", dress: "#31a7ad", height: 1.5, radius: 0.42, head: 0.47, headY: 0.42, light: 0x66d0ff, glasses: true, lashes: false, beard: true, cheek: "#dc526b", bodyTop: 0.9, bodyBottom: 1.24, bodyDepth: 0.58, headScaleX: 1.46, headScaleY: 1.02, headDepth: 0.42, faceZ: 0.23, cardWidth: 1.68, cardHeight: 2.82, bodyRound: true },
      grannyPig: { assetKey: "grannyPig", skin: "#f8a8b4", cloth: "#f08b38", dress: "#e85b80", height: 1.33, radius: 0.34, head: 0.39, headY: 0.42, light: 0xffaa57, glasses: true, lashes: true, beard: false, cheek: "#eb6076", bodyTop: 0.76, bodyBottom: 1.14, bodyDepth: 0.5, headScaleX: 1.42, headScaleY: 1.04, headDepth: 0.37, faceZ: 0.19, cardWidth: 1.44, cardHeight: 2.81 },
      peppa: { assetKey: "peppa", skin: "#ff9fc0", cloth: "#e83945", dress: "#e83845", height: 0.96, radius: 0.27, head: 0.34, headY: 0.4, light: 0xff5c76, glasses: false, lashes: true, beard: false, cheek: "#ff5f82", bodyTop: 0.68, bodyBottom: 1.12, bodyDepth: 0.48, headScaleX: 1.43, headScaleY: 1.03, headDepth: 0.36, faceZ: 0.17, cardWidth: 1.08, cardHeight: 2.48 }
    };
    return profiles[character.kind] || profiles.peppa;
  }

  function makeBloodMaterial(opacity) {
    const material = runtime.materials.blood.clone();
    material.transparent = true;
    material.opacity = opacity;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    return material;
  }

  function spawnBloodSplatter(character, player, fatal) {
    const now = performance.now();
    const group = new THREE.Group();
    const origin = toWorld(character.x, character.y, fatal ? 0.72 : 1.16);
    const impactAngle = Math.atan2(character.y - player.y, character.x - player.x);
    const forwardX = Math.cos(impactAngle);
    const forwardZ = Math.sin(impactAngle);
    const sideX = -forwardZ;
    const sideZ = forwardX;
    const burstCount = fatal ? 24 : 14;
    group.position.copy(origin);
    group.userData.createdAt = now;
    group.userData.life = fatal ? 5.8 : 3.2;

    const poolMaterial = makeBloodMaterial(fatal ? 0.82 : 0.52);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(fatal ? 0.58 : 0.34, 22), poolMaterial);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(forwardX * 0.18, -origin.y + 0.024, forwardZ * 0.18);
    pool.scale.set(1.45, 0.75, 1);
    pool.userData.baseOpacity = poolMaterial.opacity;
    group.add(pool);

    const drops = Math.min(burstCount, runtime.quality.maxBloodDrops);
    for (let i = 0; i < drops; i += 1) {
      const size = (fatal ? 0.036 : 0.026) + Math.random() * (fatal ? 0.055 : 0.038);
      const material = makeBloodMaterial(0.72 + Math.random() * 0.24);
      const drop = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), material);
      const spread = (Math.random() - 0.5) * (fatal ? 1.1 : 0.68);
      const distance = 0.14 + Math.random() * (fatal ? 1.15 : 0.72);
      const lift = (Math.random() - 0.15) * (fatal ? 0.74 : 0.46);
      drop.position.set(
        forwardX * distance + sideX * spread,
        Math.max(-origin.y + 0.05, lift),
        forwardZ * distance + sideZ * spread
      );
      drop.userData.baseOpacity = material.opacity;
      drop.userData.drift = {
        x: forwardX * (0.002 + Math.random() * 0.004) + sideX * spread * 0.003,
        y: -0.003 - Math.random() * 0.005,
        z: forwardZ * (0.002 + Math.random() * 0.004) + sideZ * spread * 0.003
      };
      group.add(drop);
    }

    runtime.groups.dynamic.add(group);
    runtime.meshes.blood.push(group);
  }

  function updateBloodSplatter() {
    const now = performance.now();
    for (let i = runtime.meshes.blood.length - 1; i >= 0; i -= 1) {
      const group = runtime.meshes.blood[i];
      const age = (now - group.userData.createdAt) / 1000;
      const life = group.userData.life || 3;
      if (age > life) {
        runtime.groups.dynamic.remove(group);
        for (const child of group.children) {
          child.geometry?.dispose?.();
          child.material?.dispose?.();
        }
        runtime.meshes.blood.splice(i, 1);
        continue;
      }
      const fade = Math.min(1, (life - age) / Math.max(0.4, life * 0.42));
      for (const child of group.children) {
        if (child.userData.drift) {
          child.position.x += child.userData.drift.x;
          child.position.y = Math.max(-group.position.y + 0.025, child.position.y + child.userData.drift.y);
          child.position.z += child.userData.drift.z;
        }
        if (child.material) child.material.opacity = (child.userData.baseOpacity || 0.8) * fade;
      }
    }
  }

  function addHeldWeapon() {
    const group = new THREE.Group();
    group.position.set(0.48, -0.42, -0.72);
    runtime.camera.add(group);
    runtime.heldWeapon = group;
  }

  function rebuildHeldWeapon(weapon) {
    runtime.heldWeapon.clear();
    if (!weapon) return;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(weapon.color),
      metalness: 0.62,
      roughness: 0.34,
      emissive: new THREE.Color(weapon.flash),
      emissiveIntensity: 0.02
    });
    buildGunModel(runtime.heldWeapon, weapon, mat, 1);
  }

  function addAtmosphereSetDressing() {
    const paintingMat = standard("#6a4530", 0.2, 0.85);
    const positions = [
      [2.2, 5.95],
      [18.4, 5.95],
      [2.3, 18.2],
      [18.2, 18.2],
      [10.5, 12.4]
    ];
    for (const [x, y] of positions) {
      const p = toWorld(x, y, 1.55);
      const painting = box(0.75, 0.56, 0.04, paintingMat, p.x, p.y, p.z);
      painting.castShadow = true;
      runtime.groups.world.add(painting);
    }

    for (let i = 0; i < 34; i += 1) {
      const x = 1.5 + ((i * 5.17) % (runtime.config.world.width - 3));
      const y = 1.5 + ((i * 7.31) % (runtime.config.world.height - 3));
      if (runtime.config.map[Math.floor(y)]?.[Math.floor(x)] !== ".") continue;
      const p = toWorld(x, y, 0.018);
      const rug = new THREE.Mesh(new THREE.CircleGeometry(0.05 + (i % 5) * 0.035, 9), standard(i % 2 ? "#1b120d" : "#2d2117", 0.2, 0.96));
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(p.x, p.y, p.z);
      runtime.groups.world.add(rug);
    }
  }

  function update(payload) {
    if (!runtime.ready) return false;
    const { player, state, objects, weaponPickups, characters, doors, time } = payload;
    const elapsed = time * 0.001;

    const pos = toWorld(player.x, player.y, CAMERA_HEIGHT + Math.sin(player.bob) * 0.018);
    runtime.camera.position.set(pos.x, pos.y, pos.z);
    const look = toWorld(player.x + Math.cos(player.angle), player.y + Math.sin(player.angle), CAMERA_HEIGHT + Math.tan(player.pitch || 0));
    runtime.camera.lookAt(look.x, look.y, look.z);

    updateAtmosphere(elapsed, state);
    updateDoors(doors);
    updateObjects(objects, elapsed);
    updateWeapons(weaponPickups, elapsed);
    updateCharacters(characters, elapsed, player);
    updateBloodSplatter();
    updateHeldWeapon(state, elapsed);
    updateShotLine(state, player, elapsed);

    if (runtime.quality.frameInterval && time - runtime.lastRenderAt < runtime.quality.frameInterval) return true;
    runtime.lastRenderAt = time;
    runtime.renderer.render(runtime.scene, runtime.camera);
    return true;
  }

  function updateAtmosphere(elapsed, state) {
    const pulse = 0.86 + Math.sin(elapsed * 3.7) * 0.08 + Math.sin(elapsed * 13.1) * 0.035;
    for (const item of runtime.swayingLights) {
      const sway = Math.sin(elapsed * 1.6 + item.phase) * 0.08;
      const y = item.base.y + Math.sin(elapsed * 2.1 + item.phase) * 0.035;
      if (item.light) {
        item.light.position.set(item.base.x + sway, y, item.base.z);
        item.light.intensity = item.intensity * pulse;
        item.flame.position.copy(item.light.position);
      } else {
        item.flame.position.set(item.base.x + sway, y, item.base.z);
      }
      item.flame.scale.setScalar(runtime.quality.animatedSetDressing ? 0.85 + Math.sin(elapsed * 9 + item.phase) * 0.18 : 0.92);
    }

    if (runtime.quality.animatedSetDressing) {
      runtime.groups.world.children.forEach((child) => {
        if (!child.userData.phase || !child.material?.transparent) return;
        child.material.opacity = 0.22 + Math.sin(elapsed * 0.9 + child.userData.phase) * 0.08;
        child.rotation.z += 0.0015;
      });
    }

    runtime.scene.fog.density = 0.048 + (state.scare || 0) * 0.035;
  }

  function updateDoors(doors) {
    for (const [id, mesh] of runtime.meshes.doors.entries()) {
      mesh.visible = !doors[id]?.opened;
      if (doors[id]?.opened) mesh.rotation.y = Math.min(mesh.rotation.y + 0.05, Math.PI * 0.5);
      else mesh.rotation.y *= 0.85;
    }
  }

  function updateObjects(objects, elapsed) {
    for (const obj of objects) {
      const group = runtime.meshes.objects.get(obj.id);
      if (!group) continue;
      group.visible = !obj.hidden && !obj.collected;
      const p = toWorld(obj.x, obj.y, 0.62 + Math.sin(elapsed * 2.5 + obj.x) * 0.08);
      group.position.copy(p);
      group.rotation.y = elapsed * 0.7 + obj.x;
    }
  }

  function updateWeapons(weaponPickups, elapsed) {
    for (const weapon of weaponPickups) {
      const group = runtime.meshes.weapons.get(weapon.id);
      if (!group) continue;
      group.visible = !weapon.collected;
      const p = toWorld(weapon.x, weapon.y, 0.55 + Math.sin(elapsed * 2.4 + weapon.x) * 0.07);
      group.position.copy(p);
      group.rotation.y = elapsed * 0.9 + weapon.y;
    }
  }

  function updateCharacters(characters, elapsed, player) {
    const now = performance.now();
    const active = new Set(runtime.config.characters.filter((character) => characterIsActive(character)).map((character) => character.id));
    for (const character of characters) {
      const group = runtime.meshes.characters.get(character.id);
      if (!group) continue;
      const isDead = Boolean(character.deadUntil && now < character.deadUntil);
      const bleeding = Boolean(character.bloodSplatterUntil && now < character.bloodSplatterUntil);
      if (character.bloodSplatterUntil && group.userData.lastBloodUntil !== character.bloodSplatterUntil) {
        group.userData.lastBloodUntil = character.bloodSplatterUntil;
        spawnBloodSplatter(character, player, isDead || character.health <= 0);
      }
      group.visible = active.has(character.id) || (isDead && bleeding);
      if (!group.visible) continue;
      const p = toWorld(character.x, character.y, 0);
      group.position.set(p.x, p.y, p.z);
      const facing = -Math.atan2(player.y - character.y, player.x - character.x) + Math.PI / 2;
      group.rotation.set(0, facing, 0);
      const stunned = !isDead && character.stunUntil && now < character.stunUntil;
      if (isDead) {
        const fall = Math.min(1, 1 - Math.max(0, character.bloodSplatterUntil - now) / 1600);
        group.rotation.x = -0.32 - fall * Math.PI * 0.42;
        group.position.y = 0.08;
        group.scale.set(1.05, 0.9, 1.05);
      } else {
        group.position.y = stunned ? Math.sin(elapsed * 22) * 0.04 : 0;
        group.scale.setScalar(stunned ? 0.96 + Math.sin(elapsed * 28) * 0.025 : 1);
      }
    }
  }

  function characterIsActive(character) {
    if (character.deadUntil && performance.now() < character.deadUntil) return false;
    const state = runtime.config.state;
    const rule = (runtime.config.difficultySettings?.[state.difficulty] || {}).active?.[character.id] || "start";
    if (rule === "start") return true;
    if (rule === "clue1") return state.clues.size >= 1 || state.hasKey;
    if (rule === "clue2") return state.clues.size >= 2 || state.hasKey;
    if (rule === "clue3") return state.clues.size >= 3 || state.hasKey;
    if (rule === "basement") return runtime.config.world.doors.basement.opened || state.hasKey;
    if (rule === "key") return state.hasKey;
    return state.clues.size >= character.huntClues || state.hasKey;
  }

  function updateHeldWeapon(state, elapsed) {
    const active = state.activeWeapon ? runtime.config.weapons[state.activeWeapon] : null;
    if (runtime.heldWeapon.userData.weaponId !== active?.id) {
      runtime.heldWeapon.userData.weaponId = active?.id || null;
      rebuildHeldWeapon(active);
    }
    runtime.heldWeapon.visible = Boolean(active);
    if (!active) {
      runtime.muzzleLight.intensity = 0;
      return;
    }
    const kick = state.gunKick || 0;
    runtime.heldWeapon.position.set(0.48 + kick * 0.04, -0.42 - kick * 0.025 + Math.sin(elapsed * 3) * 0.006, -0.72 + kick * 0.11);
    runtime.heldWeapon.rotation.set(-0.04 - kick * 0.18, -0.1, 0.035);
    runtime.muzzleLight.position.set(0.48, -0.31, -1.78);
    runtime.muzzleLight.intensity = (state.gunFlash || 0) * 7;
  }

  function updateShotLine(state, player, elapsed) {
    if (!state.shotLine || performance.now() > state.shotLine.until) {
      if (runtime.shotLine) runtime.shotLine.visible = false;
      return;
    }
    if (!runtime.shotLine) {
      const material = new THREE.LineBasicMaterial({
        color: 0xffdf9d,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending
      });
      runtime.shotLine = new THREE.Line(new THREE.BufferGeometry(), material);
      runtime.scene.add(runtime.shotLine);
    }
    const start = toWorld(player.x + Math.cos(player.angle) * 0.35, player.y + Math.sin(player.angle) * 0.35, CAMERA_HEIGHT - 0.18);
    const end = state.shotLine.x
      ? toWorld(state.shotLine.x, state.shotLine.y, 1.15)
      : toWorld(player.x + Math.cos(player.angle) * 7, player.y + Math.sin(player.angle) * 7, 1.15);
    runtime.shotLine.geometry.setFromPoints([start, end]);
    runtime.shotLine.material.opacity = Math.max(0, (state.shotLine.until - performance.now()) / 140);
    runtime.shotLine.visible = true;
  }

  function box(w, h, d, material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = runtime.quality.shadows;
    mesh.receiveShadow = runtime.quality.shadows;
    return mesh;
  }

  function toWorld(x, y, height = 0) {
    return new THREE.Vector3((x - runtime.config.world.width / 2) * TILE, height, (y - runtime.config.world.height / 2) * TILE);
  }

  function attachResize() {
    window.addEventListener("resize", () => {
      if (!runtime.renderer || !runtime.camera) return;
      runtime.camera.aspect = window.innerWidth / window.innerHeight;
      runtime.camera.updateProjectionMatrix();
      runtime.renderer.setSize(window.innerWidth, window.innerHeight, false);
    });
  }

  window.World3D = {
    init,
    update,
    isReady: () => runtime.ready
  };
})();
