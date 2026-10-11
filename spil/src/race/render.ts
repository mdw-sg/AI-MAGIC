// Pseudo-3D renderer: projects track segments from the camera, then paints road, scenery
// and cars back to front so nearer hills naturally cover what lies behind them. The same
// track is drawn either in daylight or as the cave below it.
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

type Palette = {
  skyTop: string
  skyBottom: string
  fog: string
  grass: [string, string]
  rumble: [string, string]
  road: [string, string]
  lane: string | null
}

const DAY: Palette = {
  skyTop: '#3b6fd6',
  skyBottom: '#a8d8ff',
  fog: '#c4e2f5',
  grass: ['#4cbb4f', '#43a846'],
  rumble: ['#ffffff', '#e8384f'],
  road: ['#6b6b74', '#64646c'],
  lane: '#ffffff',
}

const CAVE: Palette = {
  skyTop: '#0b0706',
  skyBottom: '#2a1a12',
  fog: '#140c08',
  grass: ['#3a2a20', '#33251c'],
  rumble: ['#5a3a22', '#4a2f1b'],
  road: ['#8a5a32', '#7e5230'],
  lane: null,
}

export type RenderCar = { z: number; offset: number; height: number; colors: CarColors }

export type View = {
  /** Camera z (the player's car is PLAYER_Z ahead of it). */
  position: number
  /** Player's sideways position, −1…1 is the road. */
  playerX: number
  skyOffset: number
  hillOffset: number
  /** Extra camera height, so the view rises with the car on jumps. */
  cameraLift: number
  /** Draw the cave under the track instead of the daylight world. */
  cave: boolean
  /** Seconds, for animating lava and arrows. */
  time: number
  /** Whether a cave coin has already been picked up this lap. */
  coinTaken?: (id: number) => boolean
}

export function renderWorld(ctx: Ctx, w: number, h: number, track: Track, view: View, cars: RenderCar[]) {
  const pal = view.cave ? CAVE : DAY
  if (view.cave) drawCaveBackground(ctx, w, h, view)
  else drawBackground(ctx, w, h, view)

  const segs = track.segments
  const base = track.findSegment(view.position)
  const basePercent = (view.position % SEGMENT_LENGTH) / SEGMENT_LENGTH
  const playerSeg = track.findSegment(view.position + PLAYER_Z)
  const playerPercent = ((view.position + PLAYER_Z) % SEGMENT_LENGTH) / SEGMENT_LENGTH
  const playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPercent)
  const camY = playerY + CAMERA_HEIGHT + view.cameraLift

  // Bucket the cars by segment so they're drawn in depth order with the scenery.
  const carsBySeg = new Map<number, RenderCar[]>()
  for (const car of cars) {
    const i = track.findSegment(car.z).index
    const list = carsBySeg.get(i)
    if (list) list.push(car)
    else carsBySeg.set(i, [car])
  }

  // Front-to-back pass: project and work out which road strips are visible.
  type Visible = { seg: Segment; drawRoad: boolean; fog: number }
  const visible: Visible[] = []
  let maxY = h
  let x = 0
  let dx = -(base.curve * basePercent)
  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const seg = segs[(base.index + n) % segs.length]
    const looped = seg.index < base.index
    const camZ = view.position - (looped ? track.length : 0)
    const camX = view.playerX * ROAD_WIDTH
    project(seg.p1, camX - x, camY, camZ, w, h)
    project(seg.p2, camX - x - dx, camY, camZ, w, h)
    x += dx
    dx += seg.curve
    if (seg.p1.camera.z <= CAMERA_DEPTH) continue
    const drawRoad = seg.p2.screen.y < seg.p1.screen.y && seg.p2.screen.y < maxY
    const d = n / DRAW_DISTANCE
    visible.push({ seg, drawRoad, fog: fogAmount(view.cave ? d * 2.2 : d) })
    if (drawRoad) maxY = seg.p1.screen.y
  }

  // Back-to-front pass: road strip, then what stands on it.
  for (let i = visible.length - 1; i >= 0; i--) {
    const { seg, drawRoad, fog } = visible[i]
    if (view.cave && !seg.cave) {
      // Beyond the cave's exit: daylight shining in.
      if (drawRoad) {
        ctx.fillStyle = '#fff3c4'
        ctx.fillRect(0, seg.p2.screen.y, w, seg.p1.screen.y - seg.p2.screen.y + 1)
      }
      continue
    }
    if (drawRoad) {
      if (seg.lava && !view.cave) drawLava(ctx, w, seg, view.time)
      else drawSegment(ctx, w, seg, pal, fog)
      if (!view.cave && seg.arrow && seg.arrow.n % 6 === 0) {
        drawArrow(ctx, seg, segs[(seg.index + 3) % segs.length], seg.arrow.x, seg.arrow.n, view.time)
      }
      if (!view.cave && seg.hole) drawHole(ctx, seg, seg.hole.x, seg.hole.halfW, view.time)
    }
    if (!view.cave && seg.ramp) drawRamp(ctx, h, seg, seg.ramp.x, seg.ramp.halfW, seg.ramp.h1, seg.ramp.h2, false)
    if (view.cave && seg.caveRamp) drawRamp(ctx, h, seg, 0, 1, seg.caveRamp.h1, seg.caveRamp.h2, true)
    for (const sprite of seg.sprites) {
      if (view.cave) drawCaveSprite(ctx, w, seg, sprite, view.time)
      else drawSprite(ctx, w, seg, sprite)
    }
    if (view.cave && seg.blade) drawBlades(ctx, h, seg, seg.blade.x, seg.blade.reach, view.time)
    if (view.cave && seg.coins) {
      for (const coin of seg.coins) if (!view.coinTaken?.(coin.id)) drawCoin(ctx, h, seg, coin.id, coin.x, view.time)
    }
    const segCars = carsBySeg.get(seg.index)
    if (segCars) {
      // Further-away cars first within the segment.
      segCars.sort((a, b) => b.z - a.z)
      for (const car of segCars) drawRoadCar(ctx, w, h, seg, car)
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

/** Screen pixels per world unit at the player's depth (for heights and sizes). */
export function playerScale(h: number) {
  return (CAMERA_DEPTH / PLAYER_Z) * (h / 2)
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

function drawSegment(ctx: Ctx, w: number, seg: Segment, pal: Palette, fog: number) {
  const { x: x1, y: y1, w: w1 } = seg.p1.screen
  const { x: x2, y: y2, w: w2 } = seg.p2.screen
  const d = seg.dark ? 1 : 0
  const r1 = w1 / 6
  const r2 = w2 / 6

  ctx.fillStyle = pal.grass[d]
  ctx.fillRect(0, y2, w, y1 - y2 + 1)

  ctx.fillStyle = pal.rumble[d]
  quad(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2)
  quad(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2)

  ctx.fillStyle = pal.road[d]
  quad(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2)

  if (seg.checker && pal === DAY) {
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
  } else if (!seg.dark && pal.lane) {
    const l1 = w1 / 40
    const l2 = w2 / 40
    ctx.fillStyle = pal.lane
    for (let lane = 1; lane < LANES; lane++) {
      const f = -1 + (2 * lane) / LANES
      quad(ctx, x1 + w1 * f - l1, y1, x1 + w1 * f + l1, y1, x2 + w2 * f + l2, y2, x2 + w2 * f - l2, y2)
    }
  }

  if (fog > 0.01) {
    ctx.globalAlpha = Math.min(1, fog)
    ctx.fillStyle = pal.fog
    ctx.fillRect(0, y2, w, y1 - y2 + 1)
    ctx.globalAlpha = 1
  }
}

/** A lava pool across the whole width, glowing and bubbling. */
function drawLava(ctx: Ctx, w: number, seg: Segment, time: number) {
  const { x: x1, y: y1, w: w1 } = seg.p1.screen
  const { x: x2, y: y2, w: w2 } = seg.p2.screen
  const glow = 0.5 + 0.5 * Math.sin(time * 5 + seg.index * 0.7)
  ctx.fillStyle = seg.dark ? '#d9360c' : '#e8440f'
  ctx.fillRect(0, y2, w, y1 - y2 + 1)
  ctx.fillStyle = `rgb(255, ${Math.round(90 + glow * 60)}, 30)`
  quad(ctx, x1 - w1 * 1.4, y1, x1 + w1 * 1.4, y1, x2 + w2 * 1.4, y2, x2 - w2 * 1.4, y2)
  // Two bubbles per strip, at fixed spots that swell and pop.
  for (let k = 0; k < 2; k++) {
    const f = (((seg.index * 37 + k * 53) % 100) / 50 - 1) * 1.2
    const r = w1 * 0.06 * Math.max(0, Math.sin(time * 3 + seg.index + k * 2))
    if (r < 1) continue
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.ellipse(x1 + w1 * f, (y1 + y2) / 2, r, r * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Yellow chevron painted on the road, part of a chase-light running towards the ramp. */
function drawArrow(ctx: Ctx, near: Segment, far: Segment, ax: number, n: number, time: number) {
  if (far.p2.camera.z <= CAMERA_DEPTH) return
  const { x: x1, y: y1, w: w1 } = near.p1.screen
  const { x: x2, y: y2, w: w2 } = far.p2.screen
  if (y2 >= y1) return
  const lit = (((Math.floor(n / 6) - Math.floor(time * 8)) % 4) + 4) % 4 === 0
  const cx1 = x1 + w1 * ax
  const cx2 = x2 + w2 * ax
  const half = w1 * 0.26
  ctx.strokeStyle = lit ? '#fff45c' : '#c9a82a'
  ctx.lineWidth = Math.max(2, w1 * 0.07)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx1 - half, y1)
  ctx.lineTo(cx2, y2)
  ctx.lineTo(cx1 + half, y1)
  ctx.stroke()
}

/** Dark hole in the road with an earthy rim and a few twinkles to make it inviting. */
function drawHole(ctx: Ctx, seg: Segment, hx: number, halfW: number, time: number) {
  const { x: x1, y: y1, w: w1 } = seg.p1.screen
  const { x: x2, y: y2, w: w2 } = seg.p2.screen
  const rim = halfW * 1.25
  ctx.fillStyle = '#6b4423'
  quad(ctx, x1 + w1 * (hx - rim), y1, x1 + w1 * (hx + rim), y1, x2 + w2 * (hx + rim), y2, x2 + w2 * (hx - rim), y2)
  ctx.fillStyle = '#120a06'
  quad(ctx, x1 + w1 * (hx - halfW), y1, x1 + w1 * (hx + halfW), y1, x2 + w2 * (hx + halfW), y2, x2 + w2 * (hx - halfW), y2)
  const tw = Math.sin(time * 6 + seg.index)
  if (tw > 0.6) {
    ctx.fillStyle = '#fff6a0'
    circle(ctx, x1 + w1 * (hx + (seg.index % 3 - 1) * halfW * 0.5), (y1 + y2) / 2, Math.max(1.5, w1 * 0.02))
  }
}

/**
 * A ramp section on the road from height h1 (near) to h2 (far), between lateral offsets
 * x ± halfW. Seen from behind we see its sides and the sloping top.
 */
function drawRamp(ctx: Ctx, h: number, seg: Segment, rx: number, halfW: number, h1: number, h2: number, wood: boolean) {
  const p1 = seg.p1.screen
  const p2 = seg.p2.screen
  const xl1 = p1.x + p1.w * (rx - halfW)
  const xr1 = p1.x + p1.w * (rx + halfW)
  const xl2 = p2.x + p2.w * (rx - halfW)
  const xr2 = p2.x + p2.w * (rx + halfW)
  const yt1 = p1.y - p1.scale * h1 * (h / 2)
  const yt2 = p2.y - p2.scale * h2 * (h / 2)
  ctx.fillStyle = wood ? '#4a2f1b' : '#4a4a55'
  quad(ctx, xl1, p1.y, xl2, p2.y, xl2, yt2, xl1, yt1)
  quad(ctx, xr1, p1.y, xr2, p2.y, xr2, yt2, xr1, yt1)
  if (wood) ctx.fillStyle = seg.index % 2 ? '#b07a40' : '#9a6834'
  else ctx.fillStyle = seg.index % 2 ? '#ffd23f' : '#2a2a2a'
  quad(ctx, xl1, yt1, xr1, yt1, xr2, yt2, xl2, yt2)
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

/** Four swords spinning on a post, like a windmill facing the driver. */
function drawBlades(ctx: Ctx, h: number, seg: Segment, bx: number, reach: number, time: number) {
  const p = seg.p1.screen
  const unit = p.w / ROAD_WIDTH
  if (unit <= 0) return
  const x = p.x + bx * p.w
  const hubY = p.y - p.scale * 950 * (h / 2)
  const len = reach * p.w
  ctx.fillStyle = '#e8384f'
  ctx.fillRect(x - 160 * unit, p.y - 60 * unit, 320 * unit, 60 * unit)
  ctx.fillStyle = '#3a3a44'
  ctx.fillRect(x - 50 * unit, hubY, 100 * unit, p.y - hubY)
  const spin = time * 4.5 + seg.index
  for (let k = 0; k < 4; k++) {
    const a = spin + (k * Math.PI) / 2
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    // Blade as a tapered quad from the hub outwards, with a gold cross-guard.
    const along = (d: number, side: number) => [x + cos * d - sin * side, hubY + sin * d + cos * side] as const
    const wb = 70 * unit
    const [ax, ay] = along(len * 0.22, -wb)
    const [bx2, by] = along(len * 0.22, wb)
    const [tx, ty] = along(len, 0)
    ctx.fillStyle = '#dfe4ec'
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(tx, ty)
    ctx.lineTo(bx2, by)
    ctx.fill()
    const [gx1, gy1] = along(len * 0.2, -wb * 2)
    const [gx2, gy2] = along(len * 0.2, wb * 2)
    ctx.strokeStyle = '#ffd23f'
    ctx.lineWidth = Math.max(2, 45 * unit)
    ctx.beginPath()
    ctx.moveTo(gx1, gy1)
    ctx.lineTo(gx2, gy2)
    ctx.stroke()
  }
  ctx.fillStyle = '#ffd23f'
  circle(ctx, x, hubY, 90 * unit)
}

/** A spinning gold coin floating above the cave floor. */
function drawCoin(ctx: Ctx, h: number, seg: Segment, id: number, cx: number, time: number) {
  const p = seg.p1.screen
  const unit = p.w / ROAD_WIDTH
  const r = 170 * unit
  if (r < 1) return
  const x = p.x + cx * p.w
  const y = p.y - p.scale * (300 + Math.sin(time * 4 + id) * 40) * (h / 2)
  const rx = Math.max(r * 0.15, r * Math.abs(Math.cos(time * 4 + id * 0.7)))
  ctx.fillStyle = '#b8860b'
  ctx.beginPath()
  ctx.ellipse(x, y, rx, r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffd23f'
  ctx.beginPath()
  ctx.ellipse(x, y, rx * 0.8, r * 0.8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.beginPath()
  ctx.ellipse(x - rx * 0.25, y - r * 0.3, rx * 0.18, r * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** In the cave the scenery slots become glowing crystals, lanterns and dark rocks. */
function drawCaveSprite(ctx: Ctx, w: number, seg: Segment, sprite: Sprite, time: number) {
  if (sprite.kind === 'arch') return
  const p = seg.p1.screen
  const unit = p.w / ROAD_WIDTH
  // Pull the scenery in against the tunnel walls.
  const x = p.x + Math.sign(sprite.offset) * Math.min(Math.abs(sprite.offset), 2) * p.w
  const y = p.y
  if (unit <= 0 || y < -50) return
  const size = 900 * unit
  if (x + size < 0 || x - size > w) return

  if (sprite.kind === 'pine') {
    // Lantern on a post
    ctx.fillStyle = '#3a2a1a'
    ctx.fillRect(x - size * 0.04, y - size * 1.1, size * 0.08, size * 1.1)
    const flicker = 0.8 + 0.2 * Math.sin(time * 12 + seg.index)
    ctx.fillStyle = `rgba(255, 200, 80, ${0.25 * flicker})`
    circle(ctx, x, y - size * 1.15, size * 0.45)
    ctx.fillStyle = '#ffd36b'
    circle(ctx, x, y - size * 1.15, size * 0.12)
  } else if (sprite.kind === 'tree' || sprite.kind === 'sign') {
    // Crystal cluster
    const hue = sprite.variant > 0.5 ? 190 : 285
    const shine = 55 + 15 * Math.sin(time * 3 + seg.index)
    for (const [dx, hgt, wd] of [
      [-0.18, 0.7, 0.14],
      [0, 1, 0.18],
      [0.2, 0.6, 0.13],
    ]) {
      ctx.fillStyle = `hsl(${hue}, 85%, ${shine}%)`
      ctx.beginPath()
      ctx.moveTo(x + dx * size - wd * size, y)
      ctx.lineTo(x + dx * size, y - hgt * size)
      ctx.lineTo(x + dx * size + wd * size, y)
      ctx.fill()
    }
  } else {
    ctx.fillStyle = '#4a3a30'
    ctx.beginPath()
    ctx.moveTo(x - size * 0.5, y)
    ctx.lineTo(x - size * 0.25, y - size * 0.5)
    ctx.lineTo(x + size * 0.2, y - size * 0.6)
    ctx.lineTo(x + size * 0.5, y)
    ctx.fill()
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

function drawRoadCar(ctx: Ctx, w: number, h: number, seg: Segment, car: RenderCar) {
  const t = (car.z % SEGMENT_LENGTH) / SEGMENT_LENGTH
  const scale = lerp(seg.p1.screen.scale, seg.p2.screen.scale, t)
  const x = lerp(seg.p1.screen.x, seg.p2.screen.x, t) + scale * car.offset * ROAD_WIDTH * (w / 2)
  const y = lerp(seg.p1.screen.y, seg.p2.screen.y, t)
  const s = scale * CAR_WIDTH * (w / 2)
  if (s < 2 || x + s < 0 || x - s > w) return
  const lift = scale * car.height * (h / 2)
  if (lift > 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(x, y, s * 0.45, s * 0.06, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  drawCar(ctx, x, y - s * 0.18 - lift, s, 0, car.colors, lift <= 1)
}

function drawBackground(ctx: Ctx, w: number, h: number, view: View) {
  const sky = ctx.createLinearGradient(0, 0, 0, h / 2)
  sky.addColorStop(0, DAY.skyTop)
  sky.addColorStop(1, DAY.skyBottom)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h / 2 + 2)
  ctx.fillStyle = DAY.grass[0]
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

/** Dark rock ceiling with stalactites drifting with the curves. */
function drawCaveBackground(ctx: Ctx, w: number, h: number, view: View) {
  const sky = ctx.createLinearGradient(0, 0, 0, h / 2)
  sky.addColorStop(0, CAVE.skyTop)
  sky.addColorStop(1, CAVE.skyBottom)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h / 2 + 2)
  ctx.fillStyle = CAVE.grass[0]
  ctx.fillRect(0, h / 2, w, h / 2)
  ctx.fillStyle = '#1e140f'
  const shift = view.hillOffset * w
  for (let i = -1; i < 14; i++) {
    const x = ((((i * 97 - shift) % (w + 200)) + w + 200) % (w + 200)) - 100
    const len = h * (0.08 + ((i * 53) % 7) * 0.025)
    ctx.beginPath()
    ctx.moveTo(x - 30, 0)
    ctx.lineTo(x + 30, 0)
    ctx.lineTo(x, len)
    ctx.fill()
  }
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
