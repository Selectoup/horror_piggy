const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });
const deathCanvas = document.querySelector("#deathCanvas");
const deathCtx = deathCanvas?.getContext("2d", { alpha: true });
const performanceProfile = createPerformanceProfile();
document.body.classList.toggle("perf-lite", performanceProfile.lite);

const ui = {
  title: document.querySelector("#titleScreen"),
  end: document.querySelector("#endScreen"),
  start: document.querySelector("#startButton"),
  restart: document.querySelector("#restartButton"),
  difficultyButtons: document.querySelectorAll("[data-difficulty]"),
  clueCount: document.querySelector("#clueCount"),
  keyState: document.querySelector("#keyState"),
  weaponState: document.querySelector("#weaponState"),
  dangerState: document.querySelector("#dangerState"),
  dangerBadge: document.querySelector("#dangerBadge"),
  deathState: document.querySelector("#deathState"),
  progressFill: document.querySelector("#progressFill"),
  staminaFill: document.querySelector("#staminaFill"),
  staminaText: document.querySelector("#staminaText"),
  slots: {
    photo: document.querySelector("#slotPhoto"),
    fridge: document.querySelector("#slotFridge"),
    diary: document.querySelector("#slotDiary"),
    tape: document.querySelector("#slotTape"),
    greenhouse: document.querySelector("#slotGreenhouse"),
    ledger: document.querySelector("#slotLedger"),
    crowbar: document.querySelector("#slotCrowbar"),
    fuse: document.querySelector("#slotFuse"),
    musicbox: document.querySelector("#slotMusicbox"),
    talisman: document.querySelector("#slotTalisman"),
    key: document.querySelector("#slotKey")
  },
  task: document.querySelector("#task"),
  message: document.querySelector("#message"),
  hint: document.querySelector("#hint"),
  interact: document.querySelector("#interactButton"),
  fire: document.querySelector("#fireButton"),
  endKicker: document.querySelector("#endKicker"),
  endTitle: document.querySelector("#endTitle"),
  endText: document.querySelector("#endText")
};

function createPerformanceProfile() {
  const params = new URLSearchParams(window.location.search);
  const forced = (params.get("quality") || params.get("perf") || "").toLowerCase();
  const mobile = window.matchMedia?.("(pointer: coarse)")?.matches || Math.min(window.innerWidth, window.innerHeight) < 760;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const saveData = Boolean(navigator.connection?.saveData);
  const autoLow = saveData || mobile || cores <= 4 || memory <= 4 || window.devicePixelRatio > 1.6;
  const quality = ["low", "medium", "high"].includes(forced) ? forced : autoLow ? "low" : "medium";
  const profiles = {
    low: { canvasScale: 1, deathScale: 1, raysPerPixel: 4, rayStep: 0.055, dustCount: 24, lite: true },
    medium: { canvasScale: 1.2, deathScale: 1.15, raysPerPixel: 3, rayStep: 0.042, dustCount: 46, lite: true },
    high: { canvasScale: 1.6, deathScale: 1.5, raysPerPixel: 2, rayStep: 0.025, dustCount: 90, lite: false }
  };
  return { quality, ...profiles[quality] };
}

const TILE = 1;
const FOV = Math.PI / 3.15;
const RAYS_PER_PIXEL = performanceProfile.raysPerPixel;
const RAY_STEP = performanceProfile.rayStep;
const MAX_DEPTH = 18;
const INTERACTION_DISTANCE = 1.55;

const palette = {
  ceiling: "#07070a",
  floor: "#16120f",
  floorFar: "#2b241d",
  wall: "#564332",
  wallDark: "#241b16",
  trim: "#100d0b",
  door: "#251711",
  basement: "#17201d",
  clue: "#ffd568",
  key: "#ffbf3e",
  enemy: "#d8d0bd",
  enemyDress: "#342a24"
};

const assets = {
  atlas: loadAsset("src/assets/interior-atlas.png"),
  enemy: loadAsset("src/assets/enemy-sprite.png")
};

const texturePatterns = {
  floor: null,
  basement: null
};
let frameLightSources = [];
let nextTargetUpdate = 0;
let nextUiUpdate = 0;

const textureRegions = {
  wallpaper: { col: 0, row: 0 },
  door: { col: 1, row: 0 },
  floor: { col: 0, row: 1 },
  basement: { col: 1, row: 1 }
};

const dust = Array.from({ length: performanceProfile.dustCount }, (_, index) => ({
  seed: index * 19.37,
  x: (index * 73) % 997,
  y: (index * 137) % 991,
  size: 0.6 + ((index * 31) % 8) / 10,
  depth: 0.24 + ((index * 17) % 70) / 100
}));

const rawMap = [
  "#############D#############",
  "#.......#...#.......#.....#",
  "#.......#...#.......#.....#",
  "#.......#...#.......#.....#",
  "#.......D...D.......#.....#",
  "#.......#...#.......D.....#",
  "#####.#####.#####.#########",
  "#.........#.#.........#...#",
  "#.........#.#.........#...#",
  "#.........D.D.........D...#",
  "#.........#.#.........#...#",
  "#####.#####D#####.#########",
  "#.........#.#.........#...#",
  "#.........#.#.........#...#",
  "#.........D.D.........#...#",
  "#.........#.#.........#...#",
  "#####.#####.#####D#########",
  "#.....#.........#.........#",
  "#.....#.........#.........#",
  "#.....D.........D.........#",
  "#.....#.........#.........#",
  "#####.#####D#####.#########",
  "#.........#.#.........#...#",
  "#.........#.#.........D...#",
  "#.........D.D.........#...#",
  "#.........#.#.........#...#",
  "###########################"
];

const map = rawMap.map((row) => row.split(""));
const world = {
  width: map[0].length,
  height: map.length,
  doors: {
    front: { id: "front", x: 10, y: 0, opened: false, label: "前门", needsKey: true },
    basement: { id: "basement", x: 10, y: 11, opened: false, label: "地下室门", needsCode: true }
  }
};

world.doors = {
  front: { id: "front", x: 13, y: 0, opened: false, label: "前门", needsKey: true },
  bedroomHall: { id: "bedroomHall", x: 8, y: 4, opened: false, label: "卧室走廊门" },
  parlorHall: { id: "parlorHall", x: 12, y: 4, opened: false, label: "餐厅木门" },
  eastWing: { id: "eastWing", x: 20, y: 5, opened: false, label: "东翼钉死的门", needsTool: "crowbar" },
  galleryWest: { id: "galleryWest", x: 10, y: 9, opened: false, label: "画廊西门" },
  galleryEast: { id: "galleryEast", x: 12, y: 9, opened: false, label: "画廊东门" },
  nursery: { id: "nursery", x: 22, y: 9, opened: false, label: "儿童房门", needsPower: true },
  basement: { id: "basement", x: 11, y: 11, opened: false, label: "地下室密码门", needsCode: true },
  archiveWest: { id: "archiveWest", x: 10, y: 14, opened: false, label: "档案室门" },
  archiveEast: { id: "archiveEast", x: 12, y: 14, opened: false, label: "礼拜间门" },
  greenhouse: { id: "greenhouse", x: 17, y: 16, opened: false, label: "温室玻璃门", needsPower: true },
  storage: { id: "storage", x: 6, y: 19, opened: false, label: "工具间铁链门", needsTool: "crowbar" },
  ritual: { id: "ritual", x: 16, y: 19, opened: false, label: "祭坛门", needsPower: true },
  boiler: { id: "boiler", x: 11, y: 21, opened: false, label: "锅炉房门" },
  morgue: { id: "morgue", x: 22, y: 23, opened: false, label: "停尸间门", needsPower: true },
  cellarWest: { id: "cellarWest", x: 10, y: 24, opened: false, label: "地下西门" },
  cellarEast: { id: "cellarEast", x: 12, y: 24, opened: false, label: "地下东门" }
};
const initialDoorTiles = Object.values(world.doors).map((door) => ({ x: door.x, y: door.y }));

const spawnPoint = {
  x: 4.45,
  y: 3.35,
  angle: Math.PI / 2
};
const characterSpawns = {
  piglet: { x: 16.5, y: 8.6 },
  elderPig: { x: 17.2, y: 3.6 },
  motherPig: { x: 4.7, y: 14.6 },
  fatherPig: { x: 18.8, y: 18.6 },
  boarPig: { x: 7.4, y: 9.4 },
  pigGirl: { x: 14.4, y: 15.4 },
  butcherPig: { x: 20.7, y: 24.2 }
};
const MAX_DEATHS = 1;
const CHARACTER_RESPAWN_MS = 10000;
const difficultySettings = {
  easy: {
    label: "简单模式",
    speed: 0.76,
    vision: 0.78,
    pressure: 0.7,
    catchDistance: 0.88,
    staminaDrain: 0.26,
    staminaRecoverMoving: 0.22,
    staminaRecoverIdle: 0.3,
    startGrace: 3.2,
    active: {
      piglet: "clue2",
      elderPig: "clue2",
      motherPig: "basement",
      fatherPig: "key",
      boarPig: "key",
      pigGirl: "basement",
      butcherPig: "power"
    }
  },
  hard: {
    label: "困难模式",
    speed: 1.12,
    vision: 1.12,
    pressure: 1.18,
    catchDistance: 1.0,
    staminaDrain: 0.36,
    staminaRecoverMoving: 0.15,
    staminaRecoverIdle: 0.2,
    startGrace: 1.2,
    active: {
      piglet: "clue1",
      elderPig: "start",
      motherPig: "basement",
      fatherPig: "key",
      boarPig: "clue2",
      pigGirl: "clue1",
      butcherPig: "clue3"
    }
  },
  nightmare: {
    label: "恶梦模式",
    speed: 1.34,
    vision: 1.28,
    pressure: 1.35,
    catchDistance: 1.08,
    staminaDrain: 0.46,
    staminaRecoverMoving: 0.09,
    staminaRecoverIdle: 0.14,
    startGrace: 0.45,
    active: {
      piglet: "start",
      elderPig: "start",
      motherPig: "start",
      fatherPig: "start",
      boarPig: "start",
      pigGirl: "clue1",
      butcherPig: "clue2"
    }
  }
};

const player = {
  x: spawnPoint.x,
  y: spawnPoint.y,
  angle: spawnPoint.angle,
  pitch: 0,
  stamina: 1,
  bob: 0
};

const characters = [
  {
    id: "piglet",
    label: "乔治",
    x: characterSpawns.piglet.x,
    y: characterSpawns.piglet.y,
    homeX: characterSpawns.piglet.x,
    homeY: characterSpawns.piglet.y,
    speed: 0.98,
    radius: 0.56,
    vision: 7.8,
    catchDistance: 0.86,
    huntClues: 2,
    health: 80,
    maxHealth: 80,
    roamX: 2.1,
    roamY: 1.3,
    kind: "george",
    glow: "rgba(255, 71, 96, 0.72)",
    pulse: 0
  },
  {
    id: "elderPig",
    label: "猪爷爷",
    x: characterSpawns.elderPig.x,
    y: characterSpawns.elderPig.y,
    homeX: characterSpawns.elderPig.x,
    homeY: characterSpawns.elderPig.y,
    speed: 0.68,
    radius: 0.86,
    vision: 8.8,
    catchDistance: 1.02,
    huntClues: 1,
    health: 150,
    maxHealth: 150,
    roamX: 1.4,
    roamY: 1.0,
    kind: "grandpaPig",
    glow: "rgba(255, 154, 82, 0.62)",
    pulse: 0
  },
  {
    id: "motherPig",
    label: "猪妈妈",
    x: characterSpawns.motherPig.x,
    y: characterSpawns.motherPig.y,
    homeX: characterSpawns.motherPig.x,
    homeY: characterSpawns.motherPig.y,
    speed: 0.84,
    radius: 0.74,
    vision: 7.2,
    catchDistance: 0.9,
    huntClues: 3,
    health: 110,
    maxHealth: 110,
    roamX: 1.8,
    roamY: 1.2,
    kind: "mummyPig",
    glow: "rgba(255, 94, 130, 0.58)",
    pulse: 0
  },
  {
    id: "fatherPig",
    label: "猪爸爸",
    x: characterSpawns.fatherPig.x,
    y: characterSpawns.fatherPig.y,
    homeX: characterSpawns.fatherPig.x,
    homeY: characterSpawns.fatherPig.y,
    speed: 0.78,
    radius: 0.92,
    vision: 7.6,
    catchDistance: 1.0,
    huntClues: 4,
    health: 170,
    maxHealth: 170,
    roamX: 1.7,
    roamY: 1.0,
    kind: "daddyPig",
    glow: "rgba(190, 80, 255, 0.6)",
    pulse: 0
  },
  {
    id: "boarPig",
    label: "猪奶奶",
    x: characterSpawns.boarPig.x,
    y: characterSpawns.boarPig.y,
    homeX: characterSpawns.boarPig.x,
    homeY: characterSpawns.boarPig.y,
    speed: 1.12,
    radius: 0.88,
    vision: 8.4,
    catchDistance: 1.04,
    huntClues: 2,
    health: 220,
    maxHealth: 220,
    roamX: 1.5,
    roamY: 1.3,
    kind: "grannyPig",
    glow: "rgba(160, 40, 28, 0.72)",
    pulse: 0
  },
  {
    id: "pigGirl",
    label: "小猪佩奇",
    x: characterSpawns.pigGirl.x,
    y: characterSpawns.pigGirl.y,
    homeX: characterSpawns.pigGirl.x,
    homeY: characterSpawns.pigGirl.y,
    speed: 1.04,
    radius: 0.58,
    vision: 7.9,
    catchDistance: 0.84,
    huntClues: 2,
    health: 90,
    maxHealth: 90,
    roamX: 1.6,
    roamY: 1.1,
    kind: "peppa",
    glow: "rgba(255, 132, 180, 0.66)",
    pulse: 0
  },
  {
    id: "butcherPig",
    label: "地下屠夫",
    x: characterSpawns.butcherPig.x,
    y: characterSpawns.butcherPig.y,
    homeX: characterSpawns.butcherPig.x,
    homeY: characterSpawns.butcherPig.y,
    speed: 0.92,
    radius: 1.02,
    vision: 10.2,
    catchDistance: 1.12,
    huntClues: 5,
    health: 260,
    maxHealth: 260,
    roamX: 1.8,
    roamY: 1.4,
    kind: "butcherPig",
    glow: "rgba(255, 38, 26, 0.72)",
    pulse: 0,
    prefersNoise: true
  }
];
const enemy = characters[0];

const state = {
  started: false,
  ended: false,
  clues: new Set(),
  hasKey: false,
  currentTarget: null,
  messageUntil: 0,
  lastFrame: performance.now(),
  scare: 0,
  deaths: 0,
  captureCooldown: 0,
  weaponInventory: [],
  activeWeapon: null,
  lastShotAt: -Infinity,
  gunFlash: 0,
  gunKick: 0,
  shotLine: null,
  lastCaptor: null,
  difficulty: "easy",
  powerOn: false,
  lockpickCount: 0,
  talismanCount: 0,
  usedTalismanAt: 0,
  noiseTrapAt: 0,
  noiseTrapPosition: null,
  solvedRiddle: false,
  deathScene: null,
  deathStartedAt: 0,
  escaped: false,
  audioReady: false,
  audioStarted: false,
  audioContext: null,
  audioNodes: null
};

const keys = new Set();
const mobileMove = { forward: false, back: false, left: false, right: false };
const clueOrder = ["photo", "fridge", "diary", "tape", "greenhouse", "ledger"];
const basementCodeClues = ["photo", "fridge", "diary"];
const toolSlots = ["crowbar", "fuse", "musicbox"];
const postPowerClues = ["tape", "greenhouse", "ledger"];
const hiddenUntilPower = ["tape", "greenhouse", "ledger"];
const hiddenUntilBasementCode = ["powerbox"];
const clueLabels = {
  photo: "旧照片",
  fridge: "冰箱便签",
  diary: "摇椅日记",
  tape: "录音带",
  greenhouse: "温室血字",
  ledger: "停尸账本"
};
const startupParams = new URLSearchParams(window.location.search);
const reviewMode = startupParams.get("autostart") === "review" || startupParams.has("review");
const weapons = {
  pistol: {
    id: "pistol",
    name: "旧手枪",
    label: "旧手枪",
    x: 6.1,
    y: 8.7,
    color: "#b8b1a2",
    range: 9.5,
    spread: 0.065,
    damage: 34,
    cooldown: 420,
    stun: 1.35,
    knockback: 1.6,
    flash: "#ffe0a3",
    message: "你捡起一把旧手枪。子弹像被老宅诅咒一样永远打不完。"
  },
  shotgun: {
    id: "shotgun",
    name: "短管霰弹枪",
    label: "短管霰弹枪",
    x: 4.2,
    y: 22.8,
    color: "#8a5a35",
    range: 6.5,
    spread: 0.18,
    damage: 82,
    cooldown: 860,
    stun: 1.85,
    knockback: 2.5,
    flash: "#ffc06f",
    message: "你捡起短管霰弹枪。近距离能把怪物轰退很远，弹药无限。"
  },
  rifle: {
    id: "rifle",
    name: "猎枪",
    label: "猎枪",
    x: 23.7,
    y: 8.7,
    color: "#6f4a2c",
    range: 13,
    spread: 0.035,
    damage: 56,
    cooldown: 620,
    stun: 1.55,
    knockback: 1.95,
    flash: "#fff0b8",
    message: "你捡起一把老猎枪。它射得更远，弹药无限。"
  }
};
const deathEndings = [
  {
    className: "ending-door",
    scene: "door",
    kicker: "死亡结局 A",
    title: "木门后的房间",
    text: "你倒下后再也没回到床上。门外的脚步声停住，钥匙从锁孔里转了一圈，屋子把你的名字吞进了墙纸。"
  },
  {
    className: "ending-basement",
    scene: "basement",
    kicker: "死亡结局 B",
    title: "地下室的第四把椅子",
    text: "那一家把一盏灯放在你面前。地下室里原本只有三把椅子，天亮前，第四把椅子开始慢慢摇晃。"
  },
  {
    className: "ending-mirror",
    scene: "mirror",
    kicker: "死亡结局 C",
    title: "镜子里的人",
    text: "阁楼镜子裂开时，你看见自己还站在卧室门口。镜中那个你轻轻敲门，而真正的你再也没有回答。"
  },
  {
    className: "ending-loop",
    scene: "loop",
    kicker: "死亡结局 D",
    title: "永远的第三天",
    text: "老宅的钟停在凌晨三点。每一次钟声响起，你都会从同一张床上醒来，只是门外的人离你更近了一步。"
  }
];

function currentDifficulty() {
  return difficultySettings[state.difficulty] || difficultySettings.easy;
}

const objects = [
  {
    id: "photo",
    type: "clue",
    x: 4.9,
    y: 2.2,
    radius: 0.22,
    color: palette.clue,
    label: "床头旧照片",
    message: "线索一：照片背面刻着“她每天数四下门锁，第一位是 4”。"
  },
  {
    id: "fridge",
    type: "clue",
    x: 16.35,
    y: 2.55,
    radius: 0.22,
    color: palette.clue,
    label: "发霉冰箱便签",
    message: "线索二：便签粘在冰箱门上：“座钟响两声时，第二位是 2”。"
  },
  {
    id: "diary",
    type: "clue",
    x: 4.35,
    y: 8.55,
    radius: 0.22,
    color: palette.clue,
    label: "摇椅下日记",
    message: "线索三：日记最后一页只写着：“地下室喜欢 7，密码是 427”。"
  },
  {
    id: "key",
    type: "key",
    x: 16.45,
    y: 15.85,
    radius: 0.24,
    color: palette.key,
    label: "前门钥匙",
    hidden: true,
    message: "钥匙冰得像刚从井里捞出来。前门现在能打开了。"
  }
];
Object.assign(objects.find((obj) => obj.id === "key"), {
  x: 21.8,
  y: 23.45,
  label: "前门钥匙",
  message: "钥匙被尸体攥得很紧。前门现在能打开了，但屠夫已经听见你了。"
});
objects.push(
  {
    id: "crowbar",
    type: "tool",
    tool: "crowbar",
    x: 6.2,
    y: 13.7,
    radius: 0.24,
    color: "#caa56d",
    label: "生锈撬棍",
    message: "你拿到撬棍。钉死的门和铁链门现在能被撬开。"
  },
  {
    id: "fuse",
    type: "tool",
    tool: "fuse",
    x: 23.25,
    y: 2.8,
    radius: 0.24,
    color: "#76d7ff",
    label: "蓝色保险丝",
    message: "保险丝冷得发麻。地下锅炉房的配电箱也许能用上。"
  },
  {
    id: "musicbox",
    type: "tool",
    tool: "musicbox",
    x: 2.55,
    y: 18.55,
    radius: 0.24,
    color: "#e6b1ff",
    label: "发条玩具",
    message: "你拿到会自己唱歌的发条玩具。调查地面时可放下诱饵，把怪物引过去。"
  },
  {
    id: "talisman",
    type: "talisman",
    x: 14.2,
    y: 18.5,
    radius: 0.23,
    color: "#d8b15f",
    label: "裂纹护符",
    message: "护符在你手心碎了一道缝。下次被抓时它会替你挡一次。"
  },
  {
    id: "powerbox",
    type: "switch",
    x: 11.4,
    y: 22.65,
    radius: 0.34,
    color: "#61c6b6",
    label: "锅炉房配电箱",
    hidden: true,
    message: "你把保险丝按进配电箱。整栋老宅的灯闪了一下，远处有新的门锁弹开。"
  },
  {
    id: "tape",
    type: "clue",
    x: 23.35,
    y: 8.5,
    radius: 0.22,
    color: palette.clue,
    label: "儿童房录音带",
    hidden: true,
    message: "线索四：录音里有孩子倒着数数：七、二、四。原来地下室密码只是第一层锁。"
  },
  {
    id: "greenhouse",
    type: "clue",
    x: 22.6,
    y: 18.45,
    radius: 0.22,
    color: palette.clue,
    label: "温室血字",
    hidden: true,
    message: "线索五：玻璃上的血字写着“先让房子醒来，再去找尸体手里的钥匙”。"
  },
  {
    id: "ledger",
    type: "clue",
    x: 20.6,
    y: 24.35,
    radius: 0.22,
    color: palette.clue,
    label: "停尸间账本",
    hidden: true,
    message: "线索六：账本夹着钥匙柜编号：右、左、右。柜门下面渗出热气。"
  }
);
const weaponPickups = Object.values(weapons).map((weapon) => ({
  ...weapon,
  type: "weapon",
  radius: 0.3,
  collected: false
}));

const props = [
  { x: 2.7, y: 2.45, w: 2.15, h: 0.9, color: "#46392f", name: "铁架床", kind: "bed" },
  { x: 6.45, y: 2.45, w: 0.95, h: 1.35, color: "#2d241e", name: "旧衣柜", kind: "wardrobe" },
  { x: 2.0, y: 3.95, w: 0.7, h: 0.62, color: "#37271f", name: "床头柜", kind: "cabinet" },
  { x: 16.25, y: 2.35, w: 1.05, h: 1.25, color: "#8e9589", name: "发霉冰箱", kind: "fridge" },
  { x: 18.05, y: 3.75, w: 1.45, h: 0.65, color: "#43372f", name: "灶台", kind: "counter" },
  { x: 14.5, y: 4.0, w: 1.45, h: 0.72, color: "#36281e", name: "餐桌", kind: "table" },
  { x: 3.15, y: 8.3, w: 1.55, h: 0.72, color: "#3c2b21", name: "摇椅", kind: "chair" },
  { x: 6.95, y: 9.1, w: 0.82, h: 1.45, color: "#2b211a", name: "座钟", kind: "clock" },
  { x: 14.7, y: 8.25, w: 2.0, h: 0.78, color: "#4a352c", name: "塌陷沙发", kind: "sofa" },
  { x: 18.0, y: 9.35, w: 1.25, h: 0.7, color: "#26221e", name: "电视柜", kind: "cabinet" },
  { x: 3.15, y: 15.15, w: 1.8, h: 0.72, color: "#3a3028", name: "工具桌", kind: "table" },
  { x: 6.85, y: 16.05, w: 0.9, h: 1.35, color: "#27231d", name: "地下书架", kind: "shelf" },
  { x: 14.15, y: 15.45, w: 1.35, h: 0.74, color: "#352922", name: "木箱", kind: "box" },
  { x: 17.55, y: 16.0, w: 1.05, h: 1.05, color: "#221d1a", name: "钥匙柜", kind: "cabinet" }
];

function resize() {
  const scale = Math.min(window.devicePixelRatio || 1, performanceProfile.canvasScale);
  canvas.width = Math.floor(window.innerWidth * scale);
  canvas.height = Math.floor(window.innerHeight * scale);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  if (deathCanvas && deathCtx) {
    const deathScale = Math.min(window.devicePixelRatio || 1, performanceProfile.deathScale);
    deathCanvas.width = Math.floor(window.innerWidth * deathScale);
    deathCanvas.height = Math.floor(window.innerHeight * deathScale);
    deathCanvas.style.width = `${window.innerWidth}px`;
    deathCanvas.style.height = `${window.innerHeight}px`;
    deathCtx.setTransform(deathScale, 0, 0, deathScale, 0, 0);
  }
}

window.addEventListener("resize", resize);
resize();

function loadAsset(src) {
  const image = new Image();
  image.src = src;
  image.loaded = false;
  image.addEventListener("load", () => {
    image.loaded = true;
    if (src.includes("interior-atlas")) buildTexturePatterns();
  });
  return image;
}

function buildTexturePatterns() {
  if (!assets.atlas.loaded) return;
  texturePatterns.floor = ctx.createPattern(createTextureCanvas("floor"), "repeat");
  texturePatterns.basement = ctx.createPattern(createTextureCanvas("basement"), "repeat");
}

function createTextureCanvas(name) {
  const tile = document.createElement("canvas");
  tile.width = 256;
  tile.height = 256;
  const tileCtx = tile.getContext("2d");
  const region = textureRegions[name];
  const sourceSize = Math.floor(Math.min(assets.atlas.naturalWidth, assets.atlas.naturalHeight) / 2);
  tileCtx.drawImage(
    assets.atlas,
    region.col * sourceSize,
    region.row * sourceSize,
    sourceSize,
    sourceSize,
    0,
    0,
    tile.width,
    tile.height
  );
  return tile;
}

function tileAt(x, y) {
  const mx = Math.floor(x);
  const my = Math.floor(y);
  if (my < 0 || my >= world.height || mx < 0 || mx >= world.width) return "#";
  return map[my][mx];
}

function doorAt(x, y) {
  return Object.values(world.doors).find((door) => door.x === x && door.y === y);
}

function isTileWalkable(mx, my) {
  if (my < 0 || my >= world.height || mx < 0 || mx >= world.width) return false;
  const tile = map[my][mx];
  if (tile === "#") return false;
  if (tile === "D") return doorAt(mx, my)?.opened === true;
  return true;
}

function isSolid(x, y) {
  const tile = tileAt(x, y);
  if (tile === "#") return true;
  if (tile === "D") {
    const door = doorAt(Math.floor(x), Math.floor(y));
    return !door?.opened;
  }
  return props.some((prop) => Math.abs(x - prop.x) < prop.w / 2 + 0.18 && Math.abs(y - prop.y) < prop.h / 2 + 0.18);
}

function castRay(angle) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  let distance = 0;
  let hitX = player.x;
  let hitY = player.y;
  let tile = ".";
  let side = 0;

  while (distance < MAX_DEPTH) {
    distance += RAY_STEP;
    hitX = player.x + cos * distance;
    hitY = player.y + sin * distance;
    tile = tileAt(hitX, hitY);
    if (tile === "#" || (tile === "D" && isSolid(hitX, hitY))) {
      const fracX = hitX - Math.floor(hitX);
      const fracY = hitY - Math.floor(hitY);
      side = Math.min(fracX, 1 - fracX) < Math.min(fracY, 1 - fracY) ? 1 : 0;
      break;
    }
  }

  return { distance, hitX, hitY, tile, side };
}

function textureNameAt(x, y, tile) {
  if (tile === "D") return "door";
  return y > 11.4 ? "basement" : "wallpaper";
}

function textureColumn(hit, corrected, wallHeight, screenX, screenY, shade, rayWidth) {
  if (!assets.atlas.loaded) return false;
  const name = textureNameAt(hit.hitX, hit.hitY, hit.tile);
  const region = textureRegions[name];
  const sourceSize = Math.floor(Math.min(assets.atlas.naturalWidth, assets.atlas.naturalHeight) / 2);
  const offset = hit.side ? hit.hitY - Math.floor(hit.hitY) : hit.hitX - Math.floor(hit.hitX);
  const sx = region.col * sourceSize + Math.floor(offset * (sourceSize - 1));
  const sy = region.row * sourceSize;
  ctx.drawImage(assets.atlas, sx, sy, 1, sourceSize, screenX, screenY, rayWidth + 1, wallHeight);

  const light = worldLightAt(hit.hitX, hit.hitY, corrected);
  const sideShade = hit.side ? 0.16 : 0;
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.72, 0.64 - shade * 0.42 + sideShade - light * 0.18)})`;
  ctx.fillRect(screenX, screenY, rayWidth + 1, wallHeight);
  ctx.fillStyle = `rgba(255, 210, 120, ${Math.max(0, light * 0.12)})`;
  ctx.fillRect(screenX, screenY, rayWidth + 1, wallHeight);
  return true;
}

function worldLightAt(x, y, distance) {
  let light = Math.max(0, 1 - distance / MAX_DEPTH) * 0.35;
  const sources = frameLightSources;
  if (!sources.length) return light;
  for (const source of sources) {
    const d = Math.hypot(x - source.x, y - source.y);
    if (d < source.radius) light += (1 - d / source.radius) * source.power;
  }
  return Math.min(1, light);
}

function buildFrameLightSources() {
  const sources = [
    { x: spawnPoint.x, y: spawnPoint.y, power: 0.78, radius: 4.2 },
    { x: 10.5, y: 5.5, power: 0.44, radius: 4.8 },
    { x: 10.5, y: 18.5, power: 0.32, radius: 5.2 }
  ];
  for (const obj of objects) {
    if (obj.hidden || obj.collected) continue;
    const basePower = obj.type === "key" ? 0.95 : obj.type === "switch" ? 0.72 : obj.type === "tool" ? 0.58 : obj.type === "talisman" ? 0.62 : 0.75;
    sources.push({ x: obj.x, y: obj.y, power: basePower, radius: obj.type === "switch" ? 3.9 : 3.2 });
  }
  for (const character of activeCharacters()) {
    const power = character.kind === "butcherPig" ? 1.26 : character.kind === "daddyPig" || character.kind === "grandpaPig" ? 1.08 : 0.86;
    sources.push({ x: character.x, y: character.y, power, radius: character.kind === "butcherPig" ? 4.4 : 3.7 });
  }
  return sources;
}

function drawScene(time) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const half = height * 0.54;
  const bob = Math.sin(player.bob) * 7;
  const shake = state.scare > 0.08 ? state.scare * 12 : 0;
  const shakeX = Math.sin(time * 0.07) * shake;
  const shakeY = Math.cos(time * 0.051) * shake * 0.55;
  const flicker = 0.92 + Math.sin(time * 0.009) * 0.04 + Math.sin(time * 0.027) * 0.025;
  frameLightSources = buildFrameLightSources();

  ctx.save();
  ctx.translate(shakeX, shakeY);

  const sky = ctx.createLinearGradient(0, 0, 0, half + bob);
  sky.addColorStop(0, "#030302");
  sky.addColorStop(0.38, "#0b0907");
  sky.addColorStop(1, "#1d1711");
  ctx.fillStyle = sky;
  ctx.fillRect(-24, -24, width + 48, half + bob + 24);
  drawCeiling(width, half + bob, time);

  drawTexturedFloor(width, height, half + bob, time);

  const rayCount = Math.ceil(width / RAYS_PER_PIXEL);
  const depthBuffer = new Array(rayCount);

  for (let ray = 0; ray < rayCount; ray += 1) {
    const cameraX = ray / rayCount - 0.5;
    const angle = player.angle + cameraX * FOV;
    const hit = castRay(angle);
    const corrected = hit.distance * Math.cos(angle - player.angle);
    depthBuffer[ray] = corrected;

    const wallHeight = Math.min(height * 1.72, (height * 1.28) / Math.max(corrected, 0.001));
    const x = ray * RAYS_PER_PIXEL;
    const y = half - wallHeight / 2 + bob;
    const shade = Math.max(0.18, (1 - corrected / MAX_DEPTH) * flicker);
    const isDoor = hit.tile === "D";
    const base = isDoor ? palette.door : corrected > 11 ? palette.wallDark : palette.wall;

    const renderedTexture = textureColumn(hit, corrected, wallHeight, x, y, shade, RAYS_PER_PIXEL);
    if (!renderedTexture) {
      ctx.fillStyle = shadeColor(base, shade * (hit.side ? 0.78 : 1));
      ctx.fillRect(x, y, RAYS_PER_PIXEL + 1, wallHeight);
    }

    const stripe = (Math.floor((hit.side ? hit.hitY : hit.hitX) * 6) % 2) === 0;
    if (stripe && !isDoor) {
      ctx.fillStyle = `rgba(245, 214, 166, ${0.04 + shade * 0.06})`;
      ctx.fillRect(x, y, RAYS_PER_PIXEL + 1, wallHeight);
    }

    if (isDoor) {
      ctx.fillStyle = `rgba(240, 212, 168, ${0.18 * shade})`;
      ctx.fillRect(x, y + wallHeight * 0.18, RAYS_PER_PIXEL + 1, Math.max(2, wallHeight * 0.035));
      ctx.fillStyle = `rgba(255, 205, 90, ${0.45 * shade})`;
      ctx.fillRect(x, y + wallHeight * 0.52, RAYS_PER_PIXEL + 1, Math.max(2, wallHeight * 0.025));
    } else {
      ctx.fillStyle = `rgba(16, 10, 6, ${0.38 * shade})`;
      ctx.fillRect(x, y + wallHeight * 0.82, RAYS_PER_PIXEL + 1, Math.max(2, wallHeight * 0.035));
      ctx.fillStyle = `rgba(255, 226, 184, ${0.06 * shade})`;
      ctx.fillRect(x, y + wallHeight * 0.08, RAYS_PER_PIXEL + 1, Math.max(1, wallHeight * 0.018));
      drawWallScratches(x, y, wallHeight, hit, shade, time);
    }
  }

  drawSprites(depthBuffer, time);
  drawAtmosphere(width, height, time);
  drawFlashlight(width, height, time);
  drawFearFrame(width, height, time);
  drawLowStamina();
  drawShotTrace(time);
  drawGunOverlay(width, height, time);
  drawMinimap();
  drawScareFlash();
  ctx.restore();
}

function drawTexturedFloor(width, height, horizon, time) {
  const floor = ctx.createLinearGradient(0, horizon, 0, height);
  floor.addColorStop(0, palette.floorFar);
  floor.addColorStop(1, palette.floor);
  ctx.fillStyle = floor;
  ctx.fillRect(-24, horizon, width + 48, height - horizon + 24);

  ctx.save();
  ctx.globalAlpha = 0.32;
  const pattern = player.y > 11.4 && texturePatterns.basement ? texturePatterns.basement : texturePatterns.floor;
  if (pattern) {
    ctx.fillStyle = pattern;
    const scale = 1.0 + Math.max(0, player.y - 10) * 0.01;
    ctx.translate(width / 2, horizon);
    ctx.scale(scale, 0.42);
    ctx.rotate(-player.angle * 0.04);
    ctx.fillRect(-width, 0, width * 2, (height - horizon) * 2.4);
  }
  ctx.restore();

  const shadow = ctx.createLinearGradient(0, horizon, 0, height);
  shadow.addColorStop(0, "rgba(0,0,0,0.28)");
  shadow.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = shadow;
  ctx.fillRect(-24, horizon, width + 48, height - horizon + 24);

  if (!performanceProfile.lite) drawFloorStains(width, height, horizon, time);
}

function drawCeiling(width, horizon, time) {
  ctx.save();
  const pulse = 0.4 + Math.sin(time * 0.003) * 0.08;
  const beamCount = performanceProfile.lite ? 4 : 9;
  for (let i = 0; i < beamCount; i += 1) {
    const y = horizon - i * 34 - 18;
    const alpha = Math.max(0, 0.14 - i * 0.012);
    ctx.fillStyle = `rgba(190, 155, 96, ${alpha * pulse})`;
    ctx.fillRect(-24, y, width + 48, 2);
  }
  const ceilingShadow = ctx.createLinearGradient(0, 0, 0, horizon);
  ceilingShadow.addColorStop(0, "rgba(0, 0, 0, 0.72)");
  ceilingShadow.addColorStop(0.66, "rgba(0, 0, 0, 0.22)");
  ceilingShadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = ceilingShadow;
  ctx.fillRect(-24, -24, width + 48, horizon + 24);
  ctx.restore();
}

function drawWallScratches(x, y, wallHeight, hit, shade, time) {
  if (performanceProfile.lite) return;
  const patternSeed = Math.floor(hit.hitX * 11 + hit.hitY * 17);
  if (patternSeed % 9 === 0) {
    ctx.fillStyle = `rgba(28, 16, 8, ${0.18 * shade})`;
    const faceY = y + wallHeight * (0.22 + ((patternSeed % 5) * 0.08));
    ctx.fillRect(x, faceY, RAYS_PER_PIXEL + 1, Math.max(2, wallHeight * 0.045));
    ctx.fillStyle = `rgba(255, 225, 176, ${0.08 * shade})`;
    ctx.fillRect(x, faceY - wallHeight * 0.04, RAYS_PER_PIXEL + 1, Math.max(1, wallHeight * 0.012));
  }
  if ((patternSeed + Math.floor(time * 0.002)) % 23 === 0) {
    ctx.fillStyle = `rgba(255, 230, 190, ${0.1 * shade})`;
    ctx.fillRect(x, y + wallHeight * 0.35, RAYS_PER_PIXEL + 1, Math.max(1, wallHeight * 0.2));
  }
}

function drawFloorStains(width, height, horizon, time) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 10; i += 1) {
    const t = i / 10;
    const y = horizon + t * (height - horizon);
    const w = width * (0.12 + t * 0.42);
    const x = width * (0.16 + ((i * 0.19 + Math.sin(time * 0.0002 + i) * 0.02) % 0.68));
    ctx.fillStyle = i % 3 === 0 ? "rgba(86, 57, 33, 0.2)" : "rgba(255, 217, 126, 0.08)";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.18, 5 + t * 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAtmosphere(width, height, time) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  if (performanceProfile.lite) {
    ctx.fillStyle = "rgba(120, 96, 64, 0.035)";
  } else {
    const lamp = ctx.createRadialGradient(width * 0.52, height * 0.42, 10, width * 0.52, height * 0.42, width * 0.62);
    lamp.addColorStop(0, "rgba(255, 202, 126, 0.11)");
    lamp.addColorStop(0.45, "rgba(120, 96, 64, 0.055)");
    lamp.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = lamp;
  }
  ctx.fillRect(0, 0, width, height);

  const nearest = nearestCharacter();
  if (nearest && nearest.distance < 8) {
    const alpha = Math.max(0, 1 - nearest.distance / 8) * 0.18;
    const threat = ctx.createRadialGradient(width * 0.5, height * 0.52, 0, width * 0.5, height * 0.52, width * 0.7);
    threat.addColorStop(0, `rgba(198, 43, 42, ${alpha})`);
    threat.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = threat;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "rgba(234, 214, 174, 0.58)";
  for (const mote of dust) {
    const px = ((mote.x + time * 0.006 * mote.depth) % 1000) / 1000 * width;
    const py = ((mote.y + Math.sin(time * 0.0004 + mote.seed) * 70) % 1000) / 1000 * height;
    ctx.beginPath();
    ctx.arc(px, py, mote.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFlashlight(width, height, time) {
  if (!state.started) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const jitterX = Math.sin(time * 0.006) * 10 + Math.sin(time * 0.021) * 4;
  const jitterY = Math.cos(time * 0.005) * 6;
  if (performanceProfile.lite) {
    ctx.fillStyle = "rgba(255, 232, 198, 0.055)";
  } else {
    const beam = ctx.createRadialGradient(
      width * 0.5 + jitterX,
      height * 0.48 + jitterY,
      18,
      width * 0.5 + jitterX,
      height * 0.5 + jitterY,
      Math.max(width, height) * 0.54
    );
    beam.addColorStop(0, "rgba(255, 232, 198, 0.24)");
    beam.addColorStop(0.28, "rgba(255, 190, 130, 0.095)");
    beam.addColorStop(0.62, "rgba(140, 112, 76, 0.04)");
    beam.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = beam;
  }
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawFearFrame(width, height, time) {
  ctx.save();
  const nearest = nearestCharacter();
  const fear = nearest ? Math.max(0, 1 - nearest.distance / 8) : 0;
  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.1, width / 2, height / 2, width * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.58, `rgba(25, 13, 7, ${0.12 + fear * 0.16})`);
  vignette.addColorStop(1, `rgba(0,0,0, ${0.58 + fear * 0.22})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  if (fear > 0.2) {
    ctx.globalAlpha = fear * (0.18 + Math.sin(time * 0.018) * 0.06);
    ctx.strokeStyle = "#ff254e";
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, width - 16, height - 16);
  }
  ctx.restore();
}

function drawLowStamina() {
  if (player.stamina > 0.18 || !state.started) return;
  const alpha = (0.18 - player.stamina) / 0.18;
  ctx.save();
  ctx.globalAlpha = alpha * 0.22;
  ctx.fillStyle = "#1b0508";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.restore();
}

function drawShotTrace(time) {
  if (!state.shotLine || performance.now() > state.shotLine.until) return;
  const weapon = activeWeapon();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const alpha = (state.shotLine.until - performance.now()) / 140;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const startX = width * 0.5 + width * 0.18;
  const startY = height * 0.78;
  ctx.strokeStyle = weapon?.flash || "rgba(255, 230, 180, 0.9)";
  ctx.globalAlpha = alpha * 0.8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(width * 0.5 + Math.sin(time * 0.04) * 10, height * 0.5 + Math.cos(time * 0.03) * 8);
  ctx.stroke();
  ctx.restore();
}

function drawGunOverlay(width, height, time) {
  const weapon = activeWeapon();
  state.gunFlash = Math.max(0, state.gunFlash - 0.12);
  state.gunKick = Math.max(0, state.gunKick - 0.08);
  if (!state.started || !weapon) return;

  const kick = state.gunKick;
  const baseX = width * 0.68 + kick * 18;
  const baseY = height * 0.84 + kick * 22;
  const scale = Math.min(width, height) * 0.18;
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.rotate(-0.18 - kick * 0.08);

  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.beginPath();
  ctx.ellipse(0, scale * 0.3, scale * 0.62, scale * 0.18, -0.1, 0, Math.PI * 2);
  ctx.fill();

  const metal = ctx.createLinearGradient(-scale * 0.55, -scale * 0.12, scale * 0.58, scale * 0.08);
  metal.addColorStop(0, "#2a2520");
  metal.addColorStop(0.48, weapon.color);
  metal.addColorStop(1, "#100d0b");
  ctx.fillStyle = metal;
  roundRect(-scale * 0.58, -scale * 0.16, scale * 0.86, scale * 0.2, 4);
  ctx.fill();

  ctx.fillStyle = "#15100c";
  roundRect(-scale * 0.18, -scale * 0.02, scale * 0.22, scale * 0.48, 4);
  ctx.fill();

  if (weapon.id === "shotgun" || weapon.id === "rifle") {
    ctx.fillStyle = "#5a371f";
    roundRect(-scale * 0.72, -scale * 0.1, scale * 0.28, scale * 0.18, 4);
    ctx.fill();
    ctx.fillStyle = "#1a1714";
    ctx.fillRect(scale * 0.25, -scale * 0.11, scale * 0.38, scale * 0.07);
    ctx.fillRect(scale * 0.25, scale * 0.01, scale * 0.38, scale * 0.07);
  } else {
    ctx.fillStyle = "#1b1713";
    ctx.fillRect(scale * 0.22, -scale * 0.1, scale * 0.34, scale * 0.1);
  }

  if (state.gunFlash > 0) {
    ctx.globalCompositeOperation = "screen";
    const flash = ctx.createRadialGradient(scale * 0.65, -scale * 0.04, 0, scale * 0.65, -scale * 0.04, scale * 0.38);
    flash.addColorStop(0, weapon.flash);
    flash.addColorStop(0.42, "rgba(255, 160, 70, 0.48)");
    flash.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = state.gunFlash;
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(scale * 0.65, -scale * 0.04, scale * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawSprites(depthBuffer, time) {
  const sprites = [];
  for (const prop of props) {
    sprites.push({ ...prop, type: "prop", radius: Math.max(prop.w, prop.h) * 0.46 });
  }
  for (const obj of objects) {
    if (obj.hidden || obj.collected) continue;
    sprites.push(obj);
  }
  for (const weapon of weaponPickups) {
    if (!weapon.collected) sprites.push(weapon);
  }
  for (const character of activeCharacters()) {
    sprites.push({ ...character, type: "enemy" });
  }

  sprites.sort((a, b) => distanceTo(b.x, b.y) - distanceTo(a.x, a.y));

  for (const sprite of sprites) {
    const dx = sprite.x - player.x;
    const dy = sprite.y - player.y;
    const distance = Math.hypot(dx, dy);
    const angle = normalizeAngle(Math.atan2(dy, dx) - player.angle);
    if (Math.abs(angle) > FOV * 0.72 || distance < 0.2) continue;

    const screenX = (0.5 + angle / FOV) * window.innerWidth;
    const size = Math.min(window.innerHeight * 1.2, (window.innerHeight / distance) * (sprite.radius || 0.35));
    const rayIndex = Math.floor(screenX / RAYS_PER_PIXEL);
    if (depthBuffer[rayIndex] && depthBuffer[rayIndex] < distance - 0.25) continue;

    if (sprite.type === "enemy") {
      drawEnemy(screenX, window.innerHeight / 2 + Math.sin(player.bob) * 7, size, distance, time, sprite);
    } else if (sprite.type === "clue" || sprite.type === "key" || sprite.type === "tool" || sprite.type === "talisman" || sprite.type === "switch" || sprite.type === "weapon") {
      drawPickup(screenX, window.innerHeight / 2, size, sprite, time);
    } else {
      drawProp(screenX, window.innerHeight / 2, size, sprite, distance);
    }
  }
}

function drawEnemy(x, horizon, size, distance, time, character = enemy) {
  const alpha = Math.max(0.28, 1 - distance / 14);
  const bob = Math.sin(time * 0.008) * size * 0.06;
  const profile = pigSpriteProfile(character.kind);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, horizon + size * 0.22 + bob);
  ctx.scale(profile.scale, profile.scale);

  ctx.globalCompositeOperation = "screen";
  const glow = ctx.createRadialGradient(0, -size * 0.22, size * 0.05, 0, -size * 0.22, size * 0.78);
  glow.addColorStop(0, character.glow || "rgba(255, 56, 91, 0.72)");
  glow.addColorStop(0.48, character.glow?.replace("0.72", "0.22").replace("0.62", "0.2").replace("0.58", "0.2").replace("0.6", "0.2") || "rgba(255, 56, 91, 0.24)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, -size * 0.2, size * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.62, size * 0.52, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  drawPigFamilyFigure(size, profile, character, time);

  ctx.restore();
}

function pigSpriteProfile(kind) {
  const profiles = {
    george: { skin: "#ff9eb0", cloth: "#2f7ee6", eye: "rgba(255, 245, 190, 0.96)", scale: 0.78, lashes: false, glasses: false, beard: false, cheeks: true },
    grandpaPig: { skin: "#f49aaa", cloth: "#2f9b4f", eye: "rgba(255, 216, 140, 0.96)", scale: 1.18, lashes: false, glasses: true, beard: true, cheeks: true },
    mummyPig: { skin: "#ff9fb2", cloth: "#f05b95", eye: "rgba(255, 226, 235, 0.98)", scale: 1.06, lashes: true, glasses: false, beard: false, cheeks: true },
    daddyPig: { skin: "#f29aa8", cloth: "#35a8e0", eye: "rgba(202, 240, 255, 0.98)", scale: 1.22, lashes: false, glasses: true, beard: true, cheeks: true },
    grannyPig: { skin: "#f8a8b4", cloth: "#f08b38", eye: "rgba(255, 215, 160, 0.98)", scale: 1.12, lashes: true, glasses: true, beard: false, cheeks: true },
    peppa: { skin: "#ff9fc0", cloth: "#e83945", eye: "rgba(255, 230, 235, 0.98)", scale: 0.86, lashes: true, glasses: false, beard: false, cheeks: true },
    butcherPig: { skin: "#b68a76", cloth: "#4b120d", eye: "rgba(255, 54, 34, 0.98)", scale: 1.38, lashes: false, glasses: false, beard: true, cheeks: false, butcher: true }
  };
  return profiles[kind] || profiles.peppa;
}

function drawPigFamilyFigure(size, profile, character, time) {
  const body = ctx.createLinearGradient(-size * 0.38, -size * 0.12, size * 0.42, size * 0.7);
  body.addColorStop(0, profile.cloth);
  body.addColorStop(0.58, "#16080a");
  body.addColorStop(1, "#050202");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-size * 0.22, -size * 0.16);
  ctx.bezierCurveTo(-size * 0.42, size * 0.06, -size * 0.38, size * 0.44, -size * 0.52, size * 0.68);
  ctx.lineTo(size * 0.5, size * 0.68);
  ctx.bezierCurveTo(size * 0.36, size * 0.38, size * 0.42, size * 0.06, size * 0.22, -size * 0.16);
  ctx.closePath();
  ctx.fill();
  drawTatteredHem(size * 0.52, size * 0.94, size * 0.16, 10, "rgba(6, 2, 3, 0.95)");

  ctx.strokeStyle = "rgba(120, 8, 8, 0.75)";
  ctx.lineWidth = Math.max(2, size * 0.024);
  ctx.beginPath();
  ctx.moveTo(-size * 0.12, -size * 0.06);
  ctx.quadraticCurveTo(-size * 0.28, size * 0.2, -size * 0.18, size * 0.46);
  ctx.moveTo(size * 0.12, -size * 0.02);
  ctx.quadraticCurveTo(size * 0.24, size * 0.22, size * 0.16, size * 0.54);
  ctx.stroke();

  ctx.fillStyle = profile.skin;
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.43, size * 0.26, size * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * size * 0.2, -size * 0.63);
    ctx.rotate(side * 0.34);
    ctx.fillStyle = profile.skin;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.12);
    ctx.quadraticCurveTo(side * size * 0.1, size * 0.02, 0, size * 0.16);
    ctx.quadraticCurveTo(-side * size * 0.11, size * 0.02, 0, -size * 0.12);
    ctx.fill();
    ctx.restore();
  }

  const snout = ctx.createLinearGradient(-size * 0.13, -size * 0.42, size * 0.14, -size * 0.28);
  snout.addColorStop(0, "#ffc1ca");
  snout.addColorStop(1, "#c65f6f");
  ctx.fillStyle = snout;
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.35, size * 0.16, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(18, 3, 4, 0.92)";
  ctx.beginPath();
  ctx.arc(-size * 0.055, -size * 0.35, Math.max(1.2, size * 0.014), 0, Math.PI * 2);
  ctx.arc(size * 0.055, -size * 0.35, Math.max(1.2, size * 0.014), 0, Math.PI * 2);
  ctx.fill();

  drawGlowEyes(-size * 0.09, -size * 0.46, size * 0.09, Math.max(1.5, size * 0.018), profile.eye);

  if (profile.glasses) {
    ctx.strokeStyle = "rgba(40, 55, 85, 0.92)";
    ctx.lineWidth = Math.max(1.6, size * 0.015);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * size * 0.09, -size * 0.46, size * 0.055, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-size * 0.035, -size * 0.46);
    ctx.lineTo(size * 0.035, -size * 0.46);
    ctx.stroke();
  }

  if (profile.lashes) {
    ctx.strokeStyle = "rgba(24, 5, 8, 0.88)";
    ctx.lineWidth = Math.max(1, size * 0.01);
    for (const side of [-1, 1]) {
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(side * size * 0.09, -size * 0.48);
        ctx.lineTo(side * size * (0.11 + i * 0.01), -size * 0.52 - Math.abs(i) * size * 0.015);
        ctx.stroke();
      }
    }
  }

  if (profile.beard) {
    ctx.fillStyle = "rgba(80, 32, 38, 0.48)";
    for (let i = 0; i < 18; i += 1) {
      const a = i * 1.7;
      const rx = Math.cos(a) * size * 0.16;
      const ry = Math.sin(a * 1.3) * size * 0.07;
      ctx.beginPath();
      ctx.arc(rx, -size * 0.28 + ry, Math.max(1, size * 0.006), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(105, 4, 5, 0.86)";
  ctx.beginPath();
  ctx.ellipse(-size * 0.1, -size * 0.43, size * 0.08, size * 0.045, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(size * 0.06, -size * 0.46, size * 0.055, size * 0.24);

  if (profile.butcher) {
    ctx.fillStyle = "rgba(245, 218, 178, 0.24)";
    ctx.fillRect(-size * 0.24, -size * 0.1, size * 0.5, size * 0.58);
    ctx.strokeStyle = "rgba(245, 235, 216, 0.82)";
    ctx.lineWidth = Math.max(2, size * 0.028);
    ctx.beginPath();
    ctx.moveTo(size * 0.32, -size * 0.18);
    ctx.lineTo(size * 0.58, size * 0.3);
    ctx.stroke();
    const blade = ctx.createLinearGradient(size * 0.52, size * 0.36, size * 0.74, -size * 0.1);
    blade.addColorStop(0, "rgba(110, 110, 105, 0.95)");
    blade.addColorStop(0.48, "rgba(255, 255, 232, 0.98)");
    blade.addColorStop(1, "rgba(80, 80, 76, 0.9)");
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.28);
    ctx.lineTo(size * 0.72, -size * 0.14);
    ctx.lineTo(size * 0.82, -size * 0.02);
    ctx.lineTo(size * 0.6, size * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(135, 0, 0, 0.88)";
    ctx.beginPath();
    ctx.ellipse(size * 0.66, size * 0.17, size * 0.04, size * 0.12, 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  if (character.bloodSplatterUntil && performance.now() < character.bloodSplatterUntil) {
    const spray = (character.bloodSplatterUntil - performance.now()) / 700;
    ctx.fillStyle = `rgba(142, 0, 0, ${Math.min(0.85, spray)})`;
    for (let i = 0; i < 9; i += 1) {
      const angle = time * 0.006 + i * 1.7;
      const radius = size * (0.18 + (i % 4) * 0.08);
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * radius, -size * 0.28 + Math.sin(angle) * radius * 0.55, size * (0.015 + (i % 3) * 0.006), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTatteredHem(y, width, height, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-width / 2, y);
  for (let i = 0; i <= points; i += 1) {
    const x = -width / 2 + (width * i) / points;
    const drop = i % 2 === 0 ? height * 0.35 : height;
    ctx.lineTo(x, y + drop);
  }
  ctx.lineTo(width / 2, y);
  ctx.closePath();
  ctx.fill();
}

function drawGlowEyes(x1, y, x2, radius, color) {
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = radius * 5;
  ctx.beginPath();
  ctx.arc(x1, y, radius, 0, Math.PI * 2);
  ctx.arc(x2, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = "source-over";
}

function drawGrannyFigure(size) {
  const cloak = ctx.createLinearGradient(-size * 0.42, -size * 0.2, size * 0.44, size * 0.65);
  cloak.addColorStop(0, "#5a4a3d");
  cloak.addColorStop(0.32, "#2d221a");
  cloak.addColorStop(1, "#080605");
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, -size * 0.2);
  ctx.bezierCurveTo(-size * 0.42, size * 0.08, -size * 0.34, size * 0.42, -size * 0.5, size * 0.66);
  ctx.lineTo(size * 0.46, size * 0.66);
  ctx.bezierCurveTo(size * 0.34, size * 0.32, size * 0.4, size * 0.02, size * 0.18, -size * 0.2);
  ctx.closePath();
  ctx.fill();

  drawTatteredHem(size * 0.5, size * 0.9, size * 0.18, 9, "rgba(10, 7, 5, 0.92)");

  ctx.strokeStyle = "rgba(225, 213, 185, 0.38)";
  ctx.lineWidth = Math.max(1, size * 0.015);
  ctx.beginPath();
  ctx.moveTo(-size * 0.1, -size * 0.14);
  ctx.lineTo(-size * 0.03, size * 0.5);
  ctx.moveTo(size * 0.11, -size * 0.12);
  ctx.lineTo(size * 0.03, size * 0.52);
  ctx.stroke();

  ctx.fillStyle = "#bfb59f";
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.44, size * 0.22, size * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d8d4c8";
  ctx.beginPath();
  ctx.arc(-size * 0.12, -size * 0.56, size * 0.105, 0, Math.PI * 2);
  ctx.arc(size * 0.08, -size * 0.57, size * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(60, 48, 40, 0.75)";
  ctx.lineWidth = Math.max(1, size * 0.014);
  for (let i = -3; i <= 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * size * 0.045, -size * 0.62);
    ctx.quadraticCurveTo(i * size * 0.05 - size * 0.05, -size * 0.47, i * size * 0.04, -size * 0.34);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(232, 225, 208, 0.56)";
  ctx.lineWidth = Math.max(1, size * 0.018);
  ctx.beginPath();
  ctx.moveTo(-size * 0.12, -size * 0.24);
  ctx.lineTo(-size * 0.36, size * 0.28);
  ctx.moveTo(size * 0.14, -size * 0.22);
  ctx.lineTo(size * 0.36, size * 0.22);
  ctx.stroke();

  ctx.strokeStyle = "rgba(122, 93, 62, 0.86)";
  ctx.lineWidth = Math.max(2, size * 0.026);
  ctx.beginPath();
  ctx.moveTo(size * 0.43, -size * 0.12);
  ctx.lineTo(size * 0.58, size * 0.72);
  ctx.stroke();

  drawGlowEyes(-size * 0.065, -size * 0.45, size * 0.065, Math.max(1.4, size * 0.018), "rgba(255, 238, 210, 0.88)");
}

function drawCookFigure(size) {
  const coat = ctx.createLinearGradient(-size * 0.35, -size * 0.22, size * 0.35, size * 0.66);
  coat.addColorStop(0, "#6c5742");
  coat.addColorStop(0.45, "#2b1b12");
  coat.addColorStop(1, "#090504");
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(-size * 0.24, -size * 0.22);
  ctx.lineTo(size * 0.27, -size * 0.18);
  ctx.lineTo(size * 0.38, size * 0.66);
  ctx.lineTo(-size * 0.36, size * 0.66);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(210, 193, 162, 0.2)";
  ctx.fillRect(-size * 0.16, -size * 0.14, size * 0.3, size * 0.55);
  ctx.fillStyle = "rgba(80, 21, 13, 0.62)";
  ctx.fillRect(-size * 0.2, size * 0.12, size * 0.44, size * 0.045);

  ctx.fillStyle = "#b7a27f";
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.43, size * 0.2, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(35, 22, 14, 0.9)";
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.58, size * 0.22, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(225, 225, 210, 0.92)";
  ctx.lineWidth = Math.max(2, size * 0.03);
  ctx.beginPath();
  ctx.moveTo(size * 0.26, -size * 0.12);
  ctx.lineTo(size * 0.5, size * 0.28);
  ctx.stroke();

  const blade = ctx.createLinearGradient(size * 0.48, size * 0.32, size * 0.62, -size * 0.08);
  blade.addColorStop(0, "rgba(130, 130, 120, 0.95)");
  blade.addColorStop(0.5, "rgba(255, 255, 235, 0.98)");
  blade.addColorStop(1, "rgba(80, 80, 74, 0.92)");
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(size * 0.47, size * 0.28);
  ctx.lineTo(size * 0.63, -size * 0.1);
  ctx.lineTo(size * 0.72, -size * 0.02);
  ctx.lineTo(size * 0.55, size * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(120, 10, 8, 0.78)";
  ctx.beginPath();
  ctx.ellipse(size * 0.58, size * 0.18, size * 0.035, size * 0.09, 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "screen";
  drawGlowEyes(-size * 0.06, -size * 0.45, size * 0.06, Math.max(1.4, size * 0.018), "rgba(255, 190, 130, 0.9)");
  ctx.globalCompositeOperation = "source-over";
}

function drawChildFigure(size) {
  const body = ctx.createLinearGradient(-size * 0.28, -size * 0.1, size * 0.28, size * 0.58);
  body.addColorStop(0, "#22313a");
  body.addColorStop(0.5, "#101820");
  body.addColorStop(1, "#030506");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-size * 0.16, -size * 0.1);
  ctx.bezierCurveTo(-size * 0.3, size * 0.1, -size * 0.24, size * 0.42, -size * 0.34, size * 0.58);
  ctx.lineTo(size * 0.34, size * 0.58);
  ctx.bezierCurveTo(size * 0.24, size * 0.36, size * 0.32, size * 0.08, size * 0.16, -size * 0.1);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(177, 205, 220, 0.18)";
  ctx.fillRect(-size * 0.08, -size * 0.06, size * 0.16, size * 0.44);
  drawTatteredHem(size * 0.42, size * 0.62, size * 0.16, 7, "rgba(3, 5, 6, 0.94)");

  ctx.fillStyle = "#b8cad5";
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.32, size * 0.19, size * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(18, 22, 24, 0.92)";
  ctx.beginPath();
  ctx.arc(-size * 0.1, -size * 0.43, size * 0.09, 0, Math.PI * 2);
  ctx.arc(size * 0.1, -size * 0.43, size * 0.09, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(170, 205, 230, 0.6)";
  ctx.lineWidth = Math.max(1, size * 0.018);
  ctx.beginPath();
  ctx.moveTo(-size * 0.12, -size * 0.02);
  ctx.quadraticCurveTo(-size * 0.34, size * 0.12, -size * 0.4, size * 0.36);
  ctx.moveTo(size * 0.12, -size * 0.02);
  ctx.quadraticCurveTo(size * 0.36, size * 0.1, size * 0.42, size * 0.34);
  ctx.moveTo(-size * 0.1, size * 0.55);
  ctx.lineTo(-size * 0.18, size * 0.72);
  ctx.moveTo(size * 0.1, size * 0.55);
  ctx.lineTo(size * 0.18, size * 0.72);
  ctx.stroke();

  ctx.strokeStyle = "rgba(130, 190, 230, 0.34)";
  ctx.lineWidth = Math.max(1, size * 0.01);
  for (let i = 0; i < 5; i += 1) {
    const x = (-0.16 + i * 0.08) * size;
    ctx.beginPath();
    ctx.moveTo(x, -size * 0.48);
    ctx.lineTo(x + Math.sin(i) * size * 0.04, -size * 0.2);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "screen";
  drawGlowEyes(-size * 0.055, -size * 0.32, size * 0.055, Math.max(1.2, size * 0.016), "rgba(150, 220, 255, 0.86)");
  ctx.globalCompositeOperation = "source-over";
}

function drawMirrorFigure(size, time) {
  const sway = Math.sin(time * 0.006) * size * 0.05;
  const veil = ctx.createLinearGradient(sway - size * 0.32, -size * 0.58, sway + size * 0.32, size * 0.72);
  veil.addColorStop(0, "rgba(245, 248, 255, 0.24)");
  veil.addColorStop(0.55, "rgba(180, 190, 230, 0.1)");
  veil.addColorStop(1, "rgba(40, 46, 70, 0.22)");
  ctx.fillStyle = veil;
  ctx.beginPath();
  ctx.moveTo(sway - size * 0.08, -size * 0.5);
  ctx.bezierCurveTo(sway - size * 0.36, -size * 0.18, sway - size * 0.28, size * 0.34, sway - size * 0.42, size * 0.72);
  ctx.lineTo(sway + size * 0.42, size * 0.72);
  ctx.bezierCurveTo(sway + size * 0.28, size * 0.34, sway + size * 0.36, -size * 0.18, sway + size * 0.08, -size * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(245, 248, 255, 0.24)";
  ctx.lineWidth = Math.max(1, size * 0.012);
  for (let i = -3; i <= 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(sway + i * size * 0.055, -size * 0.46);
    ctx.bezierCurveTo(sway + i * size * 0.04, -size * 0.1, sway + i * size * 0.09, size * 0.22, sway + i * size * 0.03, size * 0.62);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(220, 225, 245, 0.34)";
  ctx.beginPath();
  ctx.ellipse(sway, -size * 0.43, size * 0.16, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(225, 230, 255, 0.45)";
  ctx.lineWidth = Math.max(1, size * 0.018);
  ctx.beginPath();
  ctx.moveTo(sway - size * 0.08, -size * 0.18);
  ctx.quadraticCurveTo(sway - size * 0.34, size * 0.05, sway - size * 0.25, size * 0.44);
  ctx.moveTo(sway + size * 0.08, -size * 0.18);
  ctx.quadraticCurveTo(sway + size * 0.34, size * 0.05, sway + size * 0.25, size * 0.44);
  ctx.stroke();

  ctx.strokeStyle = "rgba(235, 238, 255, 0.72)";
  ctx.lineWidth = Math.max(1, size * 0.01);
  ctx.beginPath();
  ctx.moveTo(sway - size * 0.18, -size * 0.05);
  ctx.lineTo(sway + size * 0.18, size * 0.08);
  ctx.moveTo(sway + size * 0.12, -size * 0.14);
  ctx.lineTo(sway - size * 0.12, size * 0.18);
  ctx.stroke();

  ctx.globalCompositeOperation = "screen";
  drawGlowEyes(sway - size * 0.055, -size * 0.42, sway + size * 0.055, Math.max(1.2, size * 0.015), "rgba(235, 235, 255, 0.78)");
  ctx.globalCompositeOperation = "source-over";
}

function drawPickup(x, horizon, size, sprite, time) {
  const pulse = 0.75 + Math.sin(time * 0.006 + sprite.x) * 0.18;
  const color = sprite.color || (sprite.type === "key" ? palette.key : palette.clue);
  ctx.save();
  ctx.translate(x, horizon + Math.sin(time * 0.004 + sprite.y) * 10);
  ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.52, size * 0.42, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = hexGlow(color, sprite.type === "key" ? 0.22 + pulse * 0.2 : 0.18 + pulse * 0.16);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  if (sprite.type === "weapon") {
    ctx.shadowColor = sprite.flash || "rgba(255, 220, 150, 0.75)";
    ctx.shadowBlur = size * 0.18;
    ctx.strokeStyle = sprite.color;
    ctx.lineWidth = Math.max(3, size * 0.07);
    ctx.beginPath();
    ctx.moveTo(-size * 0.42, size * 0.04);
    ctx.lineTo(size * 0.34, -size * 0.08);
    ctx.lineTo(size * 0.48, -size * 0.02);
    ctx.moveTo(-size * 0.08, size * 0.0);
    ctx.lineTo(-size * 0.2, size * 0.3);
    ctx.moveTo(size * 0.18, -size * 0.04);
    ctx.lineTo(size * 0.12, size * 0.16);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 240, 190, 0.78)";
    ctx.fillRect(size * 0.3, -size * 0.12, size * 0.18, Math.max(2, size * 0.035));
  } else if (sprite.type === "tool") {
    ctx.shadowColor = hexGlow(color, 0.8);
    ctx.shadowBlur = size * 0.2;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, size * 0.07);
    ctx.lineCap = "round";
    if (sprite.tool === "crowbar") {
      ctx.beginPath();
      ctx.moveTo(-size * 0.36, size * 0.26);
      ctx.lineTo(size * 0.34, -size * 0.28);
      ctx.quadraticCurveTo(size * 0.5, -size * 0.36, size * 0.42, -size * 0.12);
      ctx.stroke();
    } else if (sprite.tool === "fuse") {
      ctx.fillStyle = "#16313a";
      roundRect(-size * 0.28, -size * 0.18, size * 0.56, size * 0.36, size * 0.08);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(-size * 0.42, -size * 0.05, size * 0.14, size * 0.1);
      ctx.fillRect(size * 0.28, -size * 0.05, size * 0.14, size * 0.1);
    } else {
      ctx.fillStyle = "#3b2448";
      roundRect(-size * 0.24, -size * 0.18, size * 0.48, size * 0.36, size * 0.08);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -size * 0.02, size * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(size * 0.2, -size * 0.22, size * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (sprite.type === "talisman") {
    ctx.shadowColor = hexGlow(color, 0.85);
    ctx.shadowBlur = size * 0.24;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = -Math.PI / 2 + i * Math.PI / 3;
      const radius = i % 2 === 0 ? size * 0.28 : size * 0.2;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3d2314";
    ctx.lineWidth = Math.max(1, size * 0.035);
    ctx.beginPath();
    ctx.moveTo(-size * 0.08, -size * 0.16);
    ctx.lineTo(size * 0.04, -size * 0.02);
    ctx.lineTo(-size * 0.02, size * 0.16);
    ctx.stroke();
  } else if (sprite.type === "switch") {
    ctx.shadowColor = hexGlow(color, 0.85);
    ctx.shadowBlur = size * 0.22;
    ctx.fillStyle = "#182d2a";
    roundRect(-size * 0.34, -size * 0.26, size * 0.68, size * 0.52, size * 0.08);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, size * 0.045);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(-size * 0.2, -size * 0.04, size * 0.4, size * 0.08);
    ctx.fillStyle = "#101817";
    ctx.fillRect(-size * 0.04, -size * 0.19, size * 0.08, size * 0.38);
  } else if (sprite.type === "key") {
    ctx.shadowColor = "rgba(255, 210, 96, 0.75)";
    ctx.shadowBlur = size * 0.25;
    ctx.strokeStyle = palette.key;
    ctx.lineWidth = Math.max(3, size * 0.08);
    ctx.beginPath();
    ctx.arc(-size * 0.1, 0, size * 0.2, 0, Math.PI * 2);
    ctx.moveTo(size * 0.1, 0);
    ctx.lineTo(size * 0.55, 0);
    ctx.moveTo(size * 0.38, 0);
    ctx.lineTo(size * 0.38, size * 0.18);
    ctx.moveTo(size * 0.5, 0);
    ctx.lineTo(size * 0.5, size * 0.14);
    ctx.stroke();
  } else {
    ctx.shadowColor = hexGlow(color, 0.65);
    ctx.shadowBlur = size * 0.18;
    ctx.fillStyle = color;
    ctx.fillRect(-size * 0.28, -size * 0.18, size * 0.56, size * 0.36);
    ctx.fillStyle = "#6e2020";
    ctx.fillRect(-size * 0.18, -size * 0.04, size * 0.28, Math.max(2, size * 0.035));
    ctx.beginPath();
    ctx.arc(size * 0.18, size * 0.07, Math.max(2, size * 0.04), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function hexGlow(hex, alpha) {
  const value = String(hex || "#ffd568").replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(full, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawProp(x, horizon, size, prop, distance) {
  const shade = Math.max(0.25, 1 - distance / 12);
  ctx.save();
  ctx.translate(x, horizon + size * 0.25);
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.34, size * 0.52, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  const grad = ctx.createLinearGradient(-size * 0.5, -size * 0.28, size * 0.5, size * 0.28);
  grad.addColorStop(0, shadeColor(prop.color, shade * 0.72));
  grad.addColorStop(0.52, shadeColor(prop.color, shade * 1.1));
  grad.addColorStop(1, shadeColor(prop.color, shade * 0.55));
  ctx.fillStyle = grad;
  roundRect(-size * 0.5, -size * 0.28, size, size * 0.56, Math.max(3, size * 0.04));
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 230, 218, ${0.14 * shade})`;
  ctx.lineWidth = Math.max(1, size * 0.014);
  ctx.stroke();
  ctx.fillStyle = `rgba(0,0,0,${0.32 * shade})`;
  ctx.fillRect(-size * 0.48, size * 0.16, size * 0.96, size * 0.1);

  ctx.fillStyle = `rgba(255, 238, 210, ${0.12 * shade})`;
  if (prop.kind === "bed") {
    ctx.fillRect(-size * 0.45, -size * 0.1, size * 0.9, size * 0.14);
    ctx.fillStyle = `rgba(18, 12, 10, ${0.48 * shade})`;
    ctx.fillRect(-size * 0.45, -size * 0.31, size * 0.12, size * 0.34);
  } else if (prop.kind === "wardrobe" || prop.kind === "cabinet" || prop.kind === "shelf") {
    ctx.fillRect(-size * 0.04, -size * 0.25, Math.max(1, size * 0.018), size * 0.5);
    ctx.fillStyle = `rgba(12, 8, 6, ${0.5 * shade})`;
    ctx.beginPath();
    ctx.arc(size * 0.14, 0, Math.max(1.5, size * 0.018), 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === "fridge") {
    ctx.fillStyle = `rgba(217, 229, 213, ${0.2 * shade})`;
    ctx.fillRect(-size * 0.38, -size * 0.2, size * 0.76, size * 0.08);
    ctx.fillStyle = `rgba(14, 20, 15, ${0.44 * shade})`;
    ctx.fillRect(size * 0.24, -size * 0.16, size * 0.04, size * 0.32);
  } else if (prop.kind === "clock") {
    ctx.strokeStyle = `rgba(230, 210, 150, ${0.38 * shade})`;
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.beginPath();
    ctx.arc(0, -size * 0.08, size * 0.17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.08);
    ctx.lineTo(size * 0.08, -size * 0.16);
    ctx.moveTo(0, -size * 0.08);
    ctx.lineTo(0, size * 0.02);
    ctx.stroke();
  } else if (prop.kind === "chair") {
    ctx.strokeStyle = `rgba(232, 210, 170, ${0.2 * shade})`;
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.beginPath();
    ctx.moveTo(-size * 0.34, size * 0.14);
    ctx.quadraticCurveTo(0, size * 0.34, size * 0.34, size * 0.14);
    ctx.stroke();
  } else if (prop.kind === "table" || prop.kind === "counter") {
    ctx.fillStyle = `rgba(10, 7, 5, ${0.38 * shade})`;
    ctx.fillRect(-size * 0.38, size * 0.08, size * 0.08, size * 0.32);
    ctx.fillRect(size * 0.3, size * 0.08, size * 0.08, size * 0.32);
  }
  ctx.restore();
}

function drawMinimap() {
  const size = 104;
  const scale = size / world.width;
  const x = window.innerWidth - size - 16;
  const y = window.innerWidth <= 760 ? 96 : 70;
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "rgba(7,7,9,0.58)";
  roundRect(x - 8, y - 8, size + 16, size + 16, 6);
  ctx.fill();

  for (let my = 0; my < world.height; my += 1) {
    for (let mx = 0; mx < world.width; mx += 1) {
      const tile = map[my][mx];
      if (tile === "#") ctx.fillStyle = "#5a4632";
      else if (tile === "D") ctx.fillStyle = doorAt(mx, my)?.opened ? "#5f7a62" : "#2a1710";
      else ctx.fillStyle = "#15120f";
      ctx.fillRect(x + mx * scale, y + my * scale, scale + 0.2, scale + 0.2);
    }
  }

  for (const obj of objects) {
    if (obj.hidden || obj.collected) continue;
    ctx.fillStyle = obj.color || (obj.type === "key" ? palette.key : palette.clue);
    ctx.beginPath();
    if (obj.type === "switch") {
      ctx.rect(x + obj.x * scale - 2.8, y + obj.y * scale - 2.1, 5.6, 4.2);
      ctx.fill();
    } else if (obj.type === "tool") {
      ctx.fillRect(x + obj.x * scale - 2.7, y + obj.y * scale - 1.2, 5.4, 2.4);
    } else {
      ctx.arc(x + obj.x * scale, y + obj.y * scale, obj.type === "talisman" ? 2.6 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const weapon of weaponPickups) {
    if (weapon.collected) continue;
    ctx.fillStyle = weapon.flash;
    ctx.fillRect(x + weapon.x * scale - 2.3, y + weapon.y * scale - 1.2, 4.6, 2.4);
  }

  for (const character of activeCharacters()) {
    ctx.fillStyle = pigSpriteProfile(character.kind).skin;
    ctx.beginPath();
    ctx.arc(x + character.x * scale, y + character.y * scale, character.kind === "butcherPig" ? 3.2 : character.kind === "george" || character.kind === "peppa" ? 2.1 : 2.7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#eef4ff";
  ctx.beginPath();
  ctx.arc(x + player.x * scale, y + player.y * scale, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#eef4ff";
  ctx.beginPath();
  ctx.moveTo(x + player.x * scale, y + player.y * scale);
  ctx.lineTo(x + (player.x + Math.cos(player.angle) * 0.8) * scale, y + (player.y + Math.sin(player.angle) * 0.8) * scale);
  ctx.stroke();
  ctx.restore();
}

function drawScareFlash() {
  if (state.scare <= 0) return;
  ctx.fillStyle = `rgba(255, 25, 70, ${state.scare})`;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
}

function drawDeathScene(time) {
  if (!deathCtx || !deathCanvas || !state.deathScene) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const elapsed = (time - state.deathStartedAt) / 1000;
  deathCtx.clearRect(0, 0, width, height);

  const gradient = deathCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#050303");
  gradient.addColorStop(0.48, "#120806");
  gradient.addColorStop(1, "#000000");
  deathCtx.fillStyle = gradient;
  deathCtx.fillRect(0, 0, width, height);

  deathCtx.save();
  deathCtx.translate(Math.sin(elapsed * 9) * 5, Math.cos(elapsed * 7) * 4);
  drawDeathCorridor(width, height, elapsed);

  if (state.deathScene === "door") drawDeathDoor(width, height, elapsed);
  else if (state.deathScene === "basement") drawDeathBasement(width, height, elapsed);
  else if (state.deathScene === "mirror") drawDeathMirror(width, height, elapsed);
  else drawDeathClock(width, height, elapsed);

  drawDeathCaptor(width, height, elapsed);
  drawDeathVignette(width, height, elapsed);
  deathCtx.restore();
}

function project3D(point, cameraZ, width, height) {
  const z = Math.max(0.15, point.z - cameraZ);
  const focal = Math.min(width, height) * 0.88;
  return {
    x: width * 0.5 + (point.x / z) * focal,
    y: height * 0.56 - (point.y / z) * focal,
    scale: focal / z,
    z
  };
}

function fillPoly(points, color) {
  if (!points.length) return;
  deathCtx.fillStyle = color;
  deathCtx.beginPath();
  deathCtx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) deathCtx.lineTo(points[i].x, points[i].y);
  deathCtx.closePath();
  deathCtx.fill();
}

function strokePoly(points, color, width = 1) {
  if (!points.length) return;
  deathCtx.strokeStyle = color;
  deathCtx.lineWidth = width;
  deathCtx.beginPath();
  deathCtx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) deathCtx.lineTo(points[i].x, points[i].y);
  deathCtx.stroke();
}

function drawDeathCorridor(width, height, elapsed) {
  const cameraZ = elapsed * 2.1;
  for (let z = 1; z < 22; z += 1) {
    const depth = z + (cameraZ % 1);
    const near = project3D({ x: -2.9, y: -1.25, z: depth }, 0, width, height);
    const far = project3D({ x: 2.9, y: -1.25, z: depth }, 0, width, height);
    const alpha = Math.max(0, 0.34 - depth * 0.012);
    deathCtx.strokeStyle = `rgba(216, 177, 95, ${alpha})`;
    deathCtx.lineWidth = Math.max(1, 4 / depth);
    deathCtx.beginPath();
    deathCtx.moveTo(near.x, near.y);
    deathCtx.lineTo(far.x, far.y);
    deathCtx.stroke();
  }

  for (const x of [-2.8, -1.4, 0, 1.4, 2.8]) {
    const bottom = project3D({ x, y: -1.25, z: 1 }, 0, width, height);
    const top = project3D({ x, y: -1.25, z: 22 }, 0, width, height);
    strokePoly([bottom, top], "rgba(190, 140, 86, 0.22)", 1);
  }

  const leftWall = [
    project3D({ x: -3, y: 1.7, z: 1 }, 0, width, height),
    project3D({ x: -3, y: -1.25, z: 1 }, 0, width, height),
    project3D({ x: -3, y: -1.25, z: 22 }, 0, width, height),
    project3D({ x: -3, y: 1.7, z: 22 }, 0, width, height)
  ];
  const rightWall = [
    project3D({ x: 3, y: 1.7, z: 1 }, 0, width, height),
    project3D({ x: 3, y: -1.25, z: 1 }, 0, width, height),
    project3D({ x: 3, y: -1.25, z: 22 }, 0, width, height),
    project3D({ x: 3, y: 1.7, z: 22 }, 0, width, height)
  ];
  fillPoly(leftWall, "rgba(44, 24, 16, 0.58)");
  fillPoly(rightWall, "rgba(32, 18, 14, 0.62)");
}

function drawDeathBox(cx, cy, cz, w, h, d, color, edge, width, height, cameraZ = 0) {
  const p = (x, y, z) => project3D({ x: cx + x, y: cy + y, z: cz + z }, cameraZ, width, height);
  const front = [p(-w, h, -d), p(w, h, -d), p(w, -h, -d), p(-w, -h, -d)];
  const side = [p(w, h, -d), p(w, h, d), p(w, -h, d), p(w, -h, -d)];
  const top = [p(-w, h, -d), p(w, h, -d), p(w, h, d), p(-w, h, d)];
  fillPoly(side, "rgba(18, 10, 8, 0.92)");
  fillPoly(top, "rgba(88, 52, 32, 0.72)");
  fillPoly(front, color);
  strokePoly(front, edge, 2);
  return front;
}

function drawDeathDoor(width, height, elapsed) {
  const slam = Math.min(1, elapsed / 2.2);
  const z = 7.8 - Math.sin(slam * Math.PI) * 1.2;
  drawDeathBox(0, 0.25, z, 1.05 + slam * 0.8, 1.78 + slam * 0.42, 0.12, "rgba(58, 30, 18, 0.96)", "rgba(216,177,95,0.58)", width, height);
  const knob = project3D({ x: 0.62 + slam * 0.42, y: 0.04, z: z - 0.13 }, 0, width, height);
  deathCtx.fillStyle = "rgba(255, 214, 120, 0.9)";
  deathCtx.beginPath();
  deathCtx.arc(knob.x, knob.y, Math.max(4, knob.scale * 0.028), 0, Math.PI * 2);
  deathCtx.fill();
}

function drawDeathBasement(width, height, elapsed) {
  for (let i = 0; i < 8; i += 1) {
    const z = 3 + i * 1.7 - (elapsed * 1.2) % 1.7;
    const y = -0.75 - i * 0.03;
    drawDeathBox(0, y, z, 1.65, 0.08, 0.36, "rgba(68, 43, 28, 0.86)", "rgba(216,177,95,0.22)", width, height);
  }
  const swing = Math.sin(elapsed * 4.2) * 0.55;
  const lamp = project3D({ x: swing, y: 1.2, z: 5.2 }, 0, width, height);
  deathCtx.strokeStyle = "rgba(216,177,95,0.6)";
  deathCtx.lineWidth = 2;
  deathCtx.beginPath();
  deathCtx.moveTo(width * 0.5, 0);
  deathCtx.lineTo(lamp.x, lamp.y);
  deathCtx.stroke();
  const glow = deathCtx.createRadialGradient(lamp.x, lamp.y, 4, lamp.x, lamp.y, Math.max(60, lamp.scale * 0.48));
  glow.addColorStop(0, "rgba(255, 230, 150, 0.8)");
  glow.addColorStop(0.4, "rgba(155, 90, 38, 0.28)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  deathCtx.fillStyle = glow;
  deathCtx.fillRect(0, 0, width, height);
}

function drawDeathMirror(width, height, elapsed) {
  const z = 5.8 - Math.sin(Math.min(1, elapsed / 2) * Math.PI) * 0.9;
  const frame = drawDeathBox(0, 0.28, z, 1.2, 1.45, 0.08, "rgba(30, 36, 46, 0.72)", "rgba(210,220,255,0.6)", width, height);
  fillPoly(frame, "rgba(170, 190, 230, 0.12)");
  const center = project3D({ x: 0, y: 0.28, z: z - 0.1 }, 0, width, height);
  deathCtx.strokeStyle = "rgba(240, 245, 255, 0.78)";
  deathCtx.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    const angle = i * 0.7 + elapsed * 0.22;
    const len = center.scale * (0.18 + (i % 3) * 0.08);
    deathCtx.beginPath();
    deathCtx.moveTo(center.x, center.y);
    deathCtx.lineTo(center.x + Math.cos(angle) * len, center.y + Math.sin(angle) * len);
    deathCtx.stroke();
  }
}

function drawDeathClock(width, height, elapsed) {
  const clock = project3D({ x: 0, y: 0.25, z: 5.6 }, 0, width, height);
  const r = Math.max(42, clock.scale * 0.46);
  deathCtx.strokeStyle = "rgba(216,177,95,0.68)";
  deathCtx.lineWidth = 5;
  deathCtx.beginPath();
  deathCtx.arc(clock.x, clock.y, r, 0, Math.PI * 2);
  deathCtx.stroke();
  deathCtx.strokeStyle = "rgba(255,236,190,0.86)";
  deathCtx.lineWidth = 3;
  for (const speed of [5.2, -2.8, 9.5]) {
    deathCtx.beginPath();
    deathCtx.moveTo(clock.x, clock.y);
    deathCtx.lineTo(clock.x + Math.cos(elapsed * speed - Math.PI / 2) * r * 0.68, clock.y + Math.sin(elapsed * speed - Math.PI / 2) * r * 0.68);
    deathCtx.stroke();
  }
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    deathCtx.fillStyle = "rgba(216,177,95,0.76)";
    deathCtx.fillRect(clock.x + Math.cos(a) * r * 0.82 - 1, clock.y + Math.sin(a) * r * 0.82 - 1, 2, 2);
  }
}

function drawDeathCaptor(width, height, elapsed) {
  const z = Math.max(1.15, 5.2 - elapsed * 1.45);
  const p = project3D({ x: Math.sin(elapsed * 1.7) * 0.2, y: 0, z }, 0, width, height);
  const profile = pigSpriteProfile(state.lastCaptor?.kind);
  const big = state.lastCaptor?.kind === "daddyPig" || state.lastCaptor?.kind === "grandpaPig";
  const bodyH = p.scale * (big ? 1.02 : 0.82);
  const bodyW = p.scale * (big ? 0.34 : 0.27);
  deathCtx.fillStyle = "rgba(8,4,5,0.88)";
  deathCtx.beginPath();
  deathCtx.ellipse(p.x, p.y + bodyH * 0.16, bodyW, bodyH * 0.52, 0, 0, Math.PI * 2);
  deathCtx.fill();

  deathCtx.fillStyle = profile.skin;
  for (const side of [-1, 1]) {
    deathCtx.beginPath();
    deathCtx.ellipse(p.x + side * bodyW * 0.5, p.y - bodyH * 0.62, bodyW * 0.28, bodyW * 0.46, side * 0.32, 0, Math.PI * 2);
    deathCtx.fill();
  }
  deathCtx.beginPath();
  deathCtx.ellipse(p.x, p.y - bodyH * 0.42, bodyW * 0.82, bodyW * 0.72, 0, 0, Math.PI * 2);
  deathCtx.fill();

  deathCtx.fillStyle = "#ffc1ca";
  deathCtx.beginPath();
  deathCtx.ellipse(p.x, p.y - bodyH * 0.33, bodyW * 0.44, bodyW * 0.24, 0, 0, Math.PI * 2);
  deathCtx.fill();

  deathCtx.fillStyle = "rgba(95,0,0,0.9)";
  deathCtx.beginPath();
  deathCtx.ellipse(p.x - bodyW * 0.24, p.y - bodyH * 0.45, bodyW * 0.22, bodyW * 0.12, -0.35, 0, Math.PI * 2);
  deathCtx.fill();
  deathCtx.fillRect(p.x + bodyW * 0.08, p.y - bodyH * 0.47, bodyW * 0.18, bodyH * 0.25);

  deathCtx.globalCompositeOperation = "screen";
  deathCtx.fillStyle = profile.eye;
  for (const side of [-1, 1]) {
    deathCtx.beginPath();
    deathCtx.arc(p.x + side * bodyW * 0.25, p.y - bodyH * 0.43, Math.max(2, p.scale * 0.018), 0, Math.PI * 2);
    deathCtx.fill();
  }
  deathCtx.globalCompositeOperation = "source-over";
}

function drawDeathVignette(width, height, elapsed) {
  const pulse = 0.55 + Math.sin(elapsed * 8) * 0.08;
  const vignette = deathCtx.createRadialGradient(width / 2, height / 2, width * 0.08, width / 2, height / 2, width * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.5, `rgba(45,4,3,${0.18 + pulse * 0.12})`);
  vignette.addColorStop(1, `rgba(0,0,0,${0.72 + pulse * 0.18})`);
  deathCtx.fillStyle = vignette;
  deathCtx.fillRect(0, 0, width, height);
  deathCtx.fillStyle = `rgba(120, 0, 0, ${0.08 + pulse * 0.08})`;
  deathCtx.fillRect(0, 0, width, height);
}

function update(delta, time) {
  if (!state.started || state.ended) return;
  state.captureCooldown = Math.max(0, state.captureCooldown - delta);

  const move = { x: 0, y: 0 };
  const forwardX = Math.cos(player.angle);
  const forwardY = Math.sin(player.angle);
  const rightX = Math.cos(player.angle + Math.PI / 2);
  const rightY = Math.sin(player.angle + Math.PI / 2);

  if (keys.has("KeyW") || keys.has("ArrowUp") || mobileMove.forward) {
    move.x += forwardX;
    move.y += forwardY;
  }
  if (keys.has("KeyS") || keys.has("ArrowDown") || mobileMove.back) {
    move.x -= forwardX;
    move.y -= forwardY;
  }
  if (keys.has("KeyD") || keys.has("ArrowRight") || mobileMove.right) {
    move.x += rightX;
    move.y += rightY;
  }
  if (keys.has("KeyA") || keys.has("ArrowLeft") || mobileMove.left) {
    move.x -= rightX;
    move.y -= rightY;
  }

  const moving = Math.hypot(move.x, move.y) > 0.01;
  if (moving) {
    const len = Math.hypot(move.x, move.y);
    move.x /= len;
    move.y /= len;
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = sprint && player.stamina > 0.05 ? 3.25 : 2.05;
      if (sprint) {
        player.stamina = Math.max(0, player.stamina - currentDifficulty().staminaDrain * delta);
      } else {
        player.stamina = Math.min(1, player.stamina + currentDifficulty().staminaRecoverMoving * delta);
      }
    tryMove(player.x + move.x * speed * delta, player.y + move.y * speed * delta);
    player.bob += delta * speed * 7.5;
  } else {
    player.stamina = Math.min(1, player.stamina + currentDifficulty().staminaRecoverIdle * delta);
  }

  updateEnemy(delta, time);
  if (time >= nextTargetUpdate) {
    updateTarget();
    nextTargetUpdate = time + 90;
  }
  if (time >= nextUiUpdate) {
    updateUi();
    nextUiUpdate = time + 110;
  }
  state.scare = Math.max(0, state.scare - delta * 1.8);
}

function tryMove(nextX, nextY) {
  const radius = 0.22;
  if (!isSolid(nextX + Math.sign(nextX - player.x) * radius, player.y)) player.x = nextX;
  if (!isSolid(player.x, nextY + Math.sign(nextY - player.y) * radius)) player.y = nextY;
}

function moveActorToStart() {
  player.x = spawnPoint.x;
  player.y = spawnPoint.y;
  player.angle = spawnPoint.angle;
  player.pitch = 0;
  player.stamina = 1;
  player.bob = 0;
}

function characterIsActive(character) {
  if (character.deadUntil && performance.now() < character.deadUntil) return false;
  if (character.id === "butcherPig" && !state.powerOn && !state.hasKey) return false;
  const rule = currentDifficulty().active[character.id] || "start";
  if (rule === "start") return true;
  if (rule === "clue1") return state.clues.size >= 1 || state.hasKey;
  if (rule === "clue2") return state.clues.size >= 2 || state.hasKey;
  if (rule === "clue3") return state.clues.size >= 3 || state.hasKey;
  if (rule === "basement") return world.doors.basement.opened || state.hasKey;
  if (rule === "power") return state.powerOn || state.hasKey;
  if (rule === "key") return state.hasKey;
  return state.clues.size >= character.huntClues || state.hasKey;
}

function activeCharacters() {
  return characters.filter(characterIsActive);
}

function nearestCharacter() {
  let nearest = null;
  for (const character of activeCharacters()) {
    const distance = distanceTo(character.x, character.y);
    if (!nearest || distance < nearest.distance) nearest = { character, distance };
  }
  return nearest;
}

function resetCharactersToHome() {
  for (const character of characters) {
    character.x = character.homeX;
    character.y = character.homeY;
    character.pulse = 0;
    character.stunUntil = 0;
    character.deadUntil = 0;
    character.health = character.maxHealth;
    character.bloodSplatterUntil = 0;
    character.deathFall = 0;
    character.pathCache = null;
  }
}

function handleCapture(captor = enemy) {
  if (state.talismanCount > 0) {
    state.talismanCount -= 1;
    state.usedTalismanAt = performance.now();
    state.captureCooldown = 4.2;
    state.scare = 0.88;
    stunCharacter(captor, { stun: 3.2, knockback: 2.4, range: 4 }, distanceTo(captor.x, captor.y));
    showMessage("裂纹护符替你挡下了那只手。它碎成灰，怪物被震退了。", 2600);
    updateUi();
    return;
  }
  state.deaths += 1;
  state.scare = 0.95;
  state.lastCaptor = captor;
  keys.clear();
  Object.keys(mobileMove).forEach((key) => {
    mobileMove[key] = false;
  });

  endGame(false);
}

function collectWeapon(weapon) {
  weapon.collected = true;
  if (!state.weaponInventory.includes(weapon.id)) state.weaponInventory.push(weapon.id);
  state.activeWeapon = weapon.id;
  state.lastShotAt = -Infinity;
  showMessage(weapon.message, 3600);
  updateTarget();
  updateUi();
}

function activeWeapon() {
  return state.activeWeapon ? weapons[state.activeWeapon] : null;
}

function cycleWeapon() {
  if (!state.weaponInventory.length) {
    showMessage("你还没有捡到枪。", 1400);
    return;
  }
  const index = state.weaponInventory.indexOf(state.activeWeapon);
  const next = state.weaponInventory[(index + 1) % state.weaponInventory.length];
  state.activeWeapon = next;
  showMessage(`已切换：${weapons[next].name}`, 1200);
  updateUi();
}

function shootWeapon() {
  if (!state.started || state.ended) return;
  const weapon = activeWeapon();
  if (!weapon) {
    showMessage("手里没有枪。先在地上找发光的武器。", 1500);
    return;
  }
  const now = performance.now();
  if (now - state.lastShotAt < weapon.cooldown) return;
  state.lastShotAt = now;
  state.gunFlash = 1;
  state.gunKick = 1;

  const hit = findShotHit(weapon);
  if (hit) {
    damageCharacter(hit.character, weapon, hit.distance);
  } else {
    showMessage(`${weapon.name}的枪声在老宅里回荡。`, 700);
  }
}

function findShotHit(weapon) {
  let best = null;
  for (const character of activeCharacters()) {
    if (character.deadUntil && performance.now() < character.deadUntil) continue;
    const dx = character.x - player.x;
    const dy = character.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > weapon.range) continue;
    const angle = Math.abs(normalizeAngle(Math.atan2(dy, dx) - player.angle));
    const hitAngle = weapon.spread + character.radius * 0.16 / Math.max(distance, 0.4);
    if (angle > hitAngle) continue;
    if (!hasLineOfSight(player.x, player.y, character.x, character.y)) continue;
    if (!best || distance < best.distance) best = { character, distance };
  }
  return best;
}

function damageCharacter(character, weapon, distance) {
  const now = performance.now();
  const falloff = Math.max(0.45, 1 - distance / (weapon.range * 1.25));
  const damage = Math.round(weapon.damage * falloff);
  character.health = Math.max(0, (character.health ?? character.maxHealth ?? 100) - damage);
  character.bloodSplatterUntil = now + 520;
  character.lastHitAt = now;
  stunCharacter(character, weapon, distance);

  if (character.health <= 0) {
    killCharacter(character, weapon);
  } else {
    showMessage(`${weapon.name}打中了${character.label}，血溅到了墙上。`, 950);
  }
}

function killCharacter(character, weapon) {
  const now = performance.now();
  character.deadUntil = now + CHARACTER_RESPAWN_MS;
  character.stunUntil = 0;
  character.deathFall = 1;
  character.bloodSplatterUntil = now + 1600;
  state.shotLine = { x: character.x, y: character.y, until: now + 170 };
  showMessage(`${character.label}被${weapon.name}打死了，10 秒后会从老宅阴影里复活。`, 1900);
}

function stunCharacter(character, weapon, distance) {
  const now = performance.now();
  if (character.deadUntil && now < character.deadUntil) return;
  character.stunUntil = Math.max(character.stunUntil || 0, now + weapon.stun * 1000);
  const dx = character.x - player.x;
  const dy = character.y - player.y;
  const len = Math.hypot(dx, dy) || 1;
  const falloff = Math.max(0.35, 1 - distance / (weapon.range * 1.15));
  const push = weapon.knockback * falloff;
  const target = nearestOpenPoint(character.x + (dx / len) * push, character.y + (dy / len) * push);
  character.x = target.x;
  character.y = target.y;
  character.pulse = 0;
  state.shotLine = { x: character.x, y: character.y, until: now + 140 };
  state.scare = Math.max(state.scare, 0.12);
}

function findNextStepTowards(fromX, fromY, toX, toY) {
  const startX = Math.floor(fromX);
  const startY = Math.floor(fromY);
  const goalX = Math.floor(toX);
  const goalY = Math.floor(toY);
  if (startX === goalX && startY === goalY) return { x: toX, y: toY };
  if (!isTileWalkable(goalX, goalY)) return null;

  const keyFor = (x, y) => `${x},${y}`;
  const queue = [{ x: startX, y: startY }];
  const cameFrom = new Map([[keyFor(startX, startY), null]]);
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.x === goalX && current.y === goalY) break;
    for (const direction of directions) {
      const nx = current.x + direction.x;
      const ny = current.y + direction.y;
      const key = keyFor(nx, ny);
      if (cameFrom.has(key) || !isTileWalkable(nx, ny)) continue;
      cameFrom.set(key, current);
      queue.push({ x: nx, y: ny });
    }
  }

  const goalKey = keyFor(goalX, goalY);
  if (!cameFrom.has(goalKey)) return null;

  let current = { x: goalX, y: goalY };
  let previous = cameFrom.get(goalKey);
  while (previous && !(previous.x === startX && previous.y === startY)) {
    current = previous;
    previous = cameFrom.get(keyFor(current.x, current.y));
  }

  return { x: current.x + 0.5, y: current.y + 0.5 };
}

function nearestOpenPoint(x, y) {
  if (!isSolid(x, y)) return { x, y };
  const baseX = Math.floor(x);
  const baseY = Math.floor(y);
  for (let radius = 1; radius <= 3; radius += 1) {
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        const px = baseX + ox + 0.5;
        const py = baseY + oy + 0.5;
        if (!isSolid(px, py)) return { x: px, y: py };
      }
    }
  }
  return { x: spawnPoint.x, y: spawnPoint.y };
}

function updateEnemy(delta, time) {
  updateCharacterRespawns();
  for (const character of activeCharacters()) {
    updateCharacter(character, delta, time);
  }
}

function updateCharacterRespawns() {
  const now = performance.now();
  for (const character of characters) {
    if (!character.deadUntil || now < character.deadUntil) continue;
    character.deadUntil = 0;
    character.health = character.maxHealth;
    character.deathFall = 0;
    character.stunUntil = now + 500;
    const point = nearestOpenPoint(character.homeX, character.homeY);
    character.x = point.x;
    character.y = point.y;
    character.pulse = 0;
    character.bloodSplatterUntil = now + 400;
    showMessage(`${character.label}又从阴影里爬回来了。`, 1200);
  }
}

function updateCharacter(character, delta, time) {
  if (character.deadUntil && performance.now() < character.deadUntil) return;
  if (character.stunUntil && performance.now() < character.stunUntil) {
    character.pulse += delta * 10;
    return;
  }
  const difficulty = currentDifficulty();
  const dx = player.x - character.x;
  const dy = player.y - character.y;
  const distance = Math.hypot(dx, dy);
  const seesPlayer = state.captureCooldown <= 0 && hasLineOfSight(character.x, character.y, player.x, player.y) && distance < character.vision * difficulty.vision;
  const noiseActive = state.noiseTrapPosition && performance.now() < state.noiseTrapAt;
  const noiseDistance = noiseActive ? Math.hypot(character.x - state.noiseTrapPosition.x, character.y - state.noiseTrapPosition.y) : Infinity;
  const hearsNoise = noiseActive && noiseDistance < (character.prefersNoise ? 18 : 12);
  const hunt = seesPlayer || hearsNoise || state.hasKey || state.clues.size >= character.huntClues;
  const chaseX = hearsNoise && !seesPlayer ? state.noiseTrapPosition.x : player.x;
  const chaseY = hearsNoise && !seesPlayer ? state.noiseTrapPosition.y : player.y;
  const pathTarget = hunt && !seesPlayer && !hearsNoise ? cachedPathTarget(character, player.x, player.y, time) : null;
  const phase = time * 0.00042 + characters.indexOf(character) * 1.37;
  const targetX = seesPlayer || hearsNoise ? chaseX : pathTarget?.x ?? character.homeX + Math.sin(phase) * character.roamX;
  const targetY = seesPlayer || hearsNoise ? chaseY : pathTarget?.y ?? character.homeY + Math.cos(phase * 0.9) * character.roamY;
  const tx = targetX - character.x;
  const ty = targetY - character.y;
  const len = Math.hypot(tx, ty);
  if (len > 0.05) {
    const pressure = character.kind === "george" || character.kind === "peppa" ? 0.12 : 0.18;
    const speed = (character.speed + state.clues.size * pressure * difficulty.pressure + (state.hasKey ? 0.46 : 0) + (distance < 3 ? 0.34 : 0)) * difficulty.speed;
    const nextX = character.x + (tx / len) * speed * delta;
    const nextY = character.y + (ty / len) * speed * delta;
    if (!isSolid(nextX, character.y)) character.x = nextX;
    if (!isSolid(character.x, nextY)) character.y = nextY;
  }

  character.pulse += delta * 6;
  if (state.captureCooldown <= 0 && distance < character.catchDistance * difficulty.catchDistance) {
    handleCapture(character);
  } else if (distance < 2.4) {
    state.scare = Math.max(state.scare, 0.18);
  }
}

function cachedPathTarget(character, targetX, targetY, time) {
  const targetCell = `${Math.floor(targetX)},${Math.floor(targetY)}`;
  const cache = character.pathCache;
  if (!cache || cache.targetCell !== targetCell || time >= cache.expiresAt) {
    const jitter = ((character.id?.length || 1) * 29) % 120;
    character.pathCache = {
      targetCell,
      expiresAt: time + 240 + jitter,
      point: findNextStepTowards(character.x, character.y, targetX, targetY)
    };
  }
  return character.pathCache.point;
}

function hasLineOfSight(ax, ay, bx, by) {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.08);
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const tile = tileAt(x, y);
    if (tile === "#" || (tile === "D" && isSolid(x, y))) return false;
  }
  return true;
}

function updateTarget() {
  state.currentTarget = null;
  ui.hint.classList.remove("is-active");
  ui.interact.classList.remove("is-ready");

  const forwardX = Math.cos(player.angle);
  const forwardY = Math.sin(player.angle);
  const candidates = [];

  for (const obj of objects) {
    if (obj.hidden || obj.collected) continue;
    candidates.push(obj);
  }
  for (const weapon of weaponPickups) {
    if (!weapon.collected) candidates.push(weapon);
  }
  if (hasTool("musicbox") && performance.now() > state.noiseTrapAt) {
    candidates.push({
      id: "noiseTrap",
      type: "trap",
      x: player.x + forwardX * 0.85,
      y: player.y + forwardY * 0.85,
      radius: 0.35,
      label: "放下诱饵"
    });
  }

  for (const door of Object.values(world.doors)) {
    if (door.opened && door.id !== "front") continue;
    const tileCenter = { x: door.x + 0.5, y: door.y + 0.5 };
    candidates.push({ ...door, type: "door", x: tileCenter.x, y: tileCenter.y, radius: 0.35 });
  }

  let best = null;
  let bestScore = -Infinity;
  for (const item of candidates) {
    const dx = item.x - player.x;
    const dy = item.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > INTERACTION_DISTANCE) continue;
    const dot = (dx / distance) * forwardX + (dy / distance) * forwardY;
    if (dot < 0.45) continue;
    const score = dot - distance * 0.1;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  if (best) {
    state.currentTarget = best;
    ui.hint.textContent = best.label;
    ui.hint.classList.add("is-active");
    ui.interact.classList.add("is-ready");
  }
}

function interact() {
  if (!state.started || state.ended) return;
  const target = state.currentTarget;
  if (!target) {
    showMessage("这里没有能用的东西。继续找发光物、锁住的门和地下室入口。", 1800);
    return;
  }

  if (target.type === "clue") {
    target.collected = true;
    state.clues.add(target.id);
    showMessage(target.message);
    revealProgression();
    updateTarget();
    return;
  }

  if (target.type === "key") {
    if (!state.powerOn || !state.clues.has("ledger")) {
      showMessage("尸体的手指像锁一样扣住钥匙。也许停尸间账本能告诉你怎么拿。");
      return;
    }
    if (!postPowerClues.every((id) => state.clues.has(id))) {
      showMessage("钥匙柜上刻着三枚符号。录音带、温室血字和账本需要全部对上。");
      return;
    }
    target.collected = true;
    state.hasKey = true;
    showMessage(target.message);
    state.scare = Math.max(state.scare, 0.45);
    updateTarget();
    return;
  }

  if (target.type === "tool") {
    target.collected = true;
    collectTool(target);
    updateTarget();
    return;
  }

  if (target.type === "talisman") {
    target.collected = true;
    state.talismanCount += 1;
    showMessage(target.message);
    updateTarget();
    updateUi();
    return;
  }

  if (target.type === "switch") {
    useSwitch(target);
    return;
  }

  if (target.type === "trap") {
    placeNoiseTrap();
    return;
  }

  if (target.type === "weapon") {
    collectWeapon(target);
    return;
  }

  if (target.type === "door") {
    const door = world.doors[target.id];
    if (door.id === "front") {
      if (!state.hasKey) {
        showMessage("前门被三道锁扣住。你需要地下室钥匙。");
        return;
      }
      endGame(true);
      return;
    }
    if (door.needsTool && !hasTool(door.needsTool)) {
      showMessage(door.needsTool === "crowbar" ? "门被木板钉死。你需要撬棍。" : "门锁被奇怪的工具卡住了。");
      return;
    }
    if (door.needsPower && !state.powerOn) {
      showMessage("电子锁没有电。地下锅炉房的配电箱也许还能救活它。");
      return;
    }
    if (door.needsCode && !basementCodeClues.every((id) => state.clues.has(id))) {
      showMessage("地下室门锁要三位密码。墙上有刮痕：先找完三条线索。");
      return;
    }
    door.opened = true;
    map[door.y][door.x] = ".";
    showMessage(door.id === "basement" ? "密码 427 正确。地下室门缓慢打开，冷气从楼梯下涌上来。" : "门开了。");
  }
}

function revealKey() {
  const key = objects.find((obj) => obj.id === "key");
  key.hidden = false;
  showMessage("六条线索拼成了完整仪式。停尸间尸体手里的钥匙松动了。", 4300);
}

function collectTool(target) {
  showMessage(target.message);
  updateUi();
}

function hasTool(tool) {
  return objects.some((obj) => obj.type === "tool" && obj.tool === tool && obj.collected);
}

function useSwitch(target) {
  if (!hasTool("fuse")) {
    showMessage("配电箱里少了一枚蓝色保险丝。电闸旁边有烧焦的儿童手印。");
    return;
  }
  if (state.powerOn) {
    showMessage("配电箱已经恢复供电。墙里传来很轻的刮擦声。", 1600);
    return;
  }
  state.powerOn = true;
  target.collected = true;
  revealProgression();
  showMessage(target.message, 5200);
  state.scare = Math.max(state.scare, 0.55);
  updateTarget();
  updateUi();
}

function placeNoiseTrap() {
  if (!hasTool("musicbox")) {
    showMessage("你还没有能制造声响的东西。");
    return;
  }
  const forwardX = Math.cos(player.angle);
  const forwardY = Math.sin(player.angle);
  const point = nearestOpenPoint(player.x + forwardX * 1.2, player.y + forwardY * 1.2);
  state.noiseTrapPosition = point;
  state.noiseTrapAt = performance.now() + 7200;
  state.scare = Math.max(state.scare, 0.2);
  showMessage("发条玩具开始唱走调的童谣。附近的东西会被声音吸过去。", 2400);
}

function revealProgression() {
  const basementReady = basementCodeClues.every((id) => state.clues.has(id));
  const powerbox = objects.find((obj) => obj.id === "powerbox");
  if (basementReady && powerbox?.hidden) {
    powerbox.hidden = false;
    showMessage("三条线索拼出了密码 427。地下楼梯深处的配电箱亮了一下。", 4300);
  }
  if (state.powerOn) {
    for (const id of hiddenUntilPower) {
      const clue = objects.find((obj) => obj.id === id);
      if (clue) clue.hidden = false;
    }
  }
  const key = objects.find((obj) => obj.id === "key");
  if (key && state.powerOn && postPowerClues.every((id) => state.clues.has(id))) {
    const wasHidden = key.hidden;
    key.hidden = false;
    if (wasHidden) showMessage("录音、血字和账本对上了。停尸间钥匙柜传来一声咔哒。", 4200);
  }
}

function updateUi() {
  const collectedClues = state.clues.size;
  const weapon = activeWeapon();
  if (ui.weaponState) ui.weaponState.textContent = weapon ? `${weapon.name} ∞` : "无";
  if (ui.fire) ui.fire.classList.toggle("has-weapon", Boolean(weapon));
  if (ui.deathState) ui.deathState.textContent = `${state.deaths} / ${MAX_DEATHS}`;
  ui.staminaFill.style.width = `${Math.round(player.stamina * 100)}%`;
  ui.staminaText.textContent = `${Math.round(player.stamina * 100)}%`;
  ui.staminaFill.style.background =
    player.stamina < 0.22 ? "linear-gradient(90deg, #ff5d7c, #f5c75d)" : "linear-gradient(90deg, #61c6b6, #8bb3ff)";

  ui.clueCount.textContent = `${collectedClues} / ${clueOrder.length}`;
  ui.progressFill.style.width = `${(collectedClues / clueOrder.length) * 100}%`;
  ui.keyState.textContent = state.hasKey ? "已取得" : objects.find((obj) => obj.id === "key")?.hidden === false ? "可取得" : state.powerOn ? "追踪中" : "未通电";
  if (ui.weaponState && !weapon) {
    const tools = [
      hasTool("crowbar") ? "撬棍" : null,
      hasTool("fuse") ? "保险丝" : null,
      hasTool("musicbox") ? "诱饵" : null,
      state.talismanCount > 0 ? `护符${state.talismanCount}` : null
    ].filter(Boolean);
    ui.weaponState.textContent = tools.join(" / ") || "无";
  }

  for (const clueId of clueOrder) {
    ui.slots[clueId]?.classList.toggle("is-filled", state.clues.has(clueId));
  }
  for (const slot of toolSlots) {
    ui.slots[slot]?.classList.toggle("is-filled", hasTool(slot));
  }
  ui.slots.talisman?.classList.toggle("is-filled", state.talismanCount > 0);
  ui.slots.key?.classList.toggle("is-filled", state.hasKey);

  const nearest = nearestCharacter();
  const distance = nearest?.distance ?? Infinity;
  const threatName = nearest?.character.label ?? "安全";
  let dangerLevel = "far";
  if (distance < 2.2) {
    ui.dangerState.textContent = `${threatName} 身后`;
    dangerLevel = "close";
  } else if (distance < 4.7) {
    ui.dangerState.textContent = `${threatName} 很近`;
    dangerLevel = "close";
  } else if (distance < 8.4) {
    ui.dangerState.textContent = `${threatName} 靠近`;
    dangerLevel = "near";
  } else {
    ui.dangerState.textContent = "远";
  }
  document.body.classList.toggle("danger-near", dangerLevel === "near");
  document.body.classList.toggle("danger-close", dangerLevel === "close");

  const missingBasementClues = basementCodeClues.filter((id) => !state.clues.has(id));
  const missingFinalClues = postPowerClues.filter((id) => !state.clues.has(id));
  if (missingBasementClues.length) ui.task.textContent = `先找三条密码线索：还差 ${missingBasementClues.map((id) => clueLabels[id]).join("、")}。`;
  else if (!world.doors.basement.opened) ui.task.textContent = "密码已拼出：427。去中间走廊打开地下室门。";
  else if (!hasTool("crowbar")) ui.task.textContent = "地下室开了。先找撬棍，撬开东翼和工具间的封门。";
  else if (!hasTool("fuse")) ui.task.textContent = "用撬棍探索东翼，找到蓝色保险丝。";
  else if (!state.powerOn) ui.task.textContent = "带保险丝去锅炉房配电箱，把老宅的电恢复。";
  else if (missingFinalClues.length) ui.task.textContent = `通电后新房间醒了。还差 ${missingFinalClues.map((id) => clueLabels[id]).join("、")}。`;
  else if (!state.hasKey) ui.task.textContent = "六条线索对上了。去停尸间尸体手里拿前门钥匙。";
  else ui.task.textContent = "钥匙到手。回到玄关，从前门逃出去。";

  if (performance.now() > state.messageUntil) {
    ui.message.classList.remove("is-active");
  }
}

function showMessage(text, duration = 4200) {
  ui.message.textContent = text;
  ui.message.classList.add("is-active");
  state.messageUntil = performance.now() + duration;
}

function clampPitch(value) {
  return Math.max(-0.82, Math.min(0.72, value));
}

const horrorMelody = [
  { note: 81, beats: 0.5, gain: 0.11 },
  { note: 84, beats: 0.5, gain: 0.08 },
  { note: 83, beats: 0.5, gain: 0.1 },
  { note: 76, beats: 0.5, gain: 0.08 },
  { note: 78, beats: 1, gain: 0.1 },
  { note: null, beats: 0.5, gain: 0 },
  { note: 75, beats: 0.5, gain: 0.08 },
  { note: 72, beats: 1, gain: 0.1 },
  { note: 69, beats: 0.5, gain: 0.1 },
  { note: 72, beats: 0.5, gain: 0.08 },
  { note: 71, beats: 0.5, gain: 0.09 },
  { note: 66, beats: 0.5, gain: 0.07 },
  { note: 68, beats: 1, gain: 0.1 },
  { note: null, beats: 0.5, gain: 0 },
  { note: 64, beats: 0.5, gain: 0.08 },
  { note: 69, beats: 1, gain: 0.11 }
];

const horrorBass = [45, 44, 41, 42, 38, 40, 41, 44];

function ensureAudio() {
  if (state.audioReady) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const audioContext = new AudioContext();
  const master = audioContext.createGain();
  const musicGain = audioContext.createGain();
  const bassGain = audioContext.createGain();
  const padGain = audioContext.createGain();
  const padFilter = audioContext.createBiquadFilter();
  const delay = audioContext.createDelay(1.2);
  const delayFeedback = audioContext.createGain();
  const wetGain = audioContext.createGain();
  const reverb = audioContext.createConvolver();
  const compressor = audioContext.createDynamicsCompressor();
  const lfo = audioContext.createOscillator();
  const lfoGain = audioContext.createGain();
  const padOscillators = [43, 50, 55].map((midi, index) => {
    const osc = audioContext.createOscillator();
    osc.type = index === 0 ? "sine" : "triangle";
    osc.frequency.value = midiToFrequency(midi);
    osc.detune.value = index === 1 ? -7 : index === 2 ? 5 : 0;
    return osc;
  });

  master.gain.value = 0.001;
  musicGain.gain.value = 0.26;
  bassGain.gain.value = 0.16;
  padGain.gain.value = 0.055;
  padFilter.type = "lowpass";
  padFilter.frequency.value = 240;
  padFilter.Q.value = 4.5;
  delay.delayTime.value = 0.36;
  delayFeedback.gain.value = 0.28;
  wetGain.gain.value = 0.18;
  lfo.type = "sine";
  lfo.frequency.value = 0.045;
  lfoGain.gain.value = 42;
  reverb.buffer = createReverbImpulse(audioContext, 2.7, 2.1);

  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.28;

  for (const osc of padOscillators) {
    osc.connect(padFilter);
    osc.start();
  }

  lfo.connect(lfoGain);
  lfoGain.connect(padFilter.frequency);
  padFilter.connect(padGain);
  padGain.connect(master);
  musicGain.connect(master);
  bassGain.connect(master);
  musicGain.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(wetGain);
  musicGain.connect(reverb);
  reverb.connect(wetGain);
  wetGain.connect(master);
  master.connect(compressor);
  compressor.connect(audioContext.destination);
  lfo.start();

  state.audioContext = audioContext;
  state.audioNodes = {
    master,
    musicGain,
    bassGain,
    padGain,
    padFilter,
    delayFeedback,
    wetGain,
    nextNoteTime: 0,
    melodyStep: 0,
    bassStep: 0
  };
  state.audioReady = true;
}

function startAudio() {
  ensureAudio();
  if (!state.audioContext) return;
  state.audioContext.resume?.();
  if (state.audioNodes) {
    state.audioNodes.nextNoteTime = state.audioContext.currentTime + 0.08;
    state.audioNodes.melodyStep = 0;
    state.audioNodes.bassStep = 0;
  }
  state.audioStarted = true;
}

function updateAudio(time) {
  if (!state.audioStarted || !state.audioContext || !state.audioNodes) return;
  const now = state.audioContext.currentTime;
  const nearest = nearestCharacter();
  const danger = nearest ? Math.max(0, 1 - nearest.distance / 8.5) : 0;
  const playing = state.started && !state.ended;
  state.audioNodes.master.gain.setTargetAtTime(playing ? 0.72 : 0.12, now, 0.18);
  state.audioNodes.musicGain.gain.setTargetAtTime(playing ? 0.24 + danger * 0.1 : 0.05, now, 0.16);
  state.audioNodes.bassGain.gain.setTargetAtTime(playing ? 0.13 + danger * 0.08 : 0.025, now, 0.18);
  state.audioNodes.padGain.gain.setTargetAtTime(playing ? 0.045 + danger * 0.055 : 0.012, now, 0.24);
  state.audioNodes.padFilter.frequency.setTargetAtTime(170 + danger * 360 + Math.sin(time * 0.0011) * 35, now, 0.2);
  state.audioNodes.delayFeedback.gain.setTargetAtTime(0.24 + danger * 0.14, now, 0.22);
  state.audioNodes.wetGain.gain.setTargetAtTime(0.14 + danger * 0.1, now, 0.2);

  if (playing) scheduleHorrorMusic(danger);
}

function scheduleHorrorMusic(danger) {
  const audioContext = state.audioContext;
  const nodes = state.audioNodes;
  if (!audioContext || !nodes) return;
  const lookAhead = 0.85;
  if (nodes.nextNoteTime < audioContext.currentTime - 0.1) {
    nodes.nextNoteTime = audioContext.currentTime + 0.05;
  }

  while (nodes.nextNoteTime < audioContext.currentTime + lookAhead) {
    const beat = 60 / (68 + danger * 12);
    const event = horrorMelody[nodes.melodyStep % horrorMelody.length];
    const duration = event.beats * beat;

    if (event.note !== null) {
      playMusicBoxNote(event.note, nodes.nextNoteTime, duration * 0.92, event.gain * (1 + danger * 0.35));
      if (danger > 0.58 && nodes.melodyStep % 8 === 6) {
        playMusicBoxNote(event.note + 6, nodes.nextNoteTime + duration * 0.08, duration * 0.62, event.gain * 0.42);
      }
    }

    if (nodes.melodyStep % 4 === 0) {
      const bass = horrorBass[nodes.bassStep % horrorBass.length];
      playBassNote(bass, nodes.nextNoteTime, beat * 3.7, 0.13 + danger * 0.07);
      nodes.bassStep += 1;
    }

    nodes.nextNoteTime += duration;
    nodes.melodyStep += 1;
  }
}

function playMusicBoxNote(midi, start, duration, velocity) {
  const audioContext = state.audioContext;
  const nodes = state.audioNodes;
  const freq = midiToFrequency(midi);
  const carrier = audioContext.createOscillator();
  const overtone = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const overtoneGain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();

  carrier.type = "sine";
  overtone.type = "triangle";
  carrier.frequency.setValueAtTime(freq, start);
  overtone.frequency.setValueAtTime(freq * 2.01, start);
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq * 2.2, start);
  filter.Q.value = 2.8;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, velocity), start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.08, duration));
  overtoneGain.gain.setValueAtTime(0.34, start);

  carrier.connect(gain);
  overtone.connect(overtoneGain);
  overtoneGain.connect(gain);
  gain.connect(filter);
  filter.connect(nodes.musicGain);
  carrier.start(start);
  overtone.start(start);
  carrier.stop(start + duration + 0.06);
  overtone.stop(start + duration + 0.06);
}

function playBassNote(midi, start, duration, velocity) {
  const audioContext = state.audioContext;
  const nodes = state.audioNodes;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  osc.type = "sine";
  osc.frequency.setValueAtTime(midiToFrequency(midi), start);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(120, start);
  filter.Q.value = 5;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(velocity, start + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(nodes.bassGain);
  osc.start(start);
  osc.stop(start + duration + 0.08);
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function createReverbImpulse(audioContext, seconds, decay) {
  const length = Math.floor(audioContext.sampleRate * seconds);
  const impulse = audioContext.createBuffer(2, length, audioContext.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * (1 - t) ** decay;
    }
  }
  return impulse;
}

function selectDifficulty(difficulty) {
  if (!difficultySettings[difficulty]) return;
  state.difficulty = difficulty;
  ui.difficultyButtons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.difficulty === difficulty);
  });
  updateUi();
}

function startGame() {
  startAudio();
  ui.title.classList.remove("is-active");
  ui.end.classList.remove("is-active");
  document.body.classList.add("is-playing");
  state.started = true;
  state.ended = false;
  state.captureCooldown = currentDifficulty().startGrace;
  canvas.requestPointerLock?.();
  showMessage(`你在破旧卧室里醒来。${currentDifficulty().label}：找齐六条线索，利用撬棍、保险丝和诱饵逃出去。`);
}

function resetGame() {
  state.started = false;
  state.ended = false;
  state.clues.clear();
  state.hasKey = false;
  state.currentTarget = null;
  state.messageUntil = 0;
  state.scare = 0;
  state.deaths = 0;
  state.captureCooldown = 0;
  state.powerOn = false;
  state.lockpickCount = 0;
  state.talismanCount = 0;
  state.usedTalismanAt = 0;
  state.noiseTrapAt = 0;
  state.noiseTrapPosition = null;
  state.solvedRiddle = false;
  state.lastCaptor = null;
  state.deathScene = null;
  state.deathStartedAt = 0;
  state.escaped = false;
  state.weaponInventory = [];
  state.activeWeapon = null;
  state.lastShotAt = -Infinity;
  state.gunFlash = 0;
  state.gunKick = 0;
  state.shotLine = null;
  moveActorToStart();
  resetCharactersToHome();
  for (const obj of objects) {
    obj.collected = false;
    if (obj.id === "key" || hiddenUntilPower.includes(obj.id) || hiddenUntilBasementCode.includes(obj.id)) obj.hidden = true;
  }
  for (const weapon of weaponPickups) {
    weapon.collected = false;
  }
  for (const door of Object.values(world.doors)) {
    door.opened = false;
    map[door.y][door.x] = "D";
  }
  ui.end.classList.remove("is-active");
  ui.end.classList.remove("is-death", "is-escape", ...deathEndings.map((ending) => ending.className));
  ui.title.classList.add("is-active");
  ui.message.classList.remove("is-active");
  ui.hint.classList.remove("is-active");
  document.body.classList.remove("is-playing", "danger-near", "danger-close");
  updateUi();
}

function endGame(escaped) {
  state.ended = true;
  state.started = false;
  state.escaped = escaped;
  document.exitPointerLock?.();
  document.body.classList.remove("is-playing", "danger-near", "danger-close");
  ui.end.classList.remove("is-death", "is-escape", ...deathEndings.map((ending) => ending.className));
  if (escaped) {
    state.deathScene = null;
    state.deathStartedAt = 0;
    ui.end.classList.add("is-escape");
    ui.endKicker.textContent = "逃脱成功";
    ui.endTitle.textContent = "你逃出了那栋老宅";
    ui.endText.textContent = "晨光照在门廊上，钥匙在你手心里发冷。屋里传来最后一声拖鞋擦过地板的声音，然后彻底安静。";
  } else {
    const ending = deathEndings[Math.floor(Math.random() * deathEndings.length)];
    state.deathScene = ending.scene;
    state.deathStartedAt = performance.now();
    ui.end.classList.add("is-death", ending.className);
    ui.endKicker.textContent = `${ending.kicker} · ${state.lastCaptor?.label ?? "老宅"}`;
    ui.endTitle.textContent = ending.title;
    ui.endText.textContent = ending.text;
  }
  ui.end.classList.add("is-active");
  updateAudio(performance.now());
}

let world3dEnabled = false;
try {
  world3dEnabled =
    window.World3D?.init?.({
    map,
    world,
    props,
    objects,
    weapons,
    weaponPickups,
    characters,
    state,
    difficultySettings
  }) === true;
} catch (error) {
  console.warn("WebGL 3D world failed to start; falling back to canvas renderer.", error);
  document.body.classList.remove("has-webgl");
}

function drawFrame(now) {
  if (world3dEnabled) {
    state.gunFlash = Math.max(0, state.gunFlash - 0.12);
    state.gunKick = Math.max(0, state.gunKick - 0.08);
  }
  if (
    world3dEnabled &&
    window.World3D?.update?.({
      player,
      state,
      objects,
      weaponPickups,
      characters,
      doors: world.doors,
      time: now
    })
  ) {
    return;
  }
  drawScene(now);
}

function loop(now) {
  const delta = Math.min((now - state.lastFrame) / 1000, 0.05);
  state.lastFrame = now;
  update(delta, now);
  updateAudio(now);
  drawFrame(now);
  if (state.ended && !state.escaped) drawDeathScene(now);
  requestAnimationFrame(loop);
}

function normalizeAngle(angle) {
  while (angle < -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function distanceTo(x, y) {
  return Math.hypot(player.x - x, player.y - y);
}

function shadeColor(hex, factor) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((value >> 16) & 255) * factor);
  const g = Math.round(((value >> 8) & 255) * factor);
  const b = Math.round((value & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyE") interact();
  if (event.code === "KeyQ") cycleWeapon();
  if (event.code.startsWith("Digit")) {
    const index = Number(event.code.slice(5)) - 1;
    const weaponId = state.weaponInventory[index];
    if (weaponId && weapons[weaponId]) {
      state.activeWeapon = weaponId;
      showMessage(`已切换：${weapons[weaponId].name}`, 1200);
      updateUi();
    }
  }
  if (event.code === "Escape") document.exitPointerLock?.();
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => keys.delete(event.code));

window.addEventListener("mousemove", (event) => {
  if (!state.started) return;
  if (document.pointerLockElement === canvas) {
    player.angle += event.movementX * 0.0026;
    player.pitch = clampPitch(player.pitch - event.movementY * 0.0022);
  }
});

let touchLook = null;
window.addEventListener(
  "touchstart",
  (event) => {
    const touch = [...event.changedTouches].find((item) => item.clientX > window.innerWidth * 0.42);
    if (touch) touchLook = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
  },
  { passive: true }
);

window.addEventListener(
  "touchmove",
  (event) => {
    if (!touchLook || !state.started) return;
    const touch = [...event.changedTouches].find((item) => item.identifier === touchLook.id);
    if (!touch) return;
    player.angle += (touch.clientX - touchLook.x) * 0.006;
    player.pitch = clampPitch(player.pitch - (touch.clientY - touchLook.y) * 0.005);
    touchLook.x = touch.clientX;
    touchLook.y = touch.clientY;
  },
  { passive: true }
);

window.addEventListener("touchend", (event) => {
  if ([...event.changedTouches].some((item) => item.identifier === touchLook?.id)) {
    touchLook = null;
  }
});

document.querySelectorAll("[data-move]").forEach((button) => {
  const key = button.dataset.move;
  const set = (value) => {
    mobileMove[key] = value;
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    set(true);
  });
  button.addEventListener("pointerup", () => set(false));
  button.addEventListener("pointerleave", () => set(false));
  button.addEventListener("pointercancel", () => set(false));
});

canvas.addEventListener("click", () => {
  if (state.started && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
  if (state.started) shootWeapon();
});

ui.start.addEventListener("click", startGame);
ui.restart.addEventListener("click", resetGame);
ui.interact.addEventListener("click", interact);
if (ui.fire) ui.fire.addEventListener("click", shootWeapon);
ui.difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => selectDifficulty(button.dataset.difficulty));
});

updateUi();
if (startupParams.has("autostart")) {
  window.addEventListener("load", () => {
    window.setTimeout(() => {
      if (startupParams.has("showenemy") || startupParams.get("autostart") === "showenemy" || reviewMode) {
        selectDifficulty("nightmare");
        state.clues.add("photo");
      }
      startGame();
      if (startupParams.has("showenemy") || startupParams.get("autostart") === "showenemy" || reviewMode) {
        player.x = reviewMode ? 10.4 : 4.55;
        player.y = reviewMode ? 24.2 : 3.35;
        player.angle = reviewMode ? -Math.PI / 2 : Math.PI / 2;
        player.pitch = reviewMode ? 0.08 : -0.04;
        characters.forEach((character, index) => {
          character.x = reviewMode ? 7.9 + index * 1.0 : 2.45 + index * 0.86;
          character.y = reviewMode ? 24.45 : 5.55;
          character.deadUntil = 0;
          character.health = character.maxHealth;
          character.stunUntil = performance.now() + 60000;
        });
        state.captureCooldown = 60000;
        if (reviewMode) document.body.classList.add("review-mode");
      }
      showMessage("截图模式：已进入老宅。", 1200);
    }, 350);
  });
}
requestAnimationFrame(loop);
