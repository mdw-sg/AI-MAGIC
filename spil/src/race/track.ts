// The race track: a loop of short road segments, each with a curve amount and a height,
// in the classic pseudo-3D style (see Jake Gordon's "javascript-racer"). Curves are only
// "felt" when rendering (segments are accumulated sideways), hills are real world-y values.

export const SEGMENT_LENGTH = 200
export const RUMBLE_LENGTH = 3
/** Segment index of the start/finish line. */
export const START_SEGMENT = 20

export type SpriteKind = 'tree' | 'pine' | 'bush' | 'rock' | 'sign' | 'arch'
export type Sprite = { kind: SpriteKind; offset: number; variant: number }

export type Point = {
  world: { y: number; z: number }
  camera: { x: number; y: number; z: number }
  screen: { x: number; y: number; w: number; scale: number }
}

export type Segment = {
  index: number
  p1: Point
  p2: Point
  curve: number
  dark: boolean
  checker: boolean
  sprites: Sprite[]
  /** Lava pool across the whole road. */
  lava?: boolean
  /** Part of a jump ramp in front of lava: lateral centre/half-width and height at p1/p2. */
  ramp?: { x: number; halfW: number; h1: number; h2: number }
  /** Blinking chevron leading to a ramp; n counts along the arrow run for the chase-light. */
  arrow?: { x: number; n: number }
  /** Hole in the road that drops you into the cave below. */
  hole?: { x: number; halfW: number }
  /** Below ground, this segment is part of the cave (others show as daylight ahead). */
  cave?: boolean
  /** Full-width ramp at the end of the cave, heights at p1/p2. */
  caveRamp?: { h1: number; h2: number }
}

export type LavaZone = { arrowStart: number; rampStart: number; lavaStart: number; lavaEnd: number; x: number }
export type HoleZone = { start: number; end: number; x: number; rampStart: number; exit: number }

// Feature sizes, in segments (one segment is 1/60 s at full speed).
export const RAMP_HEIGHT = 700
const ARROW_LEN = 44
const RAMP_LEN = 12
const LAVA_LEN = 40
const HOLE_LEN = 5
const HOLE_HALF_WIDTH = 0.34
const CAVE_LEN = 230
const CAVE_RAMP_LEN = 16

export class Track {
  segments: Segment[] = []
  lavas: LavaZone[] = []
  holes: HoleZone[] = []

  get length(): number {
    return this.segments.length * SEGMENT_LENGTH
  }

  findSegment(z: number): Segment {
    const n = this.segments.length
    return this.segments[((Math.floor(z / SEGMENT_LENGTH) % n) + n) % n]
  }
}

const LENGTH = { SHORT: 25, MEDIUM: 50 }
const CURVE = { EASY: 2, MEDIUM: 4, HARD: 6 }
const HILL = { NONE: 0, LOW: 20, MEDIUM: 40, HIGH: 60 }

export function buildTrack(): Track {
  const track = new Track()
  const segs = track.segments
  const lastY = () => (segs.length === 0 ? 0 : segs[segs.length - 1].p2.world.y)

  const point = (y: number, z: number): Point => ({
    world: { y, z },
    camera: { x: 0, y: 0, z: 0 },
    screen: { x: 0, y: 0, w: 0, scale: 0 },
  })

  const addSegment = (curve: number, y: number) => {
    const n = segs.length
    segs.push({
      index: n,
      p1: point(lastY(), n * SEGMENT_LENGTH),
      p2: point(y, (n + 1) * SEGMENT_LENGTH),
      curve,
      dark: Math.floor(n / RUMBLE_LENGTH) % 2 === 1,
      checker: false,
      sprites: [],
    })
  }

  const addRoad = (enter: number, hold: number, leave: number, curve: number, height: number) => {
    const startY = lastY()
    const endY = startY + height * SEGMENT_LENGTH
    const total = enter + hold + leave
    for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total))
    for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total))
    for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total))
  }

  const straight = (len: number) => addRoad(len, len, len, 0, 0)
  const hill = (len: number, height: number) => addRoad(len, len, len, 0, height)
  const curve = (len: number, c: number, height = 0) => addRoad(len, len, len, c, height)
  const sCurves = () => {
    addRoad(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, -CURVE.EASY, HILL.NONE)
    addRoad(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, CURVE.MEDIUM, HILL.MEDIUM)
    addRoad(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, CURVE.EASY, -HILL.LOW)
  }
  const rollingHills = (height = HILL.LOW) => {
    const len = LENGTH.SHORT
    addRoad(len, len, len, 0, height / 2)
    addRoad(len, len, len, 0, -height)
    addRoad(len, len, len, CURVE.EASY, height)
    addRoad(len, len, len, 0, 0)
    addRoad(len, len, len, -CURVE.EASY, height / 2)
    addRoad(len, len, len, 0, 0)
  }

  straight(LENGTH.SHORT)
  rollingHills()
  curve(LENGTH.MEDIUM, CURVE.MEDIUM, HILL.LOW)
  straight(LENGTH.SHORT)
  sCurves()
  hill(LENGTH.MEDIUM, HILL.HIGH)
  curve(LENGTH.MEDIUM, -CURVE.MEDIUM, HILL.NONE)
  straight(LENGTH.SHORT)
  curve(LENGTH.MEDIUM, CURVE.HARD, -HILL.LOW)
  rollingHills(HILL.MEDIUM)
  curve(LENGTH.MEDIUM, CURVE.EASY, -HILL.MEDIUM)
  // Back down to height 0 so the loop joins up seamlessly.
  addRoad(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, -CURVE.EASY, -lastY() / SEGMENT_LENGTH)

  segs[START_SEGMENT].checker = true
  segs[START_SEGMENT + 1].checker = true
  segs[START_SEGMENT].sprites.push({ kind: 'arch', offset: 0, variant: 0 })

  // Two lava pools and two holes per lap, placed on calm stretches so a child can aim.
  addLava(track, calmFrom(segs, 330, ARROW_LEN + RAMP_LEN + LAVA_LEN), -0.45)
  addHole(track, calmFrom(segs, 760, 60), 0.5)
  addLava(track, calmFrom(segs, 1240, ARROW_LEN + RAMP_LEN + LAVA_LEN), 0.45)
  addHole(track, calmFrom(segs, 1640, 60), -0.5)

  decorate(track)
  return track
}

function calmFrom(segs: Segment[], from: number, len: number): number {
  for (let i = from; i < segs.length - len; i++) {
    let calm = true
    for (let j = i; j < i + len && calm; j++) calm = Math.abs(segs[j].curve) <= CURVE.EASY + 0.5
    if (calm) return i
  }
  return from
}

function addLava(track: Track, start: number, x: number) {
  const segs = track.segments
  const zone: LavaZone = {
    arrowStart: start,
    rampStart: start + ARROW_LEN,
    lavaStart: start + ARROW_LEN + RAMP_LEN,
    lavaEnd: start + ARROW_LEN + RAMP_LEN + LAVA_LEN,
    x,
  }
  for (let i = zone.arrowStart; i < zone.rampStart; i++) segs[i].arrow = { x, n: i - zone.arrowStart }
  for (let i = zone.rampStart; i < zone.lavaStart; i++) {
    const n = i - zone.rampStart
    segs[i].ramp = { x, halfW: 0.4, h1: (RAMP_HEIGHT * n) / RAMP_LEN, h2: (RAMP_HEIGHT * (n + 1)) / RAMP_LEN }
  }
  for (let i = zone.lavaStart; i < zone.lavaEnd; i++) {
    segs[i].lava = true
    segs[i].sprites = []
  }
  track.lavas.push(zone)
}

function addHole(track: Track, start: number, x: number) {
  const segs = track.segments
  const zone: HoleZone = {
    start,
    end: start + HOLE_LEN,
    x,
    rampStart: start + CAVE_LEN - CAVE_RAMP_LEN,
    exit: start + CAVE_LEN,
  }
  for (let i = zone.start; i < zone.end; i++) segs[i].hole = { x, halfW: HOLE_HALF_WIDTH }
  for (let i = zone.start; i < zone.exit; i++) segs[i].cave = true
  for (let i = zone.rampStart; i < zone.exit; i++) {
    const n = i - zone.rampStart
    segs[i].caveRamp = { h1: (RAMP_HEIGHT * n) / CAVE_RAMP_LEN, h2: (RAMP_HEIGHT * (n + 1)) / CAVE_RAMP_LEN }
  }
  track.holes.push(zone)
}

/** Roadside scenery, from a seeded random so the track looks the same every race. */
function decorate(track: Track) {
  const rand = mulberry32(7)
  const segs = track.segments
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s.lava) continue
    if (i % 4 === 0) {
      const side = rand() < 0.5 ? -1 : 1
      const r = rand()
      const kind: SpriteKind = r < 0.4 ? 'tree' : r < 0.7 ? 'pine' : r < 0.9 ? 'bush' : 'rock'
      s.sprites.push({ kind, offset: side * (1.4 + rand() * 2.5), variant: rand() })
    }
    if (i % 7 === 0 && rand() < 0.6) {
      const kind: SpriteKind = rand() < 0.5 ? 'tree' : 'pine'
      s.sprites.push({ kind, offset: (rand() < 0.5 ? -1 : 1) * (2.5 + rand() * 3), variant: rand() })
    }
    // Billboards before curves give the road some landmarks.
    if (i % 150 === 40) s.sprites.push({ kind: 'sign', offset: rand() < 0.5 ? -1.35 : 1.35, variant: rand() })
  }
}

function easeIn(a: number, b: number, t: number) {
  return a + (b - a) * t * t
}
function easeInOut(a: number, b: number, t: number) {
  return a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5)
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
