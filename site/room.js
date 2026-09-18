import { createAvatar } from './avatar.js';
const stage = document.querySelector('three-d-stage');
const { THREE: T } = await stage.ready;

/* ============ procedural textures ============ */
function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rx = 1, ry = 1) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(rx, ry); t.anisotropy = 8;
  return t;
}

/* grey laminate plank floor */
const floorTex = (() => {
  const c = cvs(1024, 1024), x = c.getContext('2d');
  x.fillStyle = '#9c9791'; x.fillRect(0, 0, 1024, 1024);
  const rows = 8, rh = 1024 / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 170;
    for (let p = -1; p < 3; p++) {
      const px = off + p * 380, pw = 380;
      const g = x.createLinearGradient(0, r * rh, 0, r * rh + rh);
      const base = 142 + ((r * 7 + p * 13) % 5) * 7;
      g.addColorStop(0, `rgb(${base + 14},${base + 11},${base + 8})`);
      g.addColorStop(0.5, `rgb(${base},${base - 3},${base - 7})`);
      g.addColorStop(1, `rgb(${base - 12},${base - 15},${base - 18})`);
      x.fillStyle = g; x.fillRect(px, r * rh + 1, pw - 3, rh - 3);
      x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        const gy = r * rh + 10 + Math.random() * (rh - 20);
        x.beginPath(); x.moveTo(px + 6, gy);
        x.bezierCurveTo(px + pw * 0.3, gy + 6, px + pw * 0.6, gy - 6, px + pw - 8, gy + 2);
        x.stroke();
      }
    }
  }
  return tex(c, 2.4, 2.4);
})();

/* vertical blinds */
const blindTex = (() => {
  const c = cvs(1024, 512), x = c.getContext('2d');
  x.fillStyle = '#efeae1'; x.fillRect(0, 0, 1024, 512);
  const n = 16, bw = 1024 / n;
  for (let i = 0; i < n; i++) {
    const g = x.createLinearGradient(i * bw, 0, (i + 1) * bw, 0);
    g.addColorStop(0, '#d6cfc4'); g.addColorStop(0.35, '#faf6ef');
    g.addColorStop(0.8, '#e8e2d7'); g.addColorStop(1, '#c8c1b5');
    x.fillStyle = g; x.fillRect(i * bw, 0, bw - 2, 512);
  }
  return tex(c);
})();

/* pegboard dots */
const pegTex = (() => {
  const c = cvs(256, 256), x = c.getContext('2d');
  x.fillStyle = '#f4f3f0'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#c9c7c2';
  for (let i = 12; i < 256; i += 24) for (let j = 12; j < 256; j += 24) { x.beginPath(); x.arc(i, j, 3.5, 0, 7); x.fill(); }
  return tex(c, 4, 2);
})();

/* chair mesh weave (with alpha) */
const meshTex = (() => {
  const c = cvs(256, 256), x = c.getContext('2d');
  x.clearRect(0, 0, 256, 256);
  x.strokeStyle = '#1a1d20'; x.lineWidth = 5;
  for (let i = 0; i <= 256; i += 14) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
  }
  return tex(c, 7, 7);
})();

/* ============ materials ============ */
const M = {
  wall:    new T.MeshStandardMaterial({ name: 'wall_white', color: 0xf4f2ef, roughness: 1 }),
  ceiling: new T.MeshStandardMaterial({ name: 'ceiling', color: 0xfbfaf8, roughness: 1 }),
  floor:   new T.MeshStandardMaterial({ name: 'laminate_floor', map: floorTex, roughness: 0.62, metalness: 0.02 }),
  trim:    new T.MeshStandardMaterial({ name: 'trim_white', color: 0xfdfdfc, roughness: 0.6 }),
  black:   new T.MeshStandardMaterial({ name: 'black_matte', color: 0x1b1d1f, roughness: 0.55 }),
  deskTop: new T.MeshStandardMaterial({ name: 'desk_top_black', color: 0x17191b, roughness: 0.42 }),
  steel:   new T.MeshStandardMaterial({ name: 'steel', color: 0xb4b8bc, roughness: 0.34, metalness: 0.55 }),
  silver:  new T.MeshStandardMaterial({ name: 'laptop_silver', color: 0xc8ccd0, roughness: 0.34, metalness: 0.5 }),
  white:   new T.MeshStandardMaterial({ name: 'white_plastic', color: 0xf2f1ee, roughness: 0.45 }),
  frame:   new T.MeshStandardMaterial({ name: 'bed_frame_white', color: 0xf6f5f2, roughness: 0.4, metalness: 0.2 }),
  fabric:  new T.MeshStandardMaterial({ name: 'grey_fabric', color: 0xa8adb2, roughness: 1 }),
  rug:     new T.MeshStandardMaterial({ name: 'rug_grey', color: 0x8e8b87, roughness: 1 }),
  peg:     new T.MeshStandardMaterial({ name: 'pegboard', map: pegTex, roughness: 0.8 }),
  mesh:    new T.MeshStandardMaterial({ name: 'chair_mesh', map: meshTex, alphaMap: meshTex, transparent: true, color: 0x24282c, roughness: 0.9, side: T.DoubleSide }),
  teal:    new T.MeshStandardMaterial({ name: 'teal', color: 0x3fa3a8, roughness: 0.6 }),
  leaf:    new T.MeshStandardMaterial({ name: 'foliage', color: 0x406b3c, roughness: 0.9, side: T.DoubleSide }),
  yellow:  new T.MeshStandardMaterial({ name: 'yellow_bin', color: 0xe8bf34, roughness: 0.55 }),
  pink:    new T.MeshStandardMaterial({ name: 'pink_plastic', color: 0xe2557f, roughness: 0.55 }),
  blind:   new T.MeshStandardMaterial({ name: 'blinds', map: blindTex, roughness: 0.95, emissive: 0xfff4e2, emissiveIntensity: 0.55 }),
  book:    new T.MeshStandardMaterial({ name: 'book_blue', color: 0x2e6fa8, roughness: 0.8 }),
  paper:   new T.MeshStandardMaterial({ name: 'paper', color: 0xeeeae1, roughness: 0.95 }),
  red:     new T.MeshStandardMaterial({ name: 'red_accent', color: 0xc3453c, roughness: 0.6 }),
  navy:    new T.MeshStandardMaterial({ name: 'navy_blue', color: 0x2f5aa8, roughness: 0.55 }),
  sky:     new T.MeshStandardMaterial({ name: 'sky_blue', color: 0x4d8fd6, roughness: 0.6 }),
  orange:  new T.MeshStandardMaterial({ name: 'orange', color: 0xf0921e, roughness: 0.5 }),
  lime:    new T.MeshStandardMaterial({ name: 'lime_green', color: 0x8fc63a, roughness: 0.7 }),
  cream:   new T.MeshStandardMaterial({ name: 'cream', color: 0xf3e4c8, roughness: 0.9 }),
  cone:    new T.MeshStandardMaterial({ name: 'waffle_cone', color: 0xc98a4b, roughness: 0.9 }),
  slat:    new T.MeshStandardMaterial({ name: 'bed_slat_wood', color: 0xd9c3a3, roughness: 0.8 }),
  mint:    new T.MeshStandardMaterial({ name: 'mint_bin', color: 0xb9cbb8, roughness: 0.9 }),
  chrome:  new T.MeshStandardMaterial({ name: 'chrome', color: 0xd9dcdf, roughness: 0.2, metalness: 0.8 }),
};

const room = new T.Group(); room.name = 'room';

/* ============ helpers ============ */
function roundedGeo(w, h, d, r = 0.02) {
  const e = 0.0005;
  r = Math.max(0.002, Math.min(r, w / 2 - e, h / 2 - e, d / 2 - e));
  const bev = Math.min(r * 0.7, d / 2 - e);
  const sh = new T.Shape();
  sh.moveTo(-w / 2, -h / 2 + r);
  sh.lineTo(-w / 2, h / 2 - r);
  sh.quadraticCurveTo(-w / 2, h / 2, -w / 2 + r, h / 2);
  sh.lineTo(w / 2 - r, h / 2);
  sh.quadraticCurveTo(w / 2, h / 2, w / 2, h / 2 - r);
  sh.lineTo(w / 2, -h / 2 + r);
  sh.quadraticCurveTo(w / 2, -h / 2, w / 2 - r, -h / 2);
  sh.lineTo(-w / 2 + r, -h / 2);
  sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2, -h / 2 + r);
  const depth = Math.max(0.001, d - 2 * bev);
  const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}
const add = (n, mesh, x, y, z, p) => {
  mesh.name = n; mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  (p || room).add(mesh); return mesh;
};
const rbox = (n, w, h, d, r, mat, x, y, z, p) => add(n, new T.Mesh(roundedGeo(w, h, d, r), mat), x, y, z, p);
const box = (n, w, h, d, mat, x, y, z, p) => add(n, new T.Mesh(new T.BoxGeometry(w, h, d), mat), x, y, z, p);
const cyl = (n, rt, rb, h, mat, x, y, z, p, seg = 24) => add(n, new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), mat), x, y, z, p);
const tube = (n, len, r, mat, x, y, z, p) => add(n, new T.Mesh(new T.CapsuleGeometry(r, len, 6, 14), mat), x, y, z, p);

/* ============ shell ============ */
const HW = 1.85, RH = 2.5, TH = 0.09;
add('floor', new T.Mesh(new T.BoxGeometry(HW * 2, TH, HW * 2), M.floor), 0, -TH / 2, 0).castShadow = false;
box('wall_back', HW * 2, RH, TH, M.wall, 0, RH / 2, -HW + TH / 2);
box('wall_left', TH, RH, HW * 2, M.wall, -HW + TH / 2, RH / 2, 0);
box('wall_right_low', TH, 0.56, HW * 2, M.wall, HW - TH / 2, 0.28, 0);
box('wall_right_pier', TH, RH, 0.5, M.wall, HW - TH / 2, RH / 2, -HW + 0.25);
box('baseboard_back', HW * 2, 0.12, 0.022, M.trim, 0, 0.06, -HW + TH + 0.012);
box('baseboard_left', 0.022, 0.12, HW * 2, M.trim, -HW + TH + 0.012, 0.06, 0);
box('baseboard_right', 0.022, 0.12, HW * 2, M.trim, HW - TH - 0.012, 0.06, 0);

/* ============ window: frame, curtains, New West view outside ============ */
const wx = HW - TH - 0.01;
const WZ = 0.2, WW = 2.5, WH = 1.75, WY = 1.42;
box('window_frame_top', 0.08, 0.06, WW + 0.12, M.black, wx - 0.02, WY + WH / 2 + 0.03, WZ);
box('window_frame_bottom', 0.08, 0.06, WW + 0.12, M.black, wx - 0.02, WY - WH / 2 - 0.03, WZ);
box('window_frame_left', 0.08, WH + 0.12, 0.06, M.black, wx - 0.02, WY, WZ - WW / 2 - 0.03);
box('window_frame_right', 0.08, WH + 0.12, 0.06, M.black, wx - 0.02, WY, WZ + WW / 2 + 0.03);
box('window_mullion', 0.06, WH, 0.05, M.black, wx - 0.02, WY, WZ);
box('window_sill', 0.14, 0.04, WW + 0.2, M.trim, wx - 0.05, WY - WH / 2 - 0.08, WZ);
const glassMat = new T.MeshStandardMaterial({ name: 'glass', color: 0xdfeaf2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.12, side: T.DoubleSide });
add('window_glass', new T.Mesh(new T.PlaneGeometry(WW, WH), glassMat), wx, WY, WZ).rotation.y = -Math.PI / 2;

/* painted city view (canvas) — animated train yard, SkyTrain, road */
const VIEW_W = 1400, VIEW_H = 800;
const viewC = cvs(VIEW_W, VIEW_H), vctx = viewC.getContext('2d');
const viewTex = new T.CanvasTexture(viewC); viewTex.colorSpace = T.SRGBColorSpace; viewTex.anisotropy = 8;
const bldgs = []; { let x = 0; let k = 0; while (x < VIEW_W) { const w = 40 + ((k * 37) % 70), h = 60 + ((k * 53) % 190); bldgs.push({ x, w, h, c: ['#c9c2b8', '#b8b1a8', '#d7cfc4', '#a89f95', '#e0d8cc'][k % 5], tower: (k % 6) === 2 }); x += w + 6 + (k % 3) * 6; k++; } }
const cars = [{ x: 200, s: 62, c: '#f2f2f2' }, { x: 900, s: 48, c: '#2a2a2a' }, { x: 1300, s: 70, c: '#b53a2f' }];
function drawView(ctx, t) {
  const W = VIEW_W, H = VIEW_H;
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5); sky.addColorStop(0, '#5f9bd6'); sky.addColorStop(1, '#cfe2f1');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  /* mountains */
  ctx.fillStyle = '#8ea3b8'; ctx.beginPath(); ctx.moveTo(0, H * 0.34);
  for (let x = 0; x <= W; x += 60) ctx.lineTo(x, H * 0.34 - Math.abs(Math.sin(x * 0.011) * 70 + Math.sin(x * 0.027) * 30));
  ctx.lineTo(W, H * 0.34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#edf3f8'; for (let x = 0; x <= W; x += 60) { const y = H * 0.34 - Math.abs(Math.sin(x * 0.011) * 70 + Math.sin(x * 0.027) * 30); if (y < H * 0.27) { ctx.beginPath(); ctx.moveTo(x - 14, y + 14); ctx.lineTo(x, y); ctx.lineTo(x + 14, y + 14); ctx.fill(); } }
  /* trees line + buildings */
  ctx.fillStyle = '#4b6b45'; for (let x = 0; x < W; x += 34) { ctx.beginPath(); ctx.arc(x, H * 0.36, 22, 0, 7); ctx.fill(); }
  bldgs.forEach(b => {
    const top = H * 0.4 - b.h;
    ctx.fillStyle = b.c; ctx.fillRect(b.x, top, b.w, b.h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(b.x + b.w - 8, top, 8, b.h);
    ctx.fillStyle = '#6f8faa';
    for (let yy = top + 10; yy < H * 0.4 - 12; yy += 16) for (let xx = b.x + 6; xx < b.x + b.w - 8; xx += 14) ctx.fillRect(xx, yy, 7, 9);
    if (b.tower) { ctx.fillStyle = '#b8483f'; ctx.fillRect(b.x, top - 6, b.w, 6); }
  });
  /* SkyTrain guideway + moving train */
  ctx.fillStyle = '#bdb6ab'; ctx.fillRect(0, H * 0.42, W, 26);
  ctx.fillStyle = '#a49d92'; for (let x = 60; x < W; x += 220) ctx.fillRect(x, H * 0.42 + 26, 18, 70);
  const tx = ((t * 120) % (W + 500)) - 400;
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#e9ecef' : '#f4f6f8'; ctx.fillRect(tx + i * 96, H * 0.42 - 34, 90, 34); ctx.fillStyle = '#3b7dd8'; ctx.fillRect(tx + i * 96, H * 0.42 - 12, 90, 5); ctx.fillStyle = '#233'; for (let k = 0; k < 4; k++) ctx.fillRect(tx + i * 96 + 8 + k * 21, H * 0.42 - 28, 14, 11); }
  /* warehouses */
  ctx.fillStyle = '#e8d9d3'; ctx.fillRect(0, H * 0.5, W * 0.32, 60); ctx.fillStyle = '#d9d2c7'; ctx.fillRect(W * 0.6, H * 0.5, W * 0.3, 55);
  ctx.fillStyle = '#c94a3d'; ctx.fillRect(W * 0.72, H * 0.5, 90, 14);
  /* rail yard: ballast + tracks */
  ctx.fillStyle = '#c8c1b3'; ctx.fillRect(0, H * 0.58, W, H * 0.24);
  for (let r = 0; r < 4; r++) { const y = H * 0.62 + r * 40; ctx.fillStyle = '#7a6f62'; for (let x = 0; x < W; x += 18) ctx.fillRect(x, y - 3, 10, 12); ctx.fillStyle = '#4b4a48'; ctx.fillRect(0, y, W, 3); ctx.fillRect(0, y + 6, W, 3); }
  /* boxcars crawling on two tracks */
  const drawCars = (y, speed, offset, cols) => { const shift = ((t * speed + offset) % 260); for (let x = -260 + shift; x < W + 20; x += 260) { const c = cols[Math.floor((x + 3000) / 260) % cols.length]; ctx.fillStyle = c; ctx.fillRect(x, y - 52, 240, 54); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 100, y - 46, 30, 42); ctx.fillStyle = '#e6e1d6'; ctx.fillRect(x + 20, y - 40, 60, 14); ctx.fillStyle = '#8fd0c6'; ctx.fillRect(x + 150, y - 24, 70, 14); ctx.fillStyle = '#222'; ctx.fillRect(x + 20, y, 24, 8); ctx.fillRect(x + 190, y, 24, 8); } };
  drawCars(H * 0.62 - 2, 9, 0, ['#a63b31', '#8e3a2c', '#b8452f', '#c9862a']);
  drawCars(H * 0.70 - 2, -6, 120, ['#a63b31', '#e2ddd3', '#a63b31', '#b8452f']);
  /* fence, road, cars */
  ctx.fillStyle = '#6a6c66'; ctx.fillRect(0, H * 0.84, W, 6);
  ctx.fillStyle = '#5e5f5c'; ctx.fillRect(0, H * 0.87, W, H * 0.13);
  ctx.fillStyle = '#e8c53a'; for (let x = 0; x < W; x += 80) ctx.fillRect(x, H * 0.93, 40, 4);
  cars.forEach(c => { c.x = (c.x + c.s * 0.016 + W) % (W + 200) - 100; ctx.fillStyle = c.c; ctx.fillRect(c.x, H * 0.89, 78, 26); ctx.fillStyle = '#333'; ctx.fillRect(c.x + 14, H * 0.89 - 12, 46, 14); ctx.fillStyle = '#111'; ctx.fillRect(c.x + 8, H * 0.89 + 24, 14, 8); ctx.fillRect(c.x + 56, H * 0.89 + 24, 14, 8); });
  /* street tree in front */
  ctx.fillStyle = '#3c5a36'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.8, 70, 0, 7); ctx.fill(); ctx.fillStyle = '#4c6e44'; ctx.beginPath(); ctx.arc(W * 0.8, H * 0.74, 55, 0, 7); ctx.fill();
}
drawView(vctx, 0); viewTex.needsUpdate = true;
const viewMat = new T.MeshBasicMaterial({ name: 'city_view', map: viewTex, toneMapped: false, transparent: true, opacity: 0 });
const cityView = add('city_view', new T.Mesh(new T.PlaneGeometry(WW - 0.02, WH - 0.02), viewMat), wx + 0.05, WY, WZ);
cityView.rotation.y = -Math.PI / 2; cityView.castShadow = false; cityView.receiveShadow = false; cityView.visible = false;
/* backing so the view never shows from behind the wall */
const backing = add('window_backing', new T.Mesh(new T.PlaneGeometry(WW + 0.2, WH + 0.2), new T.MeshBasicMaterial({ name: 'window_backing', color: 0x05070c, side: T.FrontSide })), wx + 0.08, WY, WZ);
backing.rotation.y = -Math.PI / 2; backing.castShadow = false; backing.receiveShadow = false;
const viewLight = new T.PointLight(0xfff3dc, 0, 5, 2); viewLight.position.set(wx + 0.6, WY, WZ);

/* curtains: two grey panels on a black rod, click to open */
const curtainMat = new T.MeshStandardMaterial({ name: 'curtain_grey', color: 0xb9bdc3, roughness: 1, side: T.DoubleSide, emissive: 0x3a3f4a, emissiveIntensity: 0.6 });
function curtainPanel(name, z0) {
  const g = new T.Group(); g.name = name; g.position.set(wx - 0.09, WY + WH / 2 + 0.05, z0);
  const pleats = new T.Group(); pleats.name = name + '_pleats';
  const N = 24, step = (WW / 2) / (N - 1);
  for (let i = 0; i < N; i++) { const p = add(name + '_pleat_' + (i + 1), new T.Mesh(new T.CylinderGeometry(step * 0.62, step * 0.66, WH + 0.2, 10), curtainMat), (i % 2) * 0.025 - 0.012, -(WH + 0.2) / 2, 0, pleats); p.castShadow = false; p.userData.baseZ = i * step; p.position.z = p.userData.baseZ; }
  g.add(pleats); room.add(g); return g;
}
const curtainL = curtainPanel('curtain_left', WZ - WW / 2);
const curtainR = curtainPanel('curtain_right', WZ + WW / 2); curtainR.scale.z = -1;
cyl('curtain_rod', 0.014, 0.014, WW + 0.3, M.black, wx - 0.09, WY + WH / 2 + 0.08, WZ, null, 12).rotation.x = Math.PI / 2;
add('curtain_finial_1', new T.Mesh(new T.SphereGeometry(0.03, 12, 10), M.black), wx - 0.09, WY + WH / 2 + 0.08, WZ - WW / 2 - 0.15);
add('curtain_finial_2', new T.Mesh(new T.SphereGeometry(0.03, 12, 10), M.black), wx - 0.09, WY + WH / 2 + 0.08, WZ + WW / 2 + 0.15);
const curtain = { open: 0, target: 0 };
window.__toggleCurtains = () => { curtain.target = curtain.target ? 0 : 1; };

/* doorway on the back wall */
box('door_casing_l', 0.05, 2.05, 0.06, M.trim, -0.78, 1.02, -HW + TH + 0.03);
box('door_casing_r', 0.05, 2.05, 0.06, M.trim, 0.02, 1.02, -HW + TH + 0.03);
box('door_casing_top', 0.85, 0.05, 0.06, M.trim, -0.38, 2.05, -HW + TH + 0.03);
box('doorway_dark', 0.78, 2.02, 0.02, new T.MeshStandardMaterial({ name: 'hall_dark', color: 0x6d675f, roughness: 1 }), -0.38, 1.01, -HW + TH + 0.005);
box('light_switch', 0.02, 0.12, 0.08, M.trim, -0.92, 1.25, -HW + TH + 0.011).rotation.y = Math.PI / 2;
box('thermostat', 0.02, 0.1, 0.14, M.white, -1.02, 1.55, -HW + TH + 0.011);
box('outlet', 0.012, 0.11, 0.07, M.trim, 0.92, 0.32, -HW + TH + 0.008);

/* ============ live screens ============ */
const screens = [];
function makeScreen(name, w, h, draw, userImage, flip) {
  const c = cvs(w, h), ctx = c.getContext('2d');
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
  if (flip) { t.wrapS = T.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; }
  const mat = new T.MeshStandardMaterial({
    name, map: t, emissive: 0xffffff, emissiveMap: t,
    emissiveIntensity: 0.8, roughness: 0.22, metalness: 0,
    side: flip ? T.BackSide : T.FrontSide,
  });
  const entry = { ctx, w, h, draw, tex: t, live: true };
  screens.push(entry);
  draw(ctx, w, h, 0); t.needsUpdate = true;
  new T.TextureLoader().load(userImage, (u) => {
    u.colorSpace = T.SRGBColorSpace; u.anisotropy = 8;
    if (flip) { u.wrapS = T.RepeatWrapping; u.repeat.x = -1; u.offset.x = 1; }
    mat.map = u; mat.emissiveMap = u; mat.needsUpdate = true;
    entry.live = false;
  }, undefined, () => {});
  return mat;
}
const ui = { ink: '#e9f2f6', dim: '#7e96a4', line: '#1d3040', bg: '#0d1b25', panel: '#132836', accent: '#3fb98f', accent2: '#4aa8e0' };
function chrome(ctx, w, h, title, accent) {
  ctx.fillStyle = ui.bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0a1620'; ctx.fillRect(0, 0, 34, h);
  ctx.fillStyle = '#0a1620'; ctx.fillRect(0, 0, w, 32);
  ['#f0685b', '#f2c14e', '#63c76a'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(22 + i * 18, 16, 5, 0, 7); ctx.fill(); });
  ctx.fillStyle = ui.line; ctx.fillRect(90, 6, w - 130, 18);
  ctx.fillStyle = ui.dim; ctx.font = '16px monospace'; ctx.fillText(title, 100, 21);
  ctx.fillStyle = ui.panel; ctx.fillRect(0, 32, 74, h - 32);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i === 1 ? accent : ui.line; ctx.fillRect(16, 56 + i * 38, 42, 18); }
}
function drawBank(ctx, w, h, t) {
  chrome(ctx, w, h, 'accounts \u2014 overview', ui.accent);
  const x0 = 96;
  ctx.fillStyle = ui.ink; ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillText('Member Accounts', x0, 84);
  ctx.font = '22px system-ui, sans-serif'; ctx.fillStyle = ui.dim;
  ctx.fillText('daily balance / 30 days', x0, 116);
  for (let i = 0; i < 3; i++) {
    const cx = x0 + i * 300;
    ctx.fillStyle = ui.panel; ctx.fillRect(cx, 136, 280, 120);
    ctx.fillStyle = i === 0 ? ui.accent : ui.ink; ctx.font = '700 46px system-ui, sans-serif';
    ctx.fillText('$' + ([48.2, 12.7, 6.4][i] + Math.sin(t * 1.1 + i) * 0.4).toFixed(1) + 'k', cx + 20, 200);
    ctx.fillStyle = ui.dim; ctx.font = '22px system-ui, sans-serif';
    ctx.fillText(['chequing', 'savings', 'credit'][i], cx + 20, 238);
  }
  const gx = x0, gy = 280, gw = w - x0 - 36, gh = h - gy - 28;
  ctx.fillStyle = ui.panel; ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = ui.line; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(gx, gy + gh / 4 * i); ctx.lineTo(gx + gw, gy + gh / 4 * i); ctx.stroke(); }
  ctx.strokeStyle = ui.accent; ctx.lineWidth = 6; ctx.beginPath();
  for (let i = 0; i <= 70; i++) {
    const p = i / 70, x = gx + p * gw;
    const y = gy + gh * 0.74 - (Math.sin(p * 6 + t) * 0.16 + Math.sin(p * 13 - t * 0.7) * 0.07 + p * 0.34) * gh;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = ui.accent2; ctx.lineWidth = 4; ctx.beginPath();
  for (let i = 0; i <= 70; i++) {
    const p = i / 70, x = gx + p * gw;
    const y = gy + gh * 0.84 - (Math.sin(p * 4 - t * 0.6) * 0.1 + p * 0.2) * gh;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}
function drawCloud(ctx, w, h, t) {
  chrome(ctx, w, h, 'cloud console', ui.accent2);
  const x0 = 92;
  ctx.fillStyle = ui.ink; ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText('Resource groups', x0, 76);
  ['app-service', 'sql-db', 'storage', 'functions', 'vnet', 'monitor'].forEach((n, i) => {
    const y = 100 + i * 66;
    ctx.fillStyle = ui.panel; ctx.fillRect(x0, y, w - x0 - 26, 54);
    const ok = Math.sin(t * 1.3 + i * 1.7) > -0.75;
    ctx.fillStyle = ok ? ui.accent : '#e8a33d';
    ctx.beginPath(); ctx.arc(x0 + 26, y + 27, 9, 0, 7); ctx.fill();
    ctx.fillStyle = ui.ink; ctx.font = '600 24px system-ui, sans-serif'; ctx.fillText(n, x0 + 48, y + 36);
    ctx.fillStyle = ui.dim; ctx.font = '20px monospace'; ctx.fillText(ok ? 'running' : 'scaling', w - 150, y + 36);
  });
  const by = 100 + 6 * 66 + 14, bh = h - by - 22;
  if (bh > 24) {
    ctx.fillStyle = ui.panel; ctx.fillRect(x0, by, w - x0 - 26, bh);
    for (let i = 0; i < 16; i++) {
      const v = (Math.sin(t * 1.6 + i * 0.8) * 0.5 + 0.5) * (bh - 14);
      ctx.fillStyle = i % 4 === 0 ? ui.accent2 : ui.line;
      ctx.fillRect(x0 + 12 + i * 19, by + bh - 7 - v, 11, v);
    }
  }
}
function drawCode(ctx, w, h, t) {
  ctx.fillStyle = '#11161c'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, w, 26);
  ctx.fillStyle = '#5d7387'; ctx.font = '18px monospace'; ctx.fillText('room.js', 14, 19);
  const cols = ['#7fd1a8', '#88b9e8', '#d9c98a', '#c58fd0', '#9aa7b4'];
  for (let i = 0; i < 22; i++) {
    const y = 56 + i * 32;
    if (y > h - 10) break;
    ctx.fillStyle = '#3a4856'; ctx.fillText(String(i + 1).padStart(2, ' '), 12, y);
    let x = 40;
    const seed = i * 3.7;
    for (let k = 0; k < 3 + ((i * 5) % 4); k++) {
      const wd = 26 + ((seed + k * 17) % 6) * 18;
      ctx.fillStyle = cols[(i + k) % cols.length];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y - 14, wd * 1.4, 16);
      x += wd * 1.4 + 16;
    }
    ctx.globalAlpha = 1;
  }
  if (Math.sin(t * 4) > 0) { ctx.fillStyle = '#9fe3c0'; ctx.fillRect(46, 56 + 8 * 32 - 14, 12, 16); }
}
const matUltra = makeScreen('screen_main', 1600, 900, drawBank, './screen-main.png', false);
const matSide = makeScreen('screen_side', 820, 620, drawCloud, './screen-side.png');
const matLap1 = makeScreen('screen_laptop_1', 900, 580, drawCode, './screen-laptop.png');
const matLap2 = makeScreen('screen_laptop_2', 900, 580, drawCloud, './screen-laptop-2.png');

/* ============ standing desk (black, against right-back) ============ */
const DX = 0.72, DZ = -1.24, DY = 0.76, DW = 1.66, DD = 0.66;
rbox('desk_top', DW, DD, 0.035, 0.012, M.deskTop, DX, DY, DZ).rotation.x = -Math.PI / 2;
rbox('desk_drawer', 1.0, 0.1, 0.42, 0.016, M.black, DX, DY - 0.075, DZ + 0.06);
box('desk_drawer_slit', 0.92, 0.012, 0.01, M.steel, DX, DY - 0.075, DZ + 0.272);
box('desk_controller', 0.24, 0.05, 0.1, M.black, DX + 0.62, DY - 0.055, DZ + 0.22);
box('desk_controller_led', 0.13, 0.022, 0.012, new T.MeshStandardMaterial({ name: 'led_display', color: 0x2a3f52, emissive: 0x6ad2ff, emissiveIntensity: 1.4, roughness: 0.3 }), DX + 0.62, DY - 0.055, DZ + 0.272);
[-1, 1].forEach((sg, i) => {
  const lx = DX + sg * (DW / 2 - 0.16);
  rbox(`desk_column_${i + 1}`, 0.1, DY - 0.09, 0.11, 0.02, M.black, lx, (DY - 0.09) / 2 + 0.03, DZ);
  rbox(`desk_column_inner_${i + 1}`, 0.075, DY - 0.24, 0.085, 0.016, M.black, lx, (DY - 0.24) / 2 + 0.1, DZ);
  rbox(`desk_foot_${i + 1}`, 0.07, 0.05, 0.56, 0.018, M.black, lx, 0.035, DZ);
  [-1, 1].forEach((s2, j) => cyl(`desk_glide_${i + 1}_${j + 1}`, 0.022, 0.026, 0.022, M.black, lx, 0.011, DZ + s2 * 0.24, null, 16));
});
/* left side tray holding a laptop */
rbox('desk_side_tray', 0.56, 0.44, 0.03, 0.01, M.deskTop, DX - DW / 2 - 0.24, DY - 0.1, DZ + 0.18).rotation.set(-Math.PI / 2, 0, 0.06);
rbox('tray_arm', 0.34, 0.05, 0.05, 0.014, M.black, DX - DW / 2 + 0.02, DY - 0.11, DZ + 0.18);

/* ============ white main monitor + side monitor on arm ============ */
const mainMon = new T.Group(); mainMon.name = 'monitor_main';
rbox('monitor_main_shell', 0.74, 0.44, 0.03, 0.012, M.white, 0, 0.22, 0, mainMon);
add('monitor_main_panel', new T.Mesh(new T.PlaneGeometry(0.71, 0.405), matUltra), 0, 0.225, 0.017, mainMon).castShadow = false;
rbox('monitor_main_neck', 0.07, 0.26, 0.045, 0.014, M.white, 0, -0.13, -0.01, mainMon);
rbox('monitor_main_base', 0.3, 0.02, 0.22, 0.008, M.white, 0, -0.25, 0.05, mainMon);
mainMon.position.set(DX - 0.2, DY + 0.278, DZ - 0.18);
mainMon.rotation.y = 0.08;
room.add(mainMon);

const sideMon = new T.Group(); sideMon.name = 'monitor_side';
rbox('monitor_side_shell', 0.56, 0.34, 0.026, 0.012, M.black, 0, 0.17, 0, sideMon);
add('monitor_side_panel', new T.Mesh(new T.PlaneGeometry(0.538, 0.318), matSide), 0, 0.17, 0.015, sideMon).castShadow = false;
rbox('monitor_side_vesa', 0.1, 0.1, 0.03, 0.01, M.black, 0, 0.17, -0.025, sideMon);
sideMon.position.set(DX + 0.62, DY + 0.24, DZ - 0.12);
sideMon.rotation.y = -0.42;
room.add(sideMon);
cyl('monitor_arm_pole', 0.018, 0.018, 0.5, M.black, DX + 0.78, DY + 0.27, DZ - 0.3, null, 20);
cyl('monitor_arm_ring', 0.022, 0.022, 0.05, M.red, DX + 0.78, DY + 0.36, DZ - 0.3, null, 20);
cyl('monitor_arm_clamp', 0.03, 0.03, 0.04, M.black, DX + 0.78, DY + 0.04, DZ - 0.3, null, 20);
const armH = rbox('monitor_arm_horizontal', 0.26, 0.03, 0.03, 0.01, M.black, DX + 0.7, DY + 0.41, DZ - 0.22);
armH.rotation.y = -0.6;

/* ============ laptops ============ */
function laptop(name, w, d, mat, x, y, z, rotY, openAng) {
  const g = new T.Group(); g.name = name;
  rbox(name + '_base', w, d, 0.014, 0.006, mat, 0, 0, 0, g).rotation.x = -Math.PI / 2;
  box(name + '_keyboard', w - 0.06, 0.003, d - 0.1, M.black, 0, 0.009, 0.012, g);
  box(name + '_trackpad', 0.1, 0.004, 0.07, M.steel, 0, 0.009, d / 2 - 0.06, g);
  const lid = new T.Group(); lid.name = name + '_lid';
  lid.position.set(0, 0.007, -d / 2);
  lid.rotation.x = -(openAng - Math.PI / 2);
  rbox(name + '_lid_shell', w, d * 0.92, 0.012, 0.006, mat, 0, d * 0.46, 0, lid);
  add(name + '_lid_screen', new T.Mesh(new T.PlaneGeometry(w - 0.03, d * 0.92 - 0.03), matLap1 === mat ? matLap1 : matLap1), 0, d * 0.46, 0.008, lid).castShadow = false;
  g.add(lid);
  g.position.set(x, y, z); g.rotation.y = rotY;
  room.add(g); return g;
}
const lapA = laptop('laptop_thinkpad', 0.33, 0.23, M.black, DX - 0.16, DY + 0.025, DZ + 0.17, 0.05, 1.85);
lapA.getObjectByName('laptop_thinkpad_lid_screen').material = matLap1;
const lapB = laptop('laptop_hp', 0.34, 0.24, M.silver, DX - DW / 2 - 0.24, DY - 0.08, DZ + 0.2, 0.62, 1.78);
lapB.getObjectByName('laptop_hp_lid_screen').material = matLap2;

/* ============ desk clutter (from your photos) ============ */
const TOP = DY + 0.0175;
/* red mousepad + vertical ergonomic mouse */
const pad = rbox('mousepad_red', 0.24, 0.004, 0.2, 0.006, M.red, DX + 0.3, TOP + 0.002, DZ + 0.16); pad.castShadow = false; pad.rotation.y = -0.08;
box('mousepad_stripe', 0.04, 0.005, 0.15, M.paper, DX + 0.245, TOP + 0.004, DZ + 0.16).rotation.y = -0.08;
const mouse = add('mouse', new T.Mesh(new T.SphereGeometry(0.046, 24, 16), M.black), DX + 0.31, TOP + 0.04, DZ + 0.16);
mouse.scale.set(0.7, 0.85, 1.15); mouse.rotation.z = -0.35;
/* puppy notebook: white pad + four colour quadrants + spiral */
const pup = new T.Group(); pup.name = 'notebook_puppies';
rbox('pup_pages', 0.11, 0.018, 0.15, 0.004, M.paper, 0, 0.009, 0, pup);
[[M.teal, -0.026, -0.036], [M.yellow, 0.026, -0.036], [M.red, -0.026, 0.036], [M.navy, 0.026, 0.036]].forEach(([m, px, pz], i) =>
  box('pup_panel_' + (i + 1), 0.05, 0.002, 0.068, m, px, 0.019, pz, pup));
for (let i = 0; i < 9; i++) { const r = add('pup_spiral_' + (i + 1), new T.Mesh(new T.TorusGeometry(0.006, 0.0012, 6, 12), M.steel), -0.048 + i * 0.012, 0.014, -0.077, pup); r.rotation.y = Math.PI / 2; }
pup.position.set(DX + 0.13, TOP, DZ + 0.24); pup.rotation.y = 0.1; room.add(pup);
/* teal marbled spiral notebook */
const tealNb = new T.Group(); tealNb.name = 'notebook_teal';
rbox('teal_nb_pages', 0.2, 0.022, 0.27, 0.004, M.paper, 0, 0.011, 0, tealNb);
box('teal_nb_cover', 0.19, 0.003, 0.26, M.teal, 0, 0.0235, 0, tealNb);
for (let i = 0; i < 14; i++) { const r = add('teal_spiral_' + (i + 1), new T.Mesh(new T.TorusGeometry(0.008, 0.0012, 6, 12), M.black), -0.085 + i * 0.013, 0.014, -0.137, tealNb); r.rotation.y = Math.PI / 2; }
tealNb.position.set(DX + 0.62, TOP, DZ + 0.15); tealNb.rotation.y = -0.1; room.add(tealNb);
/* sailor duck figure */
const duck = new T.Group(); duck.name = 'duck_figure';
[[-0.018, 0.012], [0.018, -0.006]].forEach(([fx, fz], i) => add('duck_foot_' + (i + 1), new T.Mesh(new T.SphereGeometry(0.02, 14, 10), M.orange), fx, 0.006, fz + 0.01, duck).scale.set(1, 0.35, 1.5));
add('duck_body', new T.Mesh(new T.SphereGeometry(0.036, 20, 16), M.white), 0, 0.05, 0, duck).scale.set(1, 1.1, 0.95);
add('duck_shirt', new T.Mesh(new T.SphereGeometry(0.037, 20, 16), M.sky), 0, 0.075, 0, duck).scale.set(1.02, 0.7, 0.98);
add('duck_bow', new T.Mesh(new T.BoxGeometry(0.03, 0.014, 0.012), M.red), 0, 0.09, 0.03, duck);
add('duck_head', new T.Mesh(new T.SphereGeometry(0.03, 20, 16), M.white), 0, 0.128, 0.008, duck);
add('duck_bill', new T.Mesh(new T.SphereGeometry(0.02, 14, 10), M.orange), 0, 0.12, 0.038, duck).scale.set(1.1, 0.5, 1.4);
add('duck_hat', new T.Mesh(new T.CylinderGeometry(0.03, 0.026, 0.016, 18), M.navy), 0, 0.155, 0.002, duck).rotation.x = 0.2;
[[-1, 0.04], [1, 0.04]].forEach(([sg], i) => add('duck_arm_' + (i + 1), new T.Mesh(new T.CapsuleGeometry(0.008, 0.03, 4, 8), M.sky), sg * 0.038, 0.075, 0.006, duck).rotation.z = sg * 1.2);
duck.position.set(DX + 0.34, TOP, DZ - 0.16); duck.rotation.y = -0.4; room.add(duck);
/* headphones lying on the desk */
const hp = new T.Group(); hp.name = 'headphones';
add('headphone_band', new T.Mesh(new T.TorusGeometry(0.075, 0.009, 10, 32, Math.PI * 1.2), M.navy), 0, 0.02, 0, hp).rotation.set(Math.PI / 2, 0, -0.1);
[[-0.07, 0.03], [0.07, -0.03]].forEach(([cx, cz], i) => {
  const cup = add('headphone_cup_' + (i + 1), new T.Mesh(new T.CylinderGeometry(0.038, 0.038, 0.03, 24), M.navy), cx, 0.018, cz, hp); cup.rotation.z = Math.PI / 2;
  const cushion = add('headphone_pad_' + (i + 1), new T.Mesh(new T.TorusGeometry(0.026, 0.011, 10, 24), M.sky), cx + (i ? -0.016 : 0.016), 0.018, cz, hp); cushion.rotation.y = Math.PI / 2;
});
hp.position.set(DX + 0.52, TOP, DZ - 0.1); hp.rotation.y = 0.5; room.add(hp);
/* playing cards box */
rbox('cards_box', 0.065, 0.02, 0.09, 0.003, M.lime, DX + 0.45, TOP + 0.01, DZ - 0.02).rotation.y = 0.35;
box('cards_box_band', 0.066, 0.021, 0.02, M.red, DX + 0.45, TOP + 0.01, DZ - 0.02).rotation.y = 0.35;
/* twin-bell alarm clock */
const clock = new T.Group(); clock.name = 'alarm_clock';
add('clock_body', new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.035, 28), M.black), 0, 0.055, 0, clock).rotation.x = Math.PI / 2;
add('clock_face', new T.Mesh(new T.CircleGeometry(0.037, 28), M.cream), 0, 0.055, 0.0185, clock);
add('clock_hand_h', new T.Mesh(new T.BoxGeometry(0.003, 0.02, 0.001), M.black), 0, 0.064, 0.02, clock);
add('clock_hand_m', new T.Mesh(new T.BoxGeometry(0.003, 0.03, 0.001), M.black), 0.01, 0.06, 0.0205, clock).rotation.z = -1.2;
[[-1], [1]].forEach(([sg], i) => add('clock_bell_' + (i + 1), new T.Mesh(new T.SphereGeometry(0.02, 16, 12), M.black), sg * 0.028, 0.105, 0, clock));
add('clock_handle', new T.Mesh(new T.TorusGeometry(0.02, 0.003, 8, 18, Math.PI), M.chrome), 0, 0.115, 0, clock);
[[-1], [1]].forEach(([sg], i) => add('clock_foot_' + (i + 1), new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.02, 8), M.chrome), sg * 0.03, 0.01, 0.006, clock).rotation.z = sg * 0.4);
clock.position.set(DX + 0.7, TOP, DZ - 0.2); clock.rotation.y = -0.3; room.add(clock);
/* spray can (dark blue speckle) */
cyl('spray_can', 0.028, 0.028, 0.15, M.navy, DX + 0.16, TOP + 0.075, DZ - 0.12, null, 20);
cyl('spray_cap', 0.026, 0.026, 0.02, M.black, DX + 0.16, TOP + 0.16, DZ - 0.12, null, 20);
/* bike light */
rbox('bike_light', 0.03, 0.02, 0.07, 0.006, M.black, DX + 0.56, TOP + 0.01, DZ + 0.02).rotation.y = 0.6;
box('bike_light_lens', 0.028, 0.012, 0.02, M.red, DX + 0.575, TOP + 0.012, DZ + 0.048).rotation.y = 0.6;
/* pen cup on the left */
cyl('cup_holder', 0.04, 0.036, 0.09, M.black, DX - 0.52, TOP + 0.045, DZ - 0.08, null, 20);
['#e8bf34', '#3fa3a8', '#e2557f', '#f2f1ee'].forEach((c, i) => {
  const m = new T.MeshStandardMaterial({ name: 'pen_' + (i + 1), color: c, roughness: 0.5 });
  cyl('pen_' + (i + 1), 0.005, 0.005, 0.15, m, DX - 0.52 + (i - 1.5) * 0.012, TOP + 0.11, DZ - 0.08, null, 8).rotation.set(0.1 * (i - 1.5), 0, 0.12 * (i - 1.5));
});
/* small red card / sticky */
rbox('card_red', 0.1, 0.006, 0.14, 0.003, M.red, DX - 0.02, TOP + 0.003, DZ - 0.02).rotation.y = -0.3;

/* ============ 3-shade floor lamp with vine (your lamp) ============ */
const lamp = new T.Group(); lamp.name = 'floor_lamp';
cyl('lamp_base', 0.15, 0.17, 0.025, M.black, 0, 0.0125, 0, lamp, 28);
cyl('lamp_pole', 0.017, 0.017, 2.0, M.black, 0, 1.0, 0, lamp, 20);
const shadeGeo = new T.CylinderGeometry(0.115, 0.052, 0.2, 28, 1, true);
[[1.72, 0.5, 0.95], [1.42, 2.5, 0.8], [1.12, 4.4, 1.0]].forEach(([sy, ang, tilt], i) => {
  const armEnd = new T.Vector3(Math.cos(ang) * 0.17, sy, Math.sin(ang) * 0.17);
  const arm = tube(`lamp_arm_${i + 1}`, 0.2, 0.011, M.black, armEnd.x * 0.55, sy - 0.02, armEnd.z * 0.55, lamp);
  arm.rotation.set(0, -ang, Math.PI / 2 - 0.45);
  const sh = add(`lamp_shade_${i + 1}`, new T.Mesh(shadeGeo, M.white), armEnd.x, sy - 0.02, armEnd.z, lamp);
  sh.material = new T.MeshStandardMaterial({ name: 'shade_white_' + (i + 1), color: 0xf7f6f3, roughness: 0.5, side: T.DoubleSide, emissive: 0xffeccf, emissiveIntensity: 0.5 });
  sh.rotation.set(Math.sin(ang) * tilt * 0.5, 0, Math.cos(ang) * tilt * 0.55 + 0.4);
});
/* trailing vine */
for (let i = 0; i < 26; i++) {
  const p = i / 25, a = p * 7.5;
  const lf = add(`vine_leaf_${i + 1}`, new T.Mesh(new T.SphereGeometry(0.035, 12, 8), M.leaf),
    Math.cos(a) * 0.07, 1.92 - p * 0.95, Math.sin(a) * 0.07, lamp);
  lf.scale.set(1, 0.2, 0.7);
  lf.rotation.set(a * 0.4, a, 0.4);
}
lamp.position.set(HW - 0.42, 0, -0.62);
room.add(lamp);

/* ============ mesh office chair ============ */
const chair = new T.Group(); chair.name = 'chair';
for (let i = 0; i < 5; i++) {
  const a = (i / 5) * Math.PI * 2 + 0.5;
  const arm = rbox(`chair_base_arm_${i + 1}`, 0.32, 0.045, 0.06, 0.02, M.black, Math.cos(a) * 0.16, 0.085, Math.sin(a) * 0.16, chair);
  arm.rotation.y = -a;
  const wheel = add(`chair_caster_${i + 1}`, new T.Mesh(new T.TorusGeometry(0.027, 0.013, 12, 22), M.black), Math.cos(a) * 0.31, 0.042, Math.sin(a) * 0.31, chair);
  wheel.rotation.y = -a + Math.PI / 2;
  cyl(`chair_caster_fork_${i + 1}`, 0.011, 0.011, 0.05, M.black, Math.cos(a) * 0.31, 0.086, Math.sin(a) * 0.31, chair, 12);
}
cyl('chair_hub', 0.06, 0.08, 0.055, M.black, 0, 0.1, 0, chair, 24);
cyl('chair_gas_lift', 0.026, 0.026, 0.26, M.steel, 0, 0.26, 0, chair, 20);
cyl('chair_lift_sleeve', 0.042, 0.046, 0.13, M.black, 0, 0.19, 0, chair, 20);
box('chair_tilt_housing', 0.16, 0.06, 0.2, M.black, 0, 0.4, 0.01, chair);
rbox('chair_seat_pan', 0.48, 0.055, 0.46, 0.028, M.black, 0, 0.46, 0.01, chair);
rbox('chair_seat_cushion', 0.44, 0.055, 0.42, 0.03, M.black, 0, 0.5, 0.015, chair);
/* mesh backrest in a slim frame */
const backG = new T.Group(); backG.name = 'chair_backrest';
backG.position.set(0, 0.5, -0.2); backG.rotation.x = -0.13; chair.add(backG);
rbox('chair_back_frame_l', 0.035, 0.6, 0.05, 0.014, M.black, -0.21, 0.32, 0, backG);
rbox('chair_back_frame_r', 0.035, 0.6, 0.05, 0.014, M.black, 0.21, 0.32, 0, backG);
rbox('chair_back_frame_top', 0.46, 0.05, 0.05, 0.018, M.black, 0, 0.61, 0, backG);
rbox('chair_back_frame_bottom', 0.42, 0.04, 0.05, 0.016, M.black, 0, 0.05, 0, backG);
add('chair_back_mesh', new T.Mesh(new T.PlaneGeometry(0.4, 0.55), M.mesh), 0, 0.33, 0.006, backG).castShadow = false;
rbox('chair_lumbar', 0.3, 0.07, 0.05, 0.02, M.black, 0, 0.12, 0.03, backG);
rbox('chair_back_support', 0.09, 0.22, 0.06, 0.02, M.black, 0, -0.07, 0.03, backG);
[-1, 1].forEach((sg, i) => {
  const post = rbox(`chair_arm_post_${i + 1}`, 0.04, 0.2, 0.05, 0.016, M.black, sg * 0.25, 0.58, -0.04, chair);
  post.rotation.z = sg * 0.06;
  rbox(`chair_arm_pad_${i + 1}`, 0.075, 0.03, 0.24, 0.014, M.black, sg * 0.27, 0.69, 0.0, chair);
});
chair.position.set(0.5, 0, -0.28);
chair.rotation.y = -0.35;
room.add(chair);

/* ============ avatar sitting on the chair (avatar.js) ============ */
const avatar = createAvatar({ T, stage, seat: { x: chair.position.x, z: chair.position.z, rotY: chair.rotation.y } });
room.add(avatar.group);
avatar.setChair(chair);
window.__avatar = avatar;

/* ============ loft bed (white tube frame, grey fabric guard) ============ */
const bed = new T.Group(); bed.name = 'loft_bed';
const BW = 0.95, BL = 2.0, BH = 1.45, GH = 0.5;
const corners = [[-BW / 2, -BL / 2], [BW / 2, -BL / 2], [-BW / 2, BL / 2], [BW / 2, BL / 2]];
corners.forEach(([px, pz], i) => cyl('bed_post_' + (i + 1), 0.024, 0.024, BH + GH + 0.06, M.frame, px, (BH + GH + 0.06) / 2, pz, bed, 16));
/* platform frame + visible slats */
rbox('bed_frame_side_l', 0.05, 0.07, BL, 0.012, M.frame, -BW / 2, BH, 0, bed);
rbox('bed_frame_side_r', 0.05, 0.07, BL, 0.012, M.frame, BW / 2, BH, 0, bed);
rbox('bed_frame_end_1', BW, 0.07, 0.05, 0.012, M.frame, 0, BH, -BL / 2, bed);
rbox('bed_frame_end_2', BW, 0.07, 0.05, 0.012, M.frame, 0, BH, BL / 2, bed);
for (let i = 0; i < 14; i++) box('bed_slat_' + (i + 1), BW - 0.06, 0.018, 0.06, M.slat, 0, BH - 0.01, -BL / 2 + 0.1 + i * (BL - 0.2) / 13, bed);
rbox('bed_mattress', BW - 0.1, 0.12, BL - 0.12, 0.04, M.paper, 0, BH + 0.09, 0, bed);
rbox('bed_duvet', BW - 0.12, 0.08, 1.2, 0.04, M.lime, 0, BH + 0.18, 0.25, bed);
/* top rails */
rbox('bed_rail_side_r', 0.03, 0.03, BL, 0.012, M.frame, BW / 2, BH + GH, 0, bed);
rbox('bed_rail_side_l', 0.03, 0.03, BL, 0.012, M.frame, -BW / 2, BH + GH, 0, bed);
rbox('bed_rail_end_1', BW, 0.03, 0.03, 0.012, M.frame, 0, BH + GH, -BL / 2, bed);
rbox('bed_rail_end_2', BW, 0.03, 0.03, 0.012, M.frame, 0, BH + GH, BL / 2, bed);
/* grey fabric guard panels: long side facing the room (two panels) + both ends */
rbox('bed_guard_front_1', 0.02, GH - 0.06, BL / 2 - 0.05, 0.008, M.fabric, BW / 2 + 0.025, BH + GH / 2, -BL / 4, bed);
rbox('bed_guard_front_2', 0.02, GH - 0.06, BL / 2 - 0.05, 0.008, M.fabric, BW / 2 + 0.025, BH + GH / 2, BL / 4, bed);
rbox('bed_guard_end_1', BW - 0.04, GH - 0.06, 0.02, 0.008, M.fabric, 0, BH + GH / 2, -BL / 2 - 0.025, bed);
rbox('bed_guard_end_2', BW - 0.04, GH - 0.06, 0.02, 0.008, M.fabric, 0, BH + GH / 2, BL / 2 + 0.025, bed);
/* yellow corner trims */
[[BW / 2 + 0.03, -BL / 2 - 0.01], [BW / 2 + 0.03, BL / 2 + 0.01], [BW / 2 + 0.03, 0]].forEach(([px, pz], i) => {
  box('bed_trim_top_' + (i + 1), 0.03, 0.02, 0.05, M.yellow, px, BH + GH - 0.04, pz, bed);
  box('bed_trim_bottom_' + (i + 1), 0.03, 0.02, 0.05, M.yellow, px, BH + 0.06, pz, bed);
});
/* pegboard panel under the bed at the window end */
add('bed_pegboard', new T.Mesh(new T.BoxGeometry(BW - 0.06, 0.55, 0.015), M.peg), 0, 0.95, -BL / 2 + 0.03, bed).castShadow = false;
rbox('bed_pegboard_shelf', BW - 0.1, 0.02, 0.12, 0.005, M.frame, 0, 0.68, -BL / 2 + 0.09, bed);
rbox('bed_pegboard_cup', 0.06, 0.09, 0.06, 0.02, M.frame, -0.3, 1.02, -BL / 2 + 0.07, bed);
/* ladder on the room-facing long side, leaning against the bed */
const ladder = new T.Group(); ladder.name = 'bed_ladder';
cyl('ladder_rail_1', 0.018, 0.018, 1.95, M.frame, 0, 0.975, -0.2, ladder, 14);
cyl('ladder_rail_2', 0.018, 0.018, 1.95, M.frame, 0, 0.975, 0.2, ladder, 14);
for (let i = 0; i < 6; i++) cyl('ladder_step_' + (i + 1), 0.015, 0.015, 0.4, M.frame, 0, 0.25 + i * 0.29, 0, ladder, 12).rotation.x = Math.PI / 2;
ladder.position.set(BW / 2 + 0.36, 0, 0.35); ladder.rotation.z = 0.17;
bed.add(ladder);
/* clothes slung over the ladder + rail */
rbox('clothes_jacket', 0.06, 0.55, 0.36, 0.04, M.black, BW / 2 + 0.07, BH + 0.25, -0.45, bed).rotation.z = -0.1;
rbox('clothes_khaki', 0.05, 0.42, 0.2, 0.03, M.cream, BW / 2 + 0.08, BH + 0.12, -0.72, bed).rotation.z = -0.08;
/* under the bed */
rbox('kids_chair_seat', 0.32, 0.03, 0.3, 0.02, M.teal, 0.05, 0.36, -0.55, bed);
rbox('kids_chair_back', 0.3, 0.3, 0.03, 0.02, M.teal, 0.05, 0.53, -0.7, bed).rotation.x = -0.15;
cyl('kids_chair_post', 0.02, 0.02, 0.3, M.white, 0.05, 0.19, -0.55, bed, 14);
for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; rbox('kids_chair_leg_' + (i + 1), 0.22, 0.025, 0.04, 0.01, M.white, 0.05 + Math.cos(a) * 0.1, 0.02, -0.55 + Math.sin(a) * 0.1, bed).rotation.y = -a; }
const ice = new T.Group(); ice.name = 'ice_cream_plush';
add('ice_cone', new T.Mesh(new T.ConeGeometry(0.11, 0.3, 20), M.cone), 0, 0.15, 0, ice).rotation.x = Math.PI;
add('ice_swirl_1', new T.Mesh(new T.SphereGeometry(0.12, 20, 14), M.cream), 0, 0.33, 0, ice);
add('ice_swirl_2', new T.Mesh(new T.SphereGeometry(0.085, 20, 14), M.cream), 0, 0.46, 0, ice);
add('ice_swirl_3', new T.Mesh(new T.SphereGeometry(0.05, 16, 12), M.cream), 0.01, 0.54, 0, ice);
ice.position.set(-0.28, 0.02, -0.85); ice.rotation.z = 0.15; bed.add(ice);
rbox('storage_bin_mint', 0.42, 0.36, 0.42, 0.02, M.mint, 0.05, 0.18, 0.35, bed);
rbox('folded_clothes', 0.3, 0.12, 0.26, 0.03, M.fabric, 0.05, 0.42, 0.35, bed);
rbox('toy_bin_pink', 0.26, 0.14, 0.18, 0.02, M.pink, -0.25, 0.9, -BL / 2 + 0.12, bed);
rbox('toy_bin_blue', 0.28, 0.03, 0.2, 0.01, M.sky, -0.25, 0.985, -BL / 2 + 0.12, bed);
const bedRug = box('bed_rug', BW + 0.3, 0.012, 1.3, M.rug, 0.2, 0.006, 0.1, bed); bedRug.castShadow = false;
bed.position.set(-HW + 0.62, 0, -0.1);
room.add(bed);

/* ============ floor extras ============ */
const rug = cyl('rug', 1.05, 1.05, 0.014, M.rug, 0.25, 0.007, 0.75, null, 40);
rug.castShadow = false; rug.scale.set(1.25, 1, 0.95);
const ball = new T.Group(); ball.name = 'basketball';
add('basketball_body', new T.Mesh(new T.SphereGeometry(0.12, 28, 20), M.teal), 0, 0.12, 0, ball);
add('basketball_seam_1', new T.Mesh(new T.TorusGeometry(0.12, 0.006, 8, 40), M.navy), 0, 0.12, 0, ball).rotation.x = Math.PI / 2;
add('basketball_seam_2', new T.Mesh(new T.TorusGeometry(0.12, 0.006, 8, 40), M.navy), 0, 0.12, 0, ball).rotation.y = 0.6;
add('basketball_seam_3', new T.Mesh(new T.TorusGeometry(0.12, 0.004, 8, 40), M.white), 0, 0.12, 0, ball).rotation.set(0.5, 1.2, 0);
ball.position.set(DX + 0.55, 0, DZ + 0.3); room.add(ball);
cyl('waste_basket', 0.15, 0.12, 0.26, M.teal, HW - 0.36, 0.13, -0.06, null, 24);
rbox('lego_bin', 0.3, 0.16, 0.2, 0.02, M.yellow, HW - 0.3, 0.62, 0.95);
rbox('step_stool_top', 0.3, 0.05, 0.2, 0.02, M.sky, -0.5, 0.24, 1.42);
[-1, 1].forEach((sg, i) => rbox(`step_stool_leg_${i + 1}`, 0.06, 0.24, 0.18, 0.02, M.pink, -0.5 + sg * 0.1, 0.12, 1.42));
rbox('backpack', 0.3, 0.4, 0.2, 0.06, M.black, -0.95, 0.2, 1.25).rotation.y = 0.4;

/* ============ lighting: dim room, neon accents ============ */
stage._key.intensity = 0.12;
stage._key.position.set(4.5, 6.0, 3.0);
stage._key.shadow.radius = 4;
stage._ground.material.opacity = 0.0;
stage._scene.traverse(o => { if (o.isHemisphereLight) o.intensity = 0.08; });
stage._scene.background = new T.Color(0x0b0d12);
stage.style.background = '#0b0d12';
stage._scene.add(new T.AmbientLight(0x35405a, 0.35));
stage._scene.add(viewLight);

const neon = [];
const addNeon = (name, color, intensity, dist, x, y, z) => { const p = new T.PointLight(color, intensity, dist, 2); p.position.set(x, y, z); p.name = name; stage._scene.add(p); neon.push(p); return p; };
/* red LED strip behind the desk */
addNeon('neon_red_1', 0xff2a4a, 5.5, 2.6, DX - 0.3, DY + 0.05, DZ - 0.28);
addNeon('neon_red_2', 0xff2a4a, 4.0, 2.4, DX + 0.5, DY + 0.05, DZ - 0.28);
/* blue from the monitors */
addNeon('neon_blue', 0x3d8dff, 2.2, 2.2, DX - 0.1, DY + 0.35, DZ + 0.35);
/* warm yellow from the 3-shade lamp */
[[1.72, 0.5], [1.42, 2.5], [1.12, 4.4]].forEach(([sy, ang], i) => addNeon('lamp_light_' + (i + 1), 0xffb347, 2.4, 2.4, HW - 0.42 + Math.cos(ang) * 0.2, sy - 0.12, -0.62 + Math.sin(ang) * 0.2));
/* purple wash under the loft bed */
addNeon('neon_purple', 0x8a4dff, 2.6, 2.4, -HW + 0.62, 1.3, -0.1);
/* strip meshes so the glow has a visible source */
box('led_strip_desk', DW - 0.1, 0.012, 0.012, new T.MeshStandardMaterial({ name: 'led_red', color: 0xff2a4a, emissive: 0xff2a4a, emissiveIntensity: 3, toneMapped: false }), DX, DY - 0.03, DZ - DD / 2 + 0.02);
box('led_strip_bed', 0.012, 0.012, BL - 0.1, new T.MeshStandardMaterial({ name: 'led_purple', color: 0x8a4dff, emissive: 0x8a4dff, emissiveIntensity: 3, toneMapped: false }), -HW + 0.62 + BW / 2, BH - 0.05, -0.1);

stage._renderer.toneMapping = T.ACESFilmicToneMapping;
stage._renderer.toneMappingExposure = 1.15;
stage._controls.autoRotateSpeed = 0.7;

/* ============ hover links + curtain click ============ */
const LINKS = [
  { test: n => n.startsWith('monitor_main') || n === 'screen_main', label: 'LG 32" Smart Monitor — view product', url: 'https://www.lg.com/ca_en/monitors/smart-monitors/32u720sa-w/' },
  { test: n => n.startsWith('laptop_hp'), label: 'HP Elite x360 1040 G11 — view product', url: 'https://www.hp.com/us-en/shop/pdp/hp-elite-x360-1040-14-inch-g11-2-in-1-notebook-pc-wolf-pro-security-edition-p-cp3m0ua-aba-1' },
  { test: n => n.startsWith('loft_bed') || n.startsWith('bed_') || n.startsWith('ladder_'), label: 'IKEA VITVAL Loft Bed — view product', url: 'https://www.ikea.com/ca/en/p/vitval-loft-bed-frame-white-light-gray-70411239/' },
  { test: n => n.startsWith('avatar'), label: "That's me 👋 — click to say hi", action: () => avatar.command('hi') },
  { test: n => n.startsWith('curtain'), label: 'Click to open / close the curtains', action: () => window.__toggleCurtains() },
];
const tip = document.createElement('div');
tip.style.cssText = 'position:fixed;pointer-events:none;z-index:50;padding:8px 12px;border-radius:8px;background:rgba(12,14,20,.92);color:#f2f4f8;font:500 13px/1.2 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4);opacity:0;transition:opacity .15s;white-space:nowrap';
document.body.appendChild(tip);
const ray = new T.Raycaster(), ndc = new T.Vector2();
let hovered = null;
function pick(ev) {
  const r = stage.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, stage._camera);
  const hits = ray.intersectObjects(stage._scene.children, true);
  for (const h of hits) {
    if (h.object.name === 'city_view' || h.object.name === 'window_glass') continue;
    let o = h.object;
    /* baked glb merges the HP body into room_props — treat hits near its screen as the laptop */
    if (o.name === 'room_props') {
      const scr = stage._scene.getObjectByName('laptop_hp_screen');
      if (scr && h.point.distanceTo(new T.Box3().setFromObject(scr).getCenter(new T.Vector3())) < 0.3) return LINKS.find(L => L.test('laptop_hp'));
    }
    /* same for the loft bed: hit inside the bed frame (or its ladder) volume, in room coords */
    if (o.name === 'room_props') {
      const q = o.parent.worldToLocal(h.point.clone());
      const inBed = q.x > -1.75 && q.x < -0.72 && q.z > -1.14 && q.z < 0.94;
      const inLadder = q.x >= -0.72 && q.x < -0.33 && q.z > 0.1 && q.z < 0.6;
      if (q.y > 0.03 && q.y < 2.05 && (inBed || inLadder)) return LINKS.find(L => L.test('loft_bed'));
    }
    while (o) { const l = LINKS.find(L => L.test(o.name || '')); if (l) return l; o = o.parent; }
    return null;
  }
  return null;
}
stage.addEventListener('pointermove', (ev) => {
  hovered = pick(ev);
  stage.style.cursor = hovered ? 'pointer' : '';
  if (hovered) { tip.textContent = hovered.label; tip.style.left = (ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY + 14) + 'px'; tip.style.opacity = '1'; }
  else tip.style.opacity = '0';
});
let downAt = null;
stage.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
stage.addEventListener('pointerup', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 6) return;
  const l = pick(ev); if (!l) return;
  if (l.url) window.open(l.url, '_blank', 'noopener'); else if (l.action) l.action();
});

/* ============ animated screens ============ */
const t0 = performance.now();
(function tick(now) {
  const t = ((now || t0) - t0) / 1000;
  avatar.update();
  for (const s of screens) {
    if (!s.live) continue;
    s.draw(s.ctx, s.w, s.h, t);
    s.tex.needsUpdate = true;
  }
  /* curtains slide toward the frame edges */
  curtain.open += (curtain.target - curtain.open) * 0.06;
  [curtainL, curtainR].forEach(g => {
    const pleats = g.children[0];
    pleats.children.forEach((p, i) => { p.position.z = p.userData.baseZ * (1 - curtain.open * 0.82); p.scale.x = 1 + curtain.open * 0.5; });
  });
  viewLight.intensity = curtain.open * 3.2;
  viewMat.opacity = Math.min(1, curtain.open * 1.4); cityView.visible = curtain.open > 0.01;
  if (curtain.open > 0.02 && Math.floor(t * 30) % 2 === 0) { drawView(vctx, t); viewTex.needsUpdate = true; }
  neon.forEach((p, i) => { if (p.name.startsWith('neon_red')) p.intensity = (i ? 4.0 : 5.5) * (0.92 + 0.08 * Math.sin(t * 2.1 + i)); });
  requestAnimationFrame(tick);
})(t0);

room.rotation.y = -0.55;
const outside = [cityView, room.getObjectByName('window_backing')];
outside.forEach(o => room.remove(o));
stage.setObject(room);
outside.forEach(o => room.add(o));
const frame = () => { stage._camera.position.set(3.4, 2.9, 4.9); stage._controls.target.set(0, 1.0, 0); stage._controls.update(); };
frame();

/* ---- Blender drop-in: put a baked room.glb in this folder and it replaces the primitive room ---- */
try {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  new GLTFLoader().load('./room.glb', (gltf) => {
    const baked = gltf.scene; baked.name = 'room_baked';
    const liveMats = { screen_main: matUltra, screen_side: matSide, screen_laptop: matLap1, laptop_hp_screen: matLap2 };
    const keepFromPrimitive = ['city_view', 'window_backing', 'window_glass', 'curtain_left', 'curtain_right', 'curtain_rod', 'curtain_finial_1', 'curtain_finial_2', 'led_strip_desk', 'led_strip_bed', 'avatar'];
    baked.traverse((o) => {
      if (!o.isMesh) return;
      if (liveMats[o.name]) { o.material = liveMats[o.name]; o.material.side = T.FrontSide; o.material.toneMapped = false; return; }
      if (o.name === 'window_blinds' || o.name === 'window_glass') { o.visible = false; return; }
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      const map = src && (src.map || (src.emissiveMap));
      // baked lighting: unlit material so the bake shows exactly as rendered in Blender
      // dimmed bake as emissive + real-time neon lights layered on top
      o.material = new T.MeshStandardMaterial({ name: src ? src.name : o.name, map, color: map ? 0xffffff : (src && src.color) || 0xcccccc, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.28, roughness: 1, metalness: 0 });
      o.receiveShadow = true;
      if (map) { map.colorSpace = T.SRGBColorSpace; map.anisotropy = 8; map.flipY = false; }
    });
    stage._ground.visible = false;
    baked.rotation.y = 0.55;
    /* carve the office chair out of the merged props mesh so the avatar can swivel / roll it */
    const props = baked.getObjectByName('room_props');
    if (props && props.geometry.index) {
      props.updateMatrix();
      const g = props.geometry, idx = g.index.array, pos = g.attributes.position, keep = [], take = [], c = new T.Vector3();
      const cx = chair.position.x, cz = chair.position.z;
      for (let i = 0; i < idx.length; i += 3) {
        c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(new T.Vector3().fromBufferAttribute(pos, idx[i + k])); c.multiplyScalar(1 / 3).applyMatrix4(props.matrix);
        (c.y > -0.005 && c.y < 1.35 && Math.hypot(c.x - cx, c.z - cz) < 0.42 ? take : keep).push(idx[i], idx[i + 1], idx[i + 2]);
      }
      if (take.length) {
        const cg = new T.BufferGeometry(); for (const a in g.attributes) cg.setAttribute(a, g.attributes[a]); cg.setIndex(take); cg.computeBoundingSphere();
        g.setIndex(keep); g.computeBoundingSphere();
        const chairMesh = new T.Mesh(cg, props.material); chairMesh.name = 'chair_baked'; chairMesh.castShadow = chairMesh.receiveShadow = true;
        chairMesh.position.copy(props.position); chairMesh.quaternion.copy(props.quaternion); chairMesh.scale.copy(props.scale);
        const holder = new T.Group(); holder.position.set(-cx, 0, -cz); holder.add(chairMesh);
        const pivot = new T.Group(); pivot.name = 'chair'; pivot.position.set(cx, 0, cz); pivot.rotation.y = chair.rotation.y; pivot.add(holder);
        baked.add(pivot); avatar.setChair(pivot);
      }
    }
    const late = [];
    keepFromPrimitive.forEach(n => { const o = room.getObjectByName(n); if (!o) return; if (n === 'city_view' || n === 'window_backing') late.push(o); else baked.add(o); });
    stage.setObject(baked);
    late.forEach(o => baked.add(o));
    frame();
    baked.updateMatrixWorld(true);
  }, undefined, () => {});
} catch (e) { /* loader unavailable offline — primitive room stays */ }
