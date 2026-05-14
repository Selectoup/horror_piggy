(function () {
  const TILE = 2.35;
  const WALL_HEIGHT = 2.85;
  const CAMERA_HEIGHT = 1.56;
  const ATLAS_SRC = "src/assets/world-atlas.png";
  const CHARACTER_ASSETS = {
    george: { src: "src/assets/characters/george.png", width: 187, height: 271 },
    grandpaPig: { src: "src/assets/characters/grandpa-pig.png", width: 340, height: 553 },
    mummyPig: { src: "src/assets/characters/mummy-pig.png", width: 315, height: 520 },
    daddyPig: { src: "src/assets/characters/daddy-pig.png", width: 391, height: 562 },
    grannyPig: { src: "src/assets/characters/granny-pig.png", width: 330, height: 540 },
    peppa: { src: "src/assets/characters/peppa.png", width: 260, height: 382 },
    butcherPig: { src: "src/assets/enemy-sprite.png", width: 887, height: 1774 }
  };
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
    characterTextures: new Map(),
    assetRevision: "asset-character-cutouts-v1"
  };

  function init(config) {
    if (!window.THREE) return false;
    const canvas = document.querySelector("#world3d");
    if (!canvas) return false;
    runtime.quality = createQualityProfile();
    if (runtime.quality.mode === "2d") return false;

    runtime.config = config;
    runtime.scene = new THREE.Scene();
    runtime.scene.background = new THREE.Color(0x100c0a);
    runtime.scene.fog = new THREE.FogExp2(0x16100d, 0.03);

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
    runtime.materials.wall = standard("#65453a", 0.16, 0.88, "#120807", 0.03);
    runtime.materials.door = standard("#4a2a1c", 0.5, 0.78, "#120704", 0.04);
    runtime.materials.floor = standard("#493323", 0.62, 0.84, "#100906", 0.02);
    runtime.materials.basement = standard("#35443d", 0.76, 0.9, "#07110e", 0.03);
    runtime.materials.ceiling = standard("#29201b", 0.82, 0.9, "#090504", 0.02);
    runtime.materials.darkWood = standard("#3f2819", 0.62, 0.84, "#0d0503", 0.02);
    runtime.materials.wornWood = standard("#725033", 0.55, 0.82, "#120804", 0.02);
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
    const ambient = new THREE.AmbientLight(0x9a7562, 0.32);
    runtime.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x8ea0b3, 0x3a2018, 0.56);
    runtime.scene.add(hemi);

    const moon = new THREE.DirectionalLight(0xb6c7ff, 0.52);
    moon.position.set(-12, 18, 11);
    moon.castShadow = runtime.quality.shadows;
    moon.shadow.mapSize.set(1024, 1024);
    runtime.scene.add(moon);

    addPointLight(4.9, 2.2, 0xffd568, 2.1, 9);
    addPointLight(16.35, 2.55, 0xf0c473, 1.8, 8);
    addPointLight(4.35, 8.55, 0xf7bf5a, 1.65, 8);
    addPointLight(10.5, 5.5, 0xb96a3a, 1.05, 11);
    addPointLight(10.5, 18.5, 0x6c8f76, 1.0, 11);
    addPointLight(10.5, 11.6, 0x9b1111, 1.45, 9);
    addPointLight(16.2, 18.4, 0x7f88ff, 1.12, 8);

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
    const vertical = doorOrientation(door) === "vertical";
    const panel = box(vertical ? 0.22 : TILE * 0.78, WALL_HEIGHT * 0.86, vertical ? TILE * 0.78 : 0.22, runtime.materials.door, 0, 0, 0);
    panel.castShadow = true;
    group.add(panel);
    group.add(box(vertical ? 0.28 : TILE * 0.86, 0.08, vertical ? TILE * 0.86 : 0.28, runtime.materials.darkWood, 0, WALL_HEIGHT * 0.28, 0));
    group.add(box(vertical ? 0.28 : TILE * 0.86, 0.08, vertical ? TILE * 0.86 : 0.28, runtime.materials.darkWood, 0, -WALL_HEIGHT * 0.12, 0));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), runtime.materials.key);
    knob.position.set(vertical ? -0.15 : TILE * 0.25, 0.05, vertical ? TILE * 0.25 : -0.15);
    knob.castShadow = true;
    group.add(knob);
    group.userData.closedRotationY = 0;
    return group;
  }

  function doorOrientation(door) {
    const map = runtime.config.map;
    const left = map[door.y]?.[door.x - 1] && map[door.y][door.x - 1] !== "#";
    const right = map[door.y]?.[door.x + 1] && map[door.y][door.x + 1] !== "#";
    const up = map[door.y - 1]?.[door.x] && map[door.y - 1][door.x] !== "#";
    const down = map[door.y + 1]?.[door.x] && map[door.y + 1][door.x] !== "#";
    return Number(left) + Number(right) > Number(up) + Number(down) ? "vertical" : "horizontal";
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
      const group = createObjectPickup(obj);
      runtime.meshes.objects.set(obj.id, group);
      runtime.groups.dynamic.add(group);
    }
    for (const weapon of runtime.config.weaponPickups) {
      const group = createWorldWeapon(weapon);
      runtime.meshes.weapons.set(weapon.id, group);
      runtime.groups.dynamic.add(group);
    }
  }

  function createObjectPickup(obj) {
    if (obj.type === "key") return createKey();
    if (obj.type === "tool") return createToolPickup(obj);
    if (obj.type === "talisman") return createTalismanPickup(obj);
    if (obj.type === "switch") return createSwitchPickup(obj);
    return createClue(obj);
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

  function createToolPickup(obj) {
    const group = new THREE.Group();
    const material = standard(obj.color || "#caa56d", 0.42, 0.5, obj.color || "#caa56d", 0.16);
    if (obj.tool === "crowbar") {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.82, 14), material);
      shaft.rotation.set(0.45, 0.12, Math.PI / 2.7);
      shaft.castShadow = true;
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.026, 8, 24, Math.PI * 1.2), material);
      hook.rotation.set(Math.PI / 2, 0.2, -0.35);
      hook.position.set(0.32, 0.08, -0.1);
      group.add(shaft, hook);
    } else if (obj.tool === "fuse") {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 18), material);
      body.rotation.z = Math.PI / 2;
      const capA = box(0.08, 0.13, 0.13, runtime.materials.metal, -0.24, 0, 0);
      const capB = box(0.08, 0.13, 0.13, runtime.materials.metal, 0.24, 0, 0);
      group.add(body, capA, capB);
    } else {
      const caseMat = standard("#3b2448", 0.12, 0.58, "#e6b1ff", 0.12);
      const boxMesh = box(0.38, 0.26, 0.32, caseMat, 0, 0, 0);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 8, 24), material);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(0, 0.16, 0.18);
      const crank = box(0.16, 0.025, 0.025, material, 0.22, 0.16, 0.18);
      group.add(boxMesh, wheel, crank);
    }
    if (runtime.quality.dynamicLights) group.add(new THREE.PointLight(obj.color || "#caa56d", 0.8, 2.8, 2));
    return group;
  }

  function createTalismanPickup(obj) {
    const group = new THREE.Group();
    const material = standard(obj.color || "#d8b15f", 0.18, 0.48, obj.color || "#d8b15f", 0.42);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), material);
    gem.rotation.z = Math.PI / 4;
    const crack = box(0.025, 0.36, 0.018, runtime.materials.black, 0.03, 0.01, 0.2);
    crack.rotation.z = -0.32;
    group.add(gem, crack);
    if (runtime.quality.dynamicLights) group.add(new THREE.PointLight(obj.color || "#d8b15f", 0.7, 2.6, 2));
    return group;
  }

  function createSwitchPickup(obj) {
    const group = new THREE.Group();
    group.userData.staticPickup = true;
    const panel = box(0.46, 0.56, 0.1, standard("#16312c", 0.34, 0.64, obj.color || "#61c6b6", 0.16), 0, 0, 0);
    const lever = box(0.08, 0.42, 0.06, runtime.materials.metal, 0, 0.02, 0.09);
    lever.rotation.z = -0.22;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), standard(obj.color || "#61c6b6", 0.04, 0.32, obj.color || "#61c6b6", 1.3));
    light.position.set(0.14, 0.18, 0.12);
    group.add(panel, lever, light);
    if (runtime.quality.dynamicLights) group.add(new THREE.PointLight(obj.color || "#61c6b6", 0.9, 3, 2));
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
    addCharacterAssetModel(group, pig);
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

  function addCharacterAssetModel(group, pig) {
    const asset = pig.asset || CHARACTER_ASSETS.peppa;
    const width = pig.cardWidth;
    const height = pig.cardHeight;
    const texture = getCharacterTexture(asset.src);
    const geometry = new THREE.PlaneGeometry(width, height);

    const depthLayers = [
      { z: -0.06, scale: 1.035, opacity: 0.42 },
      { z: -0.12, scale: 1.06, opacity: 0.22 }
    ];
    for (const layer of depthLayers) {
      const silhouette = new THREE.Mesh(
        geometry,
        characterAssetMaterial(texture, 0x2a1114, layer.opacity)
      );
      silhouette.position.set(0, height / 2, layer.z);
      silhouette.scale.set(layer.scale, layer.scale, 1);
      silhouette.renderOrder = 8;
      group.add(silhouette);
    }

    const front = new THREE.Mesh(geometry, characterAssetMaterial(texture, 0xffffff, 1));
    front.position.set(0, height / 2, 0);
    front.renderOrder = 12;
    front.castShadow = runtime.quality.shadows;
    group.add(front);

    const back = new THREE.Mesh(geometry, characterAssetMaterial(texture, 0x3b2022, 0.62));
    back.position.set(0, height / 2, -0.16);
    back.rotation.y = Math.PI;
    back.renderOrder = 6;
    group.add(back);

    group.userData.assetModel = true;
    group.userData.assetHeight = height;
  }

  function getCharacterTexture(src) {
    const cached = runtime.characterTextures.get(src);
    if (cached) return cached;
    const texture = new THREE.TextureLoader().load(src, () => {
      texture.needsUpdate = true;
    });
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(runtime.quality.anisotropy, runtime.renderer.capabilities.getMaxAnisotropy());
    if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    runtime.characterTextures.set(src, texture);
    return texture;
  }

  function characterAssetMaterial(texture, color, opacity) {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color,
      transparent: true,
      opacity,
      alphaTest: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    material.toneMapped = false;
    return material;
  }

  function pigProfile(character) {
    const profiles = {
      george: { assetKey: "george", skin: "#ff9eb0", cloth: "#2f7ee6", dress: "#2f7ee6", height: 0.86, radius: 0.25, head: 0.32, headY: 0.4, light: 0x6ca8ff, glasses: false, lashes: false, beard: false, cheek: "#ff6b86", bodyTop: 0.7, bodyBottom: 1.05, bodyDepth: 0.48, headScaleX: 1.42, headScaleY: 1.02, headDepth: 0.36, faceZ: 0.16, cardWidth: 1.06, cardHeight: 2.22, child: true, bodyRound: true },
      grandpaPig: { assetKey: "grandpaPig", skin: "#f49aaa", cloth: "#2f9b4f", dress: "#4b9760", height: 1.42, radius: 0.36, head: 0.42, headY: 0.43, light: 0xffb45c, glasses: true, lashes: false, beard: true, cheek: "#de5b70", bodyTop: 0.82, bodyBottom: 1.16, bodyDepth: 0.52, headScaleX: 1.43, headScaleY: 1.04, headDepth: 0.38, faceZ: 0.2, cardWidth: 1.43, cardHeight: 2.58, bodyRound: true },
      mummyPig: { assetKey: "mummyPig", skin: "#ff9fb2", cloth: "#f05b95", dress: "#f06a2f", height: 1.28, radius: 0.32, head: 0.38, headY: 0.42, light: 0xff77aa, glasses: false, lashes: true, beard: false, cheek: "#ef5b7a", bodyTop: 0.7, bodyBottom: 1.18, bodyDepth: 0.5, headScaleX: 1.42, headScaleY: 1.03, headDepth: 0.37, faceZ: 0.19, cardWidth: 1.43, cardHeight: 2.64 },
      daddyPig: { assetKey: "daddyPig", skin: "#f29aa8", cloth: "#35a8e0", dress: "#31a7ad", height: 1.5, radius: 0.42, head: 0.47, headY: 0.42, light: 0x66d0ff, glasses: true, lashes: false, beard: true, cheek: "#dc526b", bodyTop: 0.9, bodyBottom: 1.24, bodyDepth: 0.58, headScaleX: 1.46, headScaleY: 1.02, headDepth: 0.42, faceZ: 0.23, cardWidth: 1.68, cardHeight: 2.82, bodyRound: true },
      grannyPig: { assetKey: "grannyPig", skin: "#f8a8b4", cloth: "#f08b38", dress: "#e85b80", height: 1.33, radius: 0.34, head: 0.39, headY: 0.42, light: 0xffaa57, glasses: true, lashes: true, beard: false, cheek: "#eb6076", bodyTop: 0.76, bodyBottom: 1.14, bodyDepth: 0.5, headScaleX: 1.42, headScaleY: 1.04, headDepth: 0.37, faceZ: 0.19, cardWidth: 1.44, cardHeight: 2.81 },
      peppa: { assetKey: "peppa", skin: "#ff9fc0", cloth: "#e83945", dress: "#e83845", height: 0.96, radius: 0.27, head: 0.34, headY: 0.4, light: 0xff5c76, glasses: false, lashes: true, beard: false, cheek: "#ff5f82", bodyTop: 0.68, bodyBottom: 1.12, bodyDepth: 0.48, headScaleX: 1.43, headScaleY: 1.03, headDepth: 0.36, faceZ: 0.17, cardWidth: 1.08, cardHeight: 2.48 },
      butcherPig: { assetKey: "butcherPig", skin: "#b68a76", cloth: "#4b120d", dress: "#4b120d", height: 1.68, radius: 0.49, head: 0.51, headY: 0.43, light: 0xff2416, glasses: false, lashes: false, beard: true, cheek: "#7a160f", bodyTop: 0.92, bodyBottom: 1.28, bodyDepth: 0.64, headScaleX: 1.5, headScaleY: 1.04, headDepth: 0.45, faceZ: 0.25, cardWidth: 1.88, cardHeight: 3.08, bodyRound: true }
    };
    const profile = profiles[character.kind] || profiles.peppa;
    const asset = CHARACTER_ASSETS[profile.assetKey] || CHARACTER_ASSETS.peppa;
    const assetHeights = {
      george: 1.76,
      peppa: 2.08,
      mummyPig: 2.55,
      daddyPig: 2.78,
      grandpaPig: 2.72,
      grannyPig: 2.66,
      butcherPig: 2.92
    };
    const cardHeight = assetHeights[profile.assetKey] || profile.cardHeight;
    return {
      ...profile,
      asset,
      cardHeight,
      cardWidth: cardHeight * (asset.width / asset.height)
    };
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

    runtime.scene.fog.density = 0.026 + (state.scare || 0) * 0.02;
  }

  function updateDoors(doors) {
    for (const [id, mesh] of runtime.meshes.doors.entries()) {
      mesh.visible = !doors[id]?.opened;
      mesh.rotation.y = mesh.userData.closedRotationY || 0;
    }
  }

  function updateObjects(objects, elapsed) {
    for (const obj of objects) {
      const group = runtime.meshes.objects.get(obj.id);
      if (!group) continue;
      group.visible = !obj.hidden && !obj.collected;
      const bob = group.userData.staticPickup ? 0 : Math.sin(elapsed * 2.5 + obj.x) * 0.08;
      const height = obj.type === "switch" ? 1.05 : obj.type === "tool" ? 0.5 : 0.62;
      const p = toWorld(obj.x, obj.y, height + bob);
      group.position.copy(p);
      if (obj.type === "switch") {
        group.rotation.y = -Math.PI / 2;
      } else {
        group.rotation.y = elapsed * 0.7 + obj.x;
      }
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
    if (character.id === "butcherPig" && !state.powerOn && !state.hasKey) return false;
    const rule = (runtime.config.difficultySettings?.[state.difficulty] || {}).active?.[character.id] || "start";
    if (rule === "start") return true;
    if (rule === "clue1") return state.clues.size >= 1 || state.hasKey;
    if (rule === "clue2") return state.clues.size >= 2 || state.hasKey;
    if (rule === "clue3") return state.clues.size >= 3 || state.hasKey;
    if (rule === "basement") return runtime.config.world.doors.basement.opened || state.hasKey;
    if (rule === "power") return state.powerOn || state.hasKey;
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
