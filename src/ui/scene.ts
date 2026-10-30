import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TwinResult } from "../twin/model.js";
import { frameAt } from "./presentation.js";
import { vehiclePose, worldPoint } from "./motion.js";

const palette = [
  "#e7e9e6",
  "#466a85",
  "#bf7161",
  "#3f786e",
  "#b5bbc3",
  "#d8c49d",
  "#414b60",
  "#e5e0d6",
];
const mat = (color: string, metalness = 0, roughness = 0.8) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
function label(
  text: string,
  width = 5,
  color = "#314453",
  background?: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext("2d")!;
  if (background) {
    c.fillStyle = background;
    c.fillRect(0, 0, 512, 128);
  }
  c.fillStyle = color;
  c.font = "600 54px sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  const measured = c.measureText(text).width;
  if (measured > 470)
    c.font = `600 ${Math.floor((54 * 470) / measured)}px sans-serif`;
  c.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  return mesh;
}
function mergeBoxes(
  items: { x: number; y: number; z: number; w: number; h: number; d: number }[],
) {
  return mergeGeometries(
    items.map((i) => box(i.w, i.h, i.d).translate(i.x, i.y, i.z)),
  )!;
}
export interface SceneView {
  update(
    time: number,
    selected: string | null,
    heatmap: boolean,
    routes: boolean,
    night: boolean,
  ): void;
  resize(): void;
  reset(): void;
  top(): void;
  focus(vehicleId: string): void;
  dispose(): void;
}
export function buildScene(
  host: HTMLElement,
  result: TwinResult,
  onSelect: (id: string) => void,
): SceneView {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute(
    "aria-label",
    "입체 주차장 시뮬레이션. 드래그로 회전, 휠로 확대, 차량을 클릭해 선택",
  );
  renderer.domElement.setAttribute("role", "img");
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-50, 50, 40, -40, 0.1, 600);
  const layout = result.scenario.layout,
    columns = Math.max(...layout.nodes.map((n) => n.x)) - 1;
  const width = (columns + 1) * 3.2,
    depth = 50;
  const target = new THREE.Vector3(width / 2, 0, depth / 2 - 5);
  camera.position.copy(target).add(new THREE.Vector3(38, 62, 58));
  camera.lookAt(target);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = false;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.2;
  controls.minZoom = 0.65;
  controls.maxZoom = 3;
  controls.enablePan = true;
  const ambient = new THREE.HemisphereLight("#e9f3ff", "#9a9c7b", 2.5);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight("#ffeed4", 3.3);
  sun.position.set(-20, 55, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  sun.shadow.camera.far = 180;
  sun.shadow.normalBias = 0.08;
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.copy(target);
  const ground = mat("#b9c8b7"),
    paving = mat("#d7d8cd"),
    asphalt = mat("#58626b"),
    curb = mat("#ebeadc");
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(width + 17, 1.4, depth + 29, 3, 1),
    ground,
  );
  base.position.set(width / 2, -0.9, depth / 2 - 4);
  base.receiveShadow = true;
  scene.add(base);
  const lot = new THREE.Mesh(
    new RoundedBoxGeometry(width + 8, 0.24, depth + 9, 2, 0.4),
    paving,
  );
  lot.position.set(width / 2, -0.13, depth / 2);
  lot.receiveShadow = true;
  scene.add(lot);
  const roadBoxes = [];
  for (let row = 1; row <= 4; row++)
    roadBoxes.push({
      x: width / 2,
      y: 0.02,
      z: row * 10,
      w: width + 5,
      h: 0.06,
      d: 4.1,
    });
  roadBoxes.push(
    { x: 0, y: 0.02, z: 17, w: 4.5, h: 0.06, d: 61 },
    { x: width, y: 0.02, z: 27, w: 4.5, h: 0.06, d: 55 },
  );
  const roads = new THREE.Mesh(mergeBoxes(roadBoxes), asphalt);
  roads.receiveShadow = true;
  scene.add(roads);
  const roadLine: number[] = [];
  const segment = (x: number, z: number, x2: number, z2: number) =>
    roadLine.push(x, 0.08, z, x2, 0.08, z2);
  for (let row = 1; row <= 4; row++)
    for (let x = 2; x < width - 1; x += 3)
      segment(x, row * 10, x + 1.2, row * 10);
  for (let z = -10; z < 51; z += 3) {
    segment(0, z, 0, z + 1.1);
    segment(width, z, width, z + 1.1);
  }
  const roadLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(roadLine, 3),
    ),
    new THREE.LineBasicMaterial({
      color: "#bac5c4",
      transparent: true,
      opacity: 0.65,
    }),
  );
  scene.add(roadLines);
  const spotGeometry = new THREE.PlaneGeometry(2.85, 4.8);
  spotGeometry.rotateX(-Math.PI / 2);
  const spotMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.42,
    roughness: 1,
  });
  const spots = new THREE.InstancedMesh(
    spotGeometry,
    spotMaterial,
    layout.spots.length,
  );
  const dummy = new THREE.Object3D();
  const marks: number[] = [];
  for (const [i, spot] of layout.spots.entries()) {
    const n = layout.nodes.find((n) => n.id === spot.node)!,
      p = worldPoint(n.x, n.y);
    dummy.position.set(p.x, 0.07, p.z + 3.55);
    dummy.updateMatrix();
    spots.setMatrixAt(i, dummy.matrix);
    spots.setColorAt(i, new THREE.Color("#d7dcd3"));
    marks.push(
      p.x - 1.42,
      0.09,
      p.z + 1.2,
      p.x - 1.42,
      0.09,
      p.z + 5.9,
      p.x - 1.42,
      0.09,
      p.z + 5.9,
      p.x + 1.42,
      0.09,
      p.z + 5.9,
      p.x + 1.42,
      0.09,
      p.z + 5.9,
      p.x + 1.42,
      0.09,
      p.z + 1.2,
    );
  }
  spots.userData.spots = true;
  scene.add(spots);
  scene.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(marks, 3),
      ),
      new THREE.LineBasicMaterial({
        color: "#f4f1db",
        transparent: true,
        opacity: 0.85,
      }),
    ),
  );
  const zones =
    result.scenario.id === "incheon"
      ? ["H", "A", "C", "D"]
      : ["A", "B", "C", "D"];
  for (let row = 1; row <= 4; row++) {
    const island = new THREE.Mesh(
      new RoundedBoxGeometry(width - 5, 0.35, 1.2, 2, 0.25),
      curb,
    );
    island.position.set(width / 2, 0.12, row * 10 + 6.8);
    island.receiveShadow = true;
    scene.add(island);
    for (const [x, text] of result.scenario.id === "incheon"
      ? ([
          [
            width * 0.24,
            row <= 2 || result.scenario.provenance?.zones.length === 2
              ? "H · WEST"
              : "C · WEST",
          ],
          [
            width * 0.76,
            row <= 2 || result.scenario.provenance?.zones.length === 2
              ? "A · EAST"
              : "D · EAST",
          ],
        ] as const)
      : ([[width / 2, `ZONE ${zones[row - 1]}`]] as const)) {
      const l = label(String(text), 5, "#70837b");
      l.rotation.x = -Math.PI / 2;
      l.position.set(Number(x), 0.32, row * 10 + 6.8);
      scene.add(l);
    }
  }
  // Terminal architecture, curbside frontage and an elevated glass canopy.
  const terminal = new THREE.Group();
  const terminalWidth = Math.max(18, width - 4);
  const curved = result.scenario.id === "incheon";
  const facadeZ = (x: number) =>
    -11 - (curved ? 4 * (1 - ((x - width / 2) / (terminalWidth / 2)) ** 2) : 0);
  function band(depth: number, height: number, offset = 0) {
    const points: THREE.Vector2[] = [];
    for (let i = 0; i <= 32; i++) {
      const x = width / 2 - terminalWidth / 2 + (i / 32) * terminalWidth;
      points.push(new THREE.Vector2(x, -(facadeZ(x) + offset - depth / 2)));
    }
    for (let i = 32; i >= 0; i--) {
      const x = width / 2 - terminalWidth / 2 + (i / 32) * terminalWidth;
      points.push(new THREE.Vector2(x, -(facadeZ(x) + offset + depth / 2)));
    }
    return new THREE.ExtrudeGeometry(new THREE.Shape(points), {
      depth: height,
      bevelEnabled: false,
      steps: 1,
    }).rotateX(-Math.PI / 2);
  }
  const building = new THREE.Mesh(band(7.4, 4.7), mat("#dddace", 0.05));
  building.position.y = -0.15;
  building.castShadow = true;
  building.receiveShadow = true;
  terminal.add(building);
  const glazingMaterial = mat("#3d6470", 0.45, 0.2);
  for (let i = 0; i < 32; i++) {
    const x = width / 2 - terminalWidth / 2 + ((i + 0.5) / 32) * terminalWidth,
      z = facadeZ(x) + 3.76;
    const panel = new THREE.Mesh(
      box(terminalWidth / 32 + 0.02, 2.9, 0.16),
      glazingMaterial,
    );
    panel.position.set(x, 2.15, z);
    panel.rotation.y = -Math.atan2(facadeZ(x + 0.1) - facadeZ(x - 0.1), 0.2);
    terminal.add(panel);
    const pillar = new THREE.Mesh(
      box(0.09, 3.2, 0.25),
      mat("#8a9fa3", 0.4, 0.5),
    );
    pillar.position.set(x, 2.1, z + 0.08);
    terminal.add(pillar);
  }
  const canopy = new THREE.Mesh(band(3.1, 0.17, 4.5), mat("#c9d5d3", 0.3, 0.4));
  canopy.position.y = 3.85;
  canopy.castShadow = true;
  terminal.add(canopy);
  const roof = new THREE.Mesh(band(8, 0.35), mat("#ecede4", 0.15));
  roof.position.y = 4.55;
  terminal.add(roof);
  const sign = label(
    result.scenario.id === "incheon"
      ? "INCHEON  INTERNATIONAL  AIRPORT"
      : "PARKING  TWIN  /  MOBILITY  LAB",
    Math.min(terminalWidth - 2, 35),
    "#263d4a",
  );
  sign.rotation.x = -Math.PI / 2;
  sign.position.set(width / 2, 4.95, curved ? -15 : -11);
  terminal.add(sign);
  const terminalSign = label(
    result.scenario.id === "incheon"
      ? "TERMINAL  1   /   제1여객터미널"
      : "ARRIVALS  /  DEPARTURES",
    Math.min(terminalWidth - 2, 23),
    "#e8eeeb",
  );
  terminalSign.position.set(width / 2, 2.6, facadeZ(width / 2) + 3.9);
  terminal.add(terminalSign);
  scene.add(terminal);
  const trunks: THREE.BufferGeometry[] = [],
    leaves: THREE.BufferGeometry[] = [];
  for (const x of [-5, width + 5])
    for (let z = 5; z <= 45; z += 10) {
      trunks.push(
        new THREE.CylinderGeometry(0.13, 0.17, 1.4, 5).translate(x, 0.8, z),
      );
      leaves.push(
        new THREE.IcosahedronGeometry(1.1, 1)
          .scale(1, 1.4, 1)
          .translate(x, 2.2, z),
      );
    }
  const trunkMesh = new THREE.Mesh(mergeGeometries(trunks)!, mat("#716650"));
  trunkMesh.castShadow = true;
  scene.add(trunkMesh);
  const leafMesh = new THREE.Mesh(mergeGeometries(leaves)!, mat("#688c71"));
  leafMesh.castShadow = true;
  scene.add(leafMesh);
  const lampMat = mat("#6f7b80", 0.6, 0.4),
    lampGlow = new THREE.MeshStandardMaterial({
      color: "#fff4d3",
      emissive: "#fff0c2",
      emissiveIntensity: 0.3,
    });
  for (let row = 1; row <= 4; row++)
    for (const x of [2, width - 2]) {
      const pole = new THREE.Mesh(box(0.1, 3.6, 0.1), lampMat);
      pole.position.set(x, 1.8, row * 10 + 7.1);
      pole.castShadow = true;
      scene.add(pole);
      const head = new THREE.Mesh(box(1.2, 0.12, 0.6), lampGlow);
      head.position.set(x, 3.6, row * 10 + 7.1);
      scene.add(head);
    }
  const entrySign = label("ENTRY  →", 6, "#e9f8ed", "#237c70");
  entrySign.rotation.x = -Math.PI / 2;
  entrySign.rotation.z = Math.PI / 2;
  entrySign.position.set(0, 0.11, -6);
  scene.add(entrySign);
  const exitSign = label("EXIT  →", 6, "#fff4dd", "#b28b50");
  exitSign.rotation.x = -Math.PI / 2;
  exitSign.rotation.z = Math.PI / 2;
  exitSign.position.set(width, 0.11, 49);
  scene.add(exitSign);
  // Shared car geometry: sculpted body, glass cabin, roof, four tires, LED lamps.
  const bodyGeo = new RoundedBoxGeometry(2.7, 0.45, 1.25, 3, 0.17);
  const roofGeometries = [
    new RoundedBoxGeometry(1.02, 0.1, 0.93, 2, 0.04),
    new RoundedBoxGeometry(1.4, 0.11, 0.99, 2, 0.04),
  ];
  const cabinGeometries = [false, true].map((suv) => {
    const profile = new THREE.Shape();
    profile.moveTo(-1, 0.74);
    profile.lineTo(suv ? -0.8 : -0.54, suv ? 1.4 : 1.23);
    profile.lineTo(suv ? 0.6 : 0.42, suv ? 1.4 : 1.23);
    profile.lineTo(0.96, 0.74);
    profile.closePath();
    return new THREE.ExtrudeGeometry(profile, {
      depth: 1.02,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 1,
      steps: 1,
    }).translate(0, 0, -0.51);
  });
  const tireGeos = [];
  for (const x of [-0.86, 0.86])
    for (const z of [-0.65, 0.65])
      tireGeos.push(
        new THREE.CylinderGeometry(0.26, 0.26, 0.18, 12)
          .rotateX(Math.PI / 2)
          .translate(x, 0.29, z),
      );
  const rimsGeo = mergeGeometries(
    [-0.86, 0.86].flatMap((x) =>
      [-0.75, 0.75].map((z) =>
        new THREE.CylinderGeometry(0.13, 0.13, 0.02, 12)
          .rotateX(Math.PI / 2)
          .translate(x, 0.29, z),
      ),
    ),
  )!;
  const rimMaterial = mat("#a7b2b9", 0.8, 0.25);
  const tiresGeo = mergeGeometries(tireGeos)!,
    frontGeo = mergeBoxes([
      { x: 1.32, y: 0.65, z: -0.4, w: 0.05, h: 0.14, d: 0.28 },
      { x: 1.32, y: 0.65, z: 0.4, w: 0.05, h: 0.14, d: 0.28 },
    ]),
    rearGeo = frontGeo.clone().translate(-2.64, 0, 0);
  const tiresMat = mat("#252c31", 0.1, 0.9),
    glassMat = mat("#253b47", 0.45, 0.2);
  const frontMat = new THREE.MeshStandardMaterial({
    color: "#fff3c6",
    emissive: "#fff6d7",
    emissiveIntensity: 0.4,
  });
  const bodyMats = palette.map((c) => mat(c, 0.45, 0.3));
  const cars = new Map<
    string,
    { group: THREE.Group; brakes: THREE.MeshStandardMaterial }
  >();
  const pickable: THREE.Object3D[] = [spots];
  for (const [i, trip] of result.trips.entries()) {
    if (trip.spotId === null) continue;
    const group = new THREE.Group();
    const paint = bodyMats[i % bodyMats.length]!;
    const body = new THREE.Mesh(bodyGeo, paint);
    body.position.y = 0.52;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const variant = i % 3 === 0 ? 1 : 0;
    const cabin = new THREE.Mesh(cabinGeometries[variant]!, glassMat);
    cabin.castShadow = true;
    group.add(cabin);
    const roof = new THREE.Mesh(roofGeometries[variant]!, paint);
    roof.position.set(-0.08, variant ? 1.43 : 1.26, 0);
    group.add(roof);
    const wheels = new THREE.Mesh(tiresGeo, tiresMat);
    wheels.castShadow = true;
    group.add(wheels);
    group.add(new THREE.Mesh(rimsGeo, rimMaterial));
    group.add(new THREE.Mesh(frontGeo, frontMat));
    const brakes = new THREE.MeshStandardMaterial({
      color: "#b74a44",
      emissive: "#d64b3c",
      emissiveIntensity: 0.3,
    });
    group.add(new THREE.Mesh(rearGeo, brakes));
    group.userData.vehicleId = trip.vehicleId;
    group.visible = false;
    scene.add(group);
    cars.set(trip.vehicleId, { group, brakes });
    pickable.push(group);
  }
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.76, 48),
    new THREE.MeshBasicMaterial({
      color: "#37d2b7",
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.visible = false;
  scene.add(halo);
  const routeGroup = new THREE.Group();
  scene.add(routeGroup);
  let routeKey = "";
  const heatGeo = box(1, 0.05, 1);
  const heatMats = new Map<string, THREE.MeshBasicMaterial>();
  const heatMeshes = new Map<string, THREE.Mesh>();
  for (const edge of layout.edges) {
    const a = layout.nodes.find((n) => n.id === edge.from)!,
      b = layout.nodes.find((n) => n.id === edge.to)!,
      p = worldPoint(a.x, a.y),
      q = worldPoint(b.x, b.y);
    const m = new THREE.MeshBasicMaterial({
      color: "#f09a53",
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(heatGeo, m);
    mesh.scale.set(Math.abs(q.x - p.x) + 2.8, 1, Math.abs(q.z - p.z) + 2.8);
    mesh.position.set((p.x + q.x) / 2, 0.13, (p.z + q.z) / 2);
    scene.add(mesh);
    heatMats.set(edge.id, m);
    heatMeshes.set(edge.id, mesh);
  }
  const poolCanvas = document.createElement("canvas");
  poolCanvas.width = 256;
  poolCanvas.height = 256;
  const pc = poolCanvas.getContext("2d")!,
    gradient = pc.createRadialGradient(128, 128, 4, 128, 128, 125);
  gradient.addColorStop(0, "rgba(255,223,153,.65)");
  gradient.addColorStop(0.5, "rgba(255,220,150,.15)");
  gradient.addColorStop(1, "rgba(255,220,150,0)");
  pc.fillStyle = gradient;
  pc.fillRect(0, 0, 256, 256);
  const poolTexture = new THREE.CanvasTexture(poolCanvas);
  poolTexture.colorSpace = THREE.SRGBColorSpace;
  const poolMaterial = new THREE.MeshBasicMaterial({
    map: poolTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const poolGeometry = new THREE.PlaneGeometry(13, 13);
  poolGeometry.rotateX(-Math.PI / 2);
  for (let row = 1; row <= 4; row++)
    for (const x of [2, width - 2]) {
      const pool = new THREE.Mesh(poolGeometry, poolMaterial);
      pool.position.set(x, 0.16, row * 10 + 4.5);
      scene.add(pool);
    }
  let tracked: string | null = null;
  const raycaster = new THREE.Raycaster();
  let pointerDown = { x: 0, y: 0 };
  const down = (e: PointerEvent) => {
    pointerDown = { x: e.clientX, y: e.clientY };
  };
  let currentTime = 0;
  const click = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 5)
      return;
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster.intersectObjects(
      pickable.filter((object) => object === spots || object.visible),
      true,
    )[0];
    if (!hit) return;
    let obj: THREE.Object3D | null = hit.object;
    while (obj && !obj.userData.vehicleId && !obj.userData.spots)
      obj = obj.parent;
    if (obj?.userData.vehicleId) onSelect(obj.userData.vehicleId as string);
    else if (obj?.userData.spots && hit.instanceId !== undefined) {
      const spotId = layout.spots[hit.instanceId]!.id;
      const trip = result.trips.find(
        (t) =>
          t.spotId === spotId &&
          t.arrivalTime <= currentTime &&
          (t.leftSpotAt === null || t.leftSpotAt > currentTime),
      );
      if (trip) onSelect(trip.vehicleId);
    }
  };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointerup", click);
  const render = () => renderer.render(scene, camera);
  controls.addEventListener("change", render);
  const fit = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.updateMatrixWorld();
    const bounds = new THREE.Box3(
      new THREE.Vector3(-10, -2, -17),
      new THREE.Vector3(width + 10, 7, 58),
    );
    const points = [];
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z])
          points.push(
            new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse),
          );
    const minX = Math.min(...points.map((p) => p.x)),
      maxX = Math.max(...points.map((p) => p.x)),
      minY = Math.min(...points.map((p) => p.y)),
      maxY = Math.max(...points.map((p) => p.y));
    const half =
      Math.max((maxY - minY) / 2, (maxX - minX) / 2 / (w / h)) * 1.03;
    camera.left = (minX + maxX) / 2 - (half * w) / h;
    camera.right = (minX + maxX) / 2 + (half * w) / h;
    camera.top = (minY + maxY) / 2 + half;
    camera.bottom = (minY + maxY) / 2 - half;
    camera.updateProjectionMatrix();
    controls.saveState();
    render();
  };
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();
  function update(
    time: number,
    selected: string | null,
    heatmap: boolean,
    routes: boolean,
    night: boolean,
  ) {
    currentTime = time;
    const frame = frameAt(result, time);
    const parkedSet = new Set(frame.occupied),
      reservedSet = new Set(frame.reserved);
    for (const [i, spot] of layout.spots.entries())
      spots.setColorAt(
        i,
        new THREE.Color(
          parkedSet.has(spot.id)
            ? "#9eaaa7"
            : reservedSet.has(spot.id)
              ? "#dfc58e"
              : "#d4dfce",
        ),
      );
    spots.instanceColor!.needsUpdate = true;
    halo.visible = false;
    const ranks = new Map<string, number>();
    for (const trip of result.trips) {
      const car = cars.get(trip.vehicleId);
      if (!car) continue;
      const pose = vehiclePose(result, trip, frame, time);
      car.group.visible = pose !== null;
      if (!pose) continue;
      let { x, z } = pose;
      if (pose.waiting && !pose.parked) {
        const key = `${x}:${z}:${pose.heading}`;
        const rank = ranks.get(key) ?? 0;
        ranks.set(key, rank + 1);
        x -= Math.cos(-pose.heading) * (rank + 1) * 2.9;
        z -= Math.sin(-pose.heading) * (rank + 1) * 2.9;
        if (rank > 5) car.group.visible = false;
      }
      car.group.position.set(x, 0.08, z);
      car.group.rotation.y = pose.heading;
      car.brakes.emissiveIntensity = pose.waiting ? 1.8 : 0.25;
      if (trip.vehicleId === selected) {
        halo.visible = true;
        halo.position.set(x, 0.15, z);
      }
    }
    for (const e of frame.edges)
      heatMats.get(e.edgeId)!.opacity =
        heatmap && e.queued ? Math.min(0.5, 0.18 + e.queued * 0.06) : 0;
    const key = routes ? (selected ?? "") : "";
    if (key !== routeKey) {
      routeKey = key;
      for (const child of [...routeGroup.children]) {
        routeGroup.remove(child);
        (child as THREE.Line).geometry.dispose();
        const material = (child as THREE.Line).material;
        (Array.isArray(material) ? material : [material]).forEach((m) =>
          m.dispose(),
        );
      }
      const trip = result.trips.find((t) => t.vehicleId === key);
      if (trip) {
        const points: THREE.Vector3[] = [];
        for (const id of trip.route) {
          const e = layout.edges.find((e) => e.id === id)!,
            a = layout.nodes.find((n) => n.id === e.from)!,
            b = layout.nodes.find((n) => n.id === e.to)!;
          points.push(
            new THREE.Vector3(a.x * 3.2, 0.25, a.y * 10),
            new THREE.Vector3(b.x * 3.2, 0.25, b.y * 10),
          );
        }
        routeGroup.add(
          new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: "#25c9a8" }),
          ),
        );
      }
    }
    if (tracked) {
      const car = cars.get(tracked)?.group;
      if (car?.visible) {
        const next = car.position.clone();
        next.y = 0.5;
        const delta = next.clone().sub(controls.target);
        camera.position.add(delta);
        controls.target.copy(next);
        controls.update();
      } else tracked = null;
    }
    poolMaterial.opacity = night ? 0.9 : 0;
    glazingMaterial.emissive.set(night ? "#568d88" : "#000000");
    glazingMaterial.emissiveIntensity = night ? 1 : 0;
    ambient.color.set(night ? "#b6cce6" : "#e9f3ff");
    ambient.intensity = night ? 1.2 : 2.5;
    sun.intensity = night ? 0.7 : 3.3;
    renderer.toneMappingExposure = night ? 0.85 : 1.25;
    lampGlow.emissiveIntensity = night ? 3 : 0.3;
    frontMat.emissiveIntensity = night ? 2 : 0.4;
    render();
  }
  return {
    update,
    resize: fit,
    reset() {
      tracked = null;
      camera.position.copy(target).add(new THREE.Vector3(38, 62, 58));
      camera.zoom = 1;
      controls.target.copy(target);
      controls.update();
      fit();
    },
    top() {
      tracked = null;
      camera.zoom = 1;
      camera.position.copy(target).add(new THREE.Vector3(0.01, 90, 0.01));
      controls.target.copy(target);
      camera.lookAt(target);
      controls.update();
      fit();
    },
    focus(vehicleId) {
      const car = cars.get(vehicleId)?.group;
      if (!car?.visible) return;
      tracked = vehicleId;
      const next = car.position.clone();
      next.y = 0.5;
      controls.target.copy(next);
      camera.position.copy(next).add(new THREE.Vector3(12, 16, 20));
      camera.zoom = 1;
      const aspect = host.clientWidth / host.clientHeight;
      camera.left = -11 * aspect;
      camera.right = 11 * aspect;
      camera.top = 11;
      camera.bottom = -11;
      camera.updateProjectionMatrix();
      controls.update();
      render();
    },
    dispose() {
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", click);
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material)
          for (const material of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]) {
            materials.add(material);
            for (const value of Object.values(material))
              if (value instanceof THREE.Texture) textures.add(value);
          }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
