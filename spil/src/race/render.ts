// Pseudo-3D renderer: projects track segments from the camera, then paints road, scenery
// and cars back to front so nearer hills naturally cover what lies behind them.
import { drawCar, roundRect, circle, type CarColors, type Ctx } from '../ui'
import { SEGMENT_LENGTH, type Point, type Segment, type Sprite, type Track } from './track'

export const ROAD_WIDTH = 2000 // half the road's width, in world units
export const CAMERA_HEIGHT = 1000
export const CAMERA_DEPTH = 1 / Math.tan(((100 / 2) * Math.PI) / 180) // 100° field of view
export const DRAW_DISTANCE = 300
/** How far in front of the camera the player's car is (a bit further than the classic
 *  value, so the car sits above the bottom edge and the turbo flames have room). */
export const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH * 1.3
export const CAR_WIDTH = 700
const LANES = 3

const COLORS = {
  skyTop: '#3b6fd6',
  skyBottom: '#a8d8ff',
  fog: '#c4e2f5',
  grass: ['#4cbb4f', '#43a846'],
  rumble: ['#ffffff', '#e8384f'],
  road: ['#6b6b74', '#64646c'],
  lane: '#ffffff',
}

export type RenderCar = { z: number; offset: number; colors: CarColors }

export type View = {
  /** Camera z (the player's car is PLAYER_Z ahead of it). */
  position: number
  /** Player's sideways position, −1…1 is the road. */
  playerX: number
  skyOffset: number
  hillOffset: number
}

export function renderWorld(ctx: Ctx, w: number, h: number, track: Track, view: View, cars: RenderCar[]) {
  drawBackground(ctx, w, h, view)

  const segs = track.segments
  const base = track.findSegment(view.position)
  const basePercent = (view.position % SEGMENT_LENGTH) / SEGMENT_LENGTH
  const playerSeg = track.findSegment(view.position + PLAYER_Z)
  const playerPercent = ((view.position + PLAYER_Z) % SEGMENT_LENGTH) / SEGMENT_LENGTH
  const playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPercent)

  // Bucket the cars by segment so they're drawn in depth order with the scenery.
  const carsBySeg = new Map<number, RenderCar[]>()
  for (const car of cars) {
    const i = track.findSegment(car.z).index
    const list = carsBySeg.get(i)
    if (list) list.push(car)
    else carsBySeg.set(i, [car])
  }

  // Front-to-back pass: project and work out which road strips are visible.
  type Visible = { seg: Segment; looped: boolean; drawRoad: boolean; fog: number }
  const visible: Visible[] = []
  let maxY = h
  let x = 0
  let dx = -(base.curve * basePercent)
  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const seg = segs[(base.index + n) % segs.length]
    const looped = seg.index < base.index
    const camZ = view.position - (looped ? track.length : 0)
    const camX = view.playerX * ROAD_WIDTH
    project(seg.p1, camX - x, playerY + CAMERA_HEIGHT, camZ, w, h)
    project(seg.p2, camX - x - dx, playerY + CAMERA_HEIGHT, camZ, w, h)
    x += dx
    dx += seg.curve
    if (seg.p1.camera.z <= CAMERA_DEPTH) continue
    const drawRoad = seg.p2.screen.y < seg.p1.screen.y && seg.p2.screen.y < maxY
    visible.push({ seg, looped, drawRoad, fog: fogAmount(n / DRAW_DISTANCE) })
    if (drawRoad) maxY = seg.p1.screen.y
  }

  // Back-to-front pass: road strip, then the scenery and cars standing on it.
  for (let i = visible.length - 1; i >= 0; i--) {
    const { seg, drawRoad, fog } = visible[i]
    if (drawRoad) drawSegment(ctx, w, seg, fog)
    for (const sprite of seg.sprites) drawSprite(ctx, w, seg, sprite)
    const segCars = carsBySeg.get(seg.index)
    if (segCars) {
      // Further-away cars first within the segment.
      segCars.sort((a, b) => b.z - a.z)
      for (const car of segCars) drawRoadCar(ctx, w, seg, car)
    }
  }
}

/** Screen y of the road surface under the player, for placing the player's car. */
export function playerGroundY(track: Track, view: View, h: number) {
  const seg = track.findSegment(view.position + PLAYER_Z)
  const t = ((view.position + PLAYER_Z) % SEGMENT_LENGTH) / SEGMENT_LENGTH
  const camY = lerp(seg.p1.camera.y, seg.p2.camera.y, t)
  return h / 2 - (CAMERA_DEPTH / PLAYER_Z) * camY * (h / 2)
}

export function playerCarSize(w: number) {
  return (CAMERA_DEPTH / PLAYER_Z) * CAR_WIDTH * (w / 2)
}

function project(p: Point, camX: number, camY: number, camZ: number, w: number, h: number) {
  p.camera.x = -camX
  p.camera.y = p.world.y - camY
  p.camera.z = p.world.z - camZ
  const scale = CAMERA_DEPTH / p.camera.z
  p.screen.scale = scale
  p.screen.x = Math.round(w / 2 + scale * p.camera.x * (w / 2))
  p.screen.y = Math.round(h / 2 - scale * p.camera.y * (h / 2))
  p.screen.w = Math.round(scale * ROAD_WIDTH * (w / 2))
}

function drawSegment(ctx: Ctx, w: number, seg: Segment, fog: number) {
  const { x: x1, y: y1, w: w1 } = seg.p1.screen
  const { x: x2, y: y2, w: w2 } = seg.p2.screen
  const d = seg.dark ? 1 : 0
  const r1 = w1 / 6
  const r2 = w2 / 6

  ctx.fillStyle = COLORS.grass[d]
  ctx.fillRect(0, y2, w, y1 - y2 + 1)

  ctx.fillStyle = COLORS.rumble[d]
  quad(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2)
  quad(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2)

  ctx.fillStyle = COLORS.road[d]
  quad(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2)

  if (seg.checker) {
    // Checkered start/finish line: two rows of black and white squares.
    const cols = 12
    for (let row = 0; row < 2; row++) {
      const ya = lerp(y1, y2, row / 2)
      const yb = lerp(y1, y2, (row + 1) / 2)
      const xa = lerp(x1, x2, row / 2)
      const xb = lerp(x1, x2, (row + 1) / 2)
      const wa = lerp(w1, w2, row / 2)
      const wb = lerp(w1, w2, (row + 1) / 2)
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (c + row + (seg.dark ? 1 : 0)) % 2 ? '#111' : '#fff'
        const fa = -1 + (2 * c) / cols
        const fb = -1 + (2 * (c + 1)) / cols
        quad(ctx, xa + wa * fa, ya, xa + wa * fb, ya, xb + wb * fb, yb, xb + wb * fa, yb)
      }
    }
  } else if (!seg.dark) {
    const l1 = w1 / 40
    const l2 = w2 / 40
    ctx.fillStyle = COLORS.lane
    for (let lane = 1; lane < LANES; lane++) {
      const f = -1 + (2 * lane) / LANES
      quad(ctx, x1 + w1 * f - l1, y1, x1 + w1 * f + l1, y1, x2 + w2 * f + l2, y2, x2 + w2 * f - l2, y2)
    }
  }

  if (fog > 0.01) {
    ctx.globalAlpha = fog
    ctx.fillStyle = COLORS.fog
    ctx.fillRect(0, y2, w, y1 - y2 + 1)
    ctx.globalAlpha = 1
  }
}

function drawSprite(ctx: Ctx, w: number, seg: Segment, sprite: Sprite) {
  const p = seg.p1.screen
  const unit = p.w / ROAD_WIDTH // screen pixels per world unit at this depth
  const x = p.x + sprite.offset * p.w
  const y = p.y
  if (unit <= 0 || y < -50) return

  if (sprite.kind === 'arch') return drawArch(ctx, seg)

  const size = { tree: 1300, pine: 1100, bush: 900, rock: 700, sign: 1200 }[sprite.kind] * unit
  if (x + size < 0 || x - size > w) return

  switch (sprite.kind) {
    case 'tree': {
      ctx.fillStyle = '#7a4a24'
      ctx.fillRect(x - size * 0.06, y - size * 0.6, size * 0.12, size * 0.6)
      ctx.fillStyle = sprite.variant > 0.5 ? '#2e8b3a' : '#3a9a32'
      circle(ctx, x, y - size * 0.85, size * 0.38)
      circle(ctx, x - size * 0.25, y - size * 0.65, size * 0.26)
      circle(ctx, x + size * 0.25, y - size * 0.65, size * 0.26)
      break
    }
    case 'pine': {
      ctx.fillStyle = '#6b3f1f'
      ctx.fillRect(x - size * 0.05, y - size * 0.3, size * 0.1, size * 0.3)
      ctx.fillStyle = '#1f6b3a'
      for (let i = 0; i < 3; i++) {
        const top = y - size * (0.75 + i * 0.35)
        const half = size * (0.38 - i * 0.08)
        ctx.beginPath()
        ctx.moveTo(x, top - size * 0.35)
        ctx.lineTo(x + half, top + size * 0.25)
        ctx.lineTo(x - half, top + size * 0.25)
        ctx.fill()
      }
      break
    }
    case 'bush':
      ctx.fillStyle = '#3f9f3a'
      circle(ctx, x - size * 0.2, y - size * 0.18, size * 0.22)
      circle(ctx, x + size * 0.2, y - size * 0.18, size * 0.22)
      circle(ctx, x, y - size * 0.3, size * 0.26)
      break
    case 'rock':
      ctx.fillStyle = '#8d8d96'
      ctx.beginPath()
      ctx.moveTo(x - size * 0.5, y)
      ctx.lineTo(x - size * 0.3, y - size * 0.45)
      ctx.lineTo(x + size * 0.15, y - size * 0.55)
      ctx.lineTo(x + size * 0.5, y)
      ctx.fill()
      break
    case 'sign': {
      ctx.fillStyle = '#444'
      ctx.fillRect(x - size * 0.03, y - size * 0.6, size * 0.06, size * 0.6)
      ctx.fillStyle = '#fff'
      roundRect(ctx, x - size * 0.5, y - size * 1.1, size, size * 0.55, size * 0.06)
      ctx.font = `${Math.round(size * 0.38)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(['🏎️', '⭐', '🏁', '🔥'][Math.floor(sprite.variant * 4)], x, y - size * 0.82)
      break
    }
  }
}

/** Start/finish gantry spanning the road, with a checkered banner. */
function drawArch(ctx: Ctx, seg: Segment) {
  const { x, y, w: rw } = seg.p1.screen
  const unit = rw / ROAD_WIDTH
  const height = 2600 * unit
  const pole = 120 * unit
  const left = x - rw * 1.2
  const right = x + rw * 1.2
  ctx.fillStyle = '#d9d9e0'
  ctx.fillRect(left - pole / 2, y - height, pole, height)
  ctx.fillRect(right - pole / 2, y - height, pole, height)
  const bannerH = 500 * unit
  const top = y - height
  const cols = 16
  const cw = (right - left) / cols
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (c + r) % 2 ? '#111' : '#fff'
      ctx.fillRect(left + c * cw, top + (r * bannerH) / 2, cw + 1, bannerH / 2 + 1)
    }
  }
}

function drawRoadCar(ctx: Ctx, w: number, seg: Segment, car: RenderCar) {
  const t = (car.z % SEGMENT_LENGTH) / SEGMENT_LENGTH
  const scale = lerp(seg.p1.screen.scale, seg.p2.screen.scale, t)
  const x = lerp(seg.p1.screen.x, seg.p2.screen.x, t) + scale * car.offset * ROAD_WIDTH * (w / 2)
  const y = lerp(seg.p1.screen.y, seg.p2.screen.y, t)
  const s = scale * CAR_WIDTH * (w / 2)
  if (s < 2 || x + s < 0 || x - s > w) return
  drawCar(ctx, x, y - s * 0.18, s, 0, car.colors)
}

function drawBackground(ctx: Ctx, w: number, h: number, view: View) {
  const sky = ctx.createLinearGradient(0, 0, 0, h / 2)
  sky.addColorStop(0, COLORS.skyTop)
  sky.addColorStop(1, COLORS.skyBottom)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h / 2 + 2)
  ctx.fillStyle = COLORS.grass[0]
  ctx.fillRect(0, h / 2, w, h / 2)

  // Sun and clouds drift with the sky.
  const sunX = (((w * 0.75 - view.skyOffset * w) % (w * 2)) + w * 2) % (w * 2)
  ctx.fillStyle = '#fff3b0'
  circle(ctx, sunX - w * 0.3, h * 0.14, h * 0.06)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  for (let i = 0; i < 4; i++) {
    const cx = ((((i * 0.3 + 0.1 - view.skyOffset * 0.5) % 1.2) + 1.2) % 1.2) * w * 1.1 - w * 0.05
    const cy = h * (0.08 + (i % 2) * 0.08)
    circle(ctx, cx, cy, h * 0.035)
    circle(ctx, cx + h * 0.04, cy - h * 0.015, h * 0.045)
    circle(ctx, cx + h * 0.09, cy, h * 0.035)
  }

  ridge(ctx, w, h, view.skyOffset * 0.6, h * 0.12, '#7d9fcf', 0.004, 0.011)
  ridge(ctx, w, h, view.hillOffset, h * 0.06, '#3f9a4a', 0.007, 0.017)
}

function ridge(ctx: Ctx, w: number, h: number, offset: number, height: number, color: string, f1: number, f2: number) {
  const base = h / 2 + 2
  const shift = offset * w
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, base)
  for (let x = 0; x <= w + 16; x += 16) {
    const u = x + shift
    const y = base - height * (0.55 + 0.3 * Math.sin(u * f1) + 0.15 * Math.sin(u * f2 + 1.3))
    ctx.lineTo(x, y)
  }
  ctx.lineTo(w + 16, base)
  ctx.fill()
}

function quad(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.lineTo(x4, y4)
  ctx.fill()
}

function fogAmount(distance: number) {
  return 1 - 1 / Math.exp(distance * distance * 4)
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
