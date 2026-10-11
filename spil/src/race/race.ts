// One race: countdown, driving physics, computer cars, laps, turbo, finishing order and the
// in-race HUD. Everything a 7-year-old needs to read is a picture or a number.
import { audio } from '../audio'
import { Particles, drawFlameJet, drawLightning, drawSpeedLines } from '../effects'
import {
  CAR_COLORS,
  MEDAL,
  circle,
  drawAgainIcon,
  drawCar,
  drawIconButton,
  drawPlayButton,
  hitButton,
  roundRect,
  type CarColors,
  type Ctx,
  type IconButton,
} from '../ui'
import { PLAYER_Z, lerp, playerCarSize, playerGroundY, playerScale, renderWorld } from './render'
import { SEGMENT_LENGTH, START_SEGMENT, buildTrack, type LavaZone } from './track'

export const LAPS = 3
const MAX_SPEED = SEGMENT_LENGTH * 60 // one segment per frame at 60 fps
const TURBO_SPEED = MAX_SPEED * 1.5
const ACCEL = MAX_SPEED / 3
const OFFROAD_LIMIT = MAX_SPEED / 3.5
const CENTRIFUGAL = 0.15
const TURBO_TIME = 2.5
const TURBO_CHARGE_TIME = 10
const COUNTDOWN = 3
const FINISH_DELAY = 4.5
const GRAVITY = 12000
const CAVE_SPEED = MAX_SPEED * 1.25 // the cave is a reward: faster than the road above
const CAVE_LAUNCH_VY = 11000 // the big leap out of the cave
const RESPAWN_TIME = 0.9
const FALL_TIME = 0.45
const COINS_FOR_SHIELD = 15
/** Chance that a computer car takes a hole when it passes one. */
const AI_HOLE_CHANCE = 0.3

const PLACE_WORDS = ['', 'et', 'to', 'tre', 'fire', 'fem', 'seks']

type JumpKind = 'lava' | 'cave'
type Racer = {
  colors: CarColors
  dist: number
  offset: number
  speed: number
  finished: boolean
  /** Height above the road (world units) and vertical speed, for ramps and jumps. */
  height: number
  vy: number
  /** Set while driving up a ramp; leaving its top edge launches the car. */
  ramp: JumpKind | null
}
type Opponent = Racer & {
  baseSpeed: number
  targetOffset: number
  retarget: number
  /** Driving in the cave below the track. */
  cave: boolean
  /** Which hole (lap:start) the car last decided about, and whether it goes in. */
  holePlan: { key: string; dive: boolean } | null
}

export type RaceResult = { place: number; order: CarColors[]; player: CarColors }
export type RaceAction = 'restart' | 'menu' | null

export const MIN_LEVEL = 1
export const MAX_LEVEL = 5

/**
 * Difficulty levels 1–5. `speed` scales the computer cars' top speed; `ahead` is how much they
 * ease off when far / a bit in front of the player, `behind` how much they push when far / a
 * bit behind. Level 2 is the original tuning (which turned out a little too easy); at level 5
 * the fastest car beats the player's top speed and only clean driving plus turbo wins.
 */
const LEVELS: Record<number, { speed: number; ahead: [number, number]; behind: [number, number] }> = {
  1: { speed: 0.9, ahead: [0.85, 0.93], behind: [1.12, 1.05] },
  2: { speed: 1.0, ahead: [0.88, 0.95], behind: [1.12, 1.05] },
  3: { speed: 1.1, ahead: [0.94, 0.98], behind: [1.12, 1.06] },
  4: { speed: 1.13, ahead: [0.98, 1], behind: [1.14, 1.07] },
  5: { speed: 1.17, ahead: [1, 1], behind: [1.16, 1.08] },
}

// Grid slots in segments behind the line; the player starts at the back to have cars to chase.
const GRID = [
  { d: -2, o: -0.5, speed: 0.93 },
  { d: -2, o: 0.5, speed: 0.9 },
  { d: -5, o: -0.5, speed: 0.87 },
  { d: -5, o: 0.5, speed: 0.84 },
  { d: -8, o: -0.5, speed: 0.8 },
]
const PLAYER_SLOT = { d: -8, o: 0.5 }

export class Race {
  readonly track = buildTrack()
  state: 'grid' | 'countdown' | 'racing' | 'finished' = 'grid'
  paused = false
  onFinish?: (result: RaceResult) => void

  private readonly lineZ = START_SEGMENT * SEGMENT_LENGTH
  private readonly level: (typeof LEVELS)[number]
  private player: Racer
  private opponents: Opponent[]
  private finishOrder: Racer[] = []
  private steer = 0
  private countdown = COUNTDOWN
  private lastCount = 0
  private lap = 1
  private turboCharge = 0.6
  private turboTime = 0
  private shake = 0
  private bumpCooldown = 0
  private finishTimer = 0
  private skyOffset = 0
  private hillOffset = 0
  private time = 0
  private particles = new Particles()
  private exhaust = { x: 0, y: 0, s: 0 }
  /** Below ground: dropping through a hole, or driving in the cave. */
  private cave: 'falling' | 'in' | null = null
  private fallTimer = 0
  private airKind: JumpKind | null = null
  private respawnTimer = 0
  private respawnZone: LavaZone | null = null
  private blink = 0
  private flash = { color: '#000', a: 0 }
  private coins = 0
  private shield = false
  private takenCoins = new Set<string>()
  private coinPulse = 0
  /** Seconds left of the wobble after hitting the swords. */
  private wobble = 0
  private w = 0
  private h = 0

  constructor(level: number) {
    this.level = LEVELS[Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)))]
    this.player = {
      colors: CAR_COLORS[0],
      dist: PLAYER_SLOT.d * SEGMENT_LENGTH,
      offset: PLAYER_SLOT.o,
      speed: 0,
      finished: false,
      height: 0,
      vy: 0,
      ramp: null,
    }
    this.opponents = GRID.map((g, i) => ({
      colors: CAR_COLORS[i + 1],
      dist: g.d * SEGMENT_LENGTH,
      offset: g.o,
      speed: 0,
      finished: false,
      height: 0,
      vy: 0,
      ramp: null,
      baseSpeed: MAX_SPEED * g.speed * this.level.speed,
      targetOffset: g.o,
      retarget: 1 + Math.random() * 2,
      cave: false,
      holePlan: null,
    }))
  }

  start() {
    this.state = 'countdown'
    this.countdown = COUNTDOWN
    this.lastCount = 0
  }

  // ---- buttons -----------------------------------------------------------

  private get turboButton(): IconButton {
    return { x: this.w - 115, y: this.h - 115, r: 80 }
  }
  private get pauseButton(): IconButton {
    return { x: this.w - 50, y: 50, r: 28 }
  }
  private get invertButton(): IconButton {
    return { x: 40, y: this.h - 40, r: 22 }
  }
  private get centerButton(): IconButton {
    return { x: 100, y: this.h - 40, r: 22 }
  }
  private get resumeButton(): IconButton {
    return { x: this.w / 2, y: this.h / 2, r: Math.min(this.w, this.h) * 0.14 }
  }
  private get restartButton(): IconButton {
    return { x: this.w / 2 - Math.min(this.w, this.h) * 0.35, y: this.h / 2, r: Math.min(this.w, this.h) * 0.09 }
  }
  private get menuButton(): IconButton {
    return { x: this.w / 2 + Math.min(this.w, this.h) * 0.35, y: this.h / 2, r: Math.min(this.w, this.h) * 0.09 }
  }

  /** Handles a finger touching the screen; returns what main should do, if anything. */
  pointer(x: number, y: number, tilt: { toggleInvert(): void; calibrate(): void }): RaceAction {
    if (this.paused) {
      if (hitButton(this.resumeButton, x, y)) this.paused = false
      else if (hitButton(this.restartButton, x, y)) return 'restart'
      else if (hitButton(this.menuButton, x, y)) return 'menu'
      return null
    }
    if (this.state === 'grid') return null
    if (hitButton(this.pauseButton, x, y)) this.paused = true
    else if (hitButton(this.turboButton, x, y)) this.fireTurbo()
    else if (hitButton(this.invertButton, x, y)) tilt.toggleInvert()
    else if (hitButton(this.centerButton, x, y)) tilt.calibrate()
    return null
  }

  fireTurbo() {
    if (this.state !== 'racing' || this.turboCharge < 1 || this.turboTime > 0) return
    this.turboTime = TURBO_TIME
    this.turboCharge = 0
    this.shake = 1
    audio.whoosh()
  }

  // ---- update ------------------------------------------------------------

  update(dt: number, steer: number) {
    if (this.paused) {
      audio.engine(0, false)
      return
    }
    this.time += dt
    this.steer = steer

    if (this.state === 'countdown') {
      this.countdown -= dt
      const count = Math.ceil(this.countdown)
      if (count !== this.lastCount && count > 0) {
        this.lastCount = count
        audio.beep()
        audio.speak(PLACE_WORDS[count] === 'et' ? 'en' : PLACE_WORDS[count])
      }
      if (this.countdown <= 0) {
        this.state = 'racing'
        audio.beep(true)
        audio.speak('Kør!')
      }
    }
    const moving = this.state === 'racing' || this.state === 'finished'
    audio.engine(this.player.speed / MAX_SPEED, this.state !== 'grid' && this.respawnTimer === 0)
    if (moving) {
      // A little slow motion while flying over lava.
      const slow = this.player.height > 0 && this.airKind === 'lava' ? 0.6 : 1
      this.updatePlayer(dt * slow)
      this.updateOpponents(dt * slow)
    }
    this.flash.a = Math.max(0, this.flash.a - dt * 2.5)
    this.coinPulse = Math.max(0, this.coinPulse - dt * 3)
    this.wobble = Math.max(0, this.wobble - dt)
    this.blink = Math.max(0, this.blink - dt)

    if (this.state === 'finished') {
      this.finishTimer += dt
      if (this.finishTimer > FINISH_DELAY && this.onFinish) {
        const cb = this.onFinish
        this.onFinish = undefined
        audio.engine(0, false)
        cb({ place: this.place(), order: this.ranking().map((r) => r.colors), player: this.player.colors })
      }
    }

    this.shake = Math.max(0, this.shake - dt * 1.5)
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt)
    this.particles.update(dt)
  }

  private updatePlayer(dt: number) {
    const p = this.player
    const L = this.track.length

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt
      if (this.respawnTimer <= 0) this.respawn()
      return
    }

    const seg = this.track.findSegment(this.z(p))
    const speedPct = p.speed / MAX_SPEED

    // After the finish line the car steers itself back to the middle and slows down.
    const steer = p.finished ? clamp(-p.offset * 2, -1, 1) : this.steer
    const dx = dt * 1.9 * Math.min(speedPct, 1.3)
    p.offset += dx * steer
    p.offset -= dx * speedPct * seg.curve * CENTRIFUGAL
    // The cave has walls; up top you can wander out onto the grass.
    p.offset = this.cave ? clamp(p.offset, -1, 1) : clamp(p.offset, -2.5, 2.5)
    // The coin shield bounces the car back the first time it heads off the road.
    if (this.shield && !this.cave && p.height <= 0 && !p.finished && Math.abs(p.offset) > 1.02) {
      p.offset = Math.sign(p.offset) * 0.85
      this.shield = false
      this.coins = 0
      this.coinPulse = 1
      audio.boing()
      const { x, y, s } = this.exhaust
      for (let i = 0; i < 24; i++) this.particles.spark(x + Math.sign(p.offset) * s * 0.5, y - s * 0.2, s)
    }

    const turbo = this.turboTime > 0
    if (turbo) this.turboTime = Math.max(0, this.turboTime - dt)
    else if (this.state === 'racing') this.turboCharge = Math.min(1, this.turboCharge + dt / TURBO_CHARGE_TIME)

    const offroad = !this.cave && p.height <= 0 && Math.abs(p.offset) > 1.1
    let target = p.finished ? MAX_SPEED * 0.5 : turbo ? TURBO_SPEED : this.cave ? CAVE_SPEED : MAX_SPEED
    if (offroad) target = Math.min(target, turbo ? OFFROAD_LIMIT * 1.6 : OFFROAD_LIMIT)
    if (p.speed < target) p.speed = Math.min(target, p.speed + ACCEL * dt * (turbo ? 3 : 1))
    else if (p.height <= 0) p.speed = Math.max(target, p.speed - MAX_SPEED * 0.8 * dt)

    if (this.cave === 'falling') {
      this.fallTimer += dt
      p.height = -9000 * this.fallTimer * this.fallTimer
      this.flash = { color: '#000', a: Math.min(1, this.fallTimer / FALL_TIME) }
      if (this.fallTimer >= FALL_TIME) {
        this.cave = 'in'
        p.height = 0
        p.vy = 0
        this.flash = { color: '#000', a: 1 }
      }
    } else {
      const rampBefore = p.ramp
      const event = this.vertical(p, this.cave === 'in', dt)
      if (event === 'launch') {
        this.airKind = rampBefore
        audio.jump()
        if (this.airKind === 'cave') {
          this.cave = null
          this.flash = { color: '#fff', a: 1 }
          setTimeout(() => audio.speak('Juhu!'), 200)
        }
      } else if (event === 'land') {
        this.airKind = null
        audio.land()
        this.shake = Math.max(this.shake, 0.8)
        const { x, y, s } = this.exhaust
        for (let i = 0; i < 12; i++) this.particles.dirt(x + (Math.random() - 0.5) * s, y + s * 0.08, s)
      }
      if (p.height <= 0 && p.vy === 0) this.airKind = null
    }

    // Running into the back of a computer car slows you to its speed and nudges you aside.
    {
      for (const o of this.opponents) {
        if (o.cave !== (this.cave === 'in') || this.cave === 'falling') continue
        const dz = o.dist - p.dist
        const sameLevel = Math.abs(o.height - p.height) < 300
        if (sameLevel && dz > 0 && dz < 320 && Math.abs(o.offset - p.offset) < 0.33 && p.speed > o.speed) {
          p.speed = o.speed * 0.92
          p.offset += (p.offset < o.offset ? -1 : 1) * 0.06
          this.shake = Math.max(this.shake, 0.5)
          if (this.bumpCooldown === 0) {
            audio.bump()
            this.bumpCooldown = 0.4
          }
        }
      }
    }

    const fromSeg = Math.floor(this.z(p) / SEGMENT_LENGTH)
    p.dist += p.speed * dt
    if (this.cave === 'in') this.collectCoins(fromSeg, Math.floor(this.z(p) / SEGMENT_LENGTH))
    this.skyOffset += (0.001 * seg.curve * p.speed * dt) / SEGMENT_LENGTH
    this.hillOffset += (0.002 * seg.curve * p.speed * dt) / SEGMENT_LENGTH

    // Hazards on the road surface (after the finish the car just rolls on).
    const here = this.track.findSegment(this.z(p))
    if (!this.cave && !p.finished && p.height <= 0) {
      if (here.lava) return this.die()
      if (here.hole && Math.abs(p.offset - here.hole.x) < here.hole.halfW) {
        this.cave = 'falling'
        this.fallTimer = 0
        p.ramp = null
        audio.fall()
      }
    }

    const lap = clamp(Math.floor(p.dist / L) + 1, 1, LAPS)
    if (lap > this.lap && !p.finished) {
      this.lap = lap
      audio.ding()
      setTimeout(() => audio.speak(lap === LAPS ? 'Sidste omgang!' : 'Omgang to!'), 400)
    }
    if (!p.finished && p.dist >= LAPS * L) {
      p.finished = true
      this.finishOrder.push(p)
      this.state = 'finished'
      this.turboTime = 0
      const place = this.place()
      if (place <= 3) audio.fanfare()
      else audio.ding()
      setTimeout(() => audio.speak(place === 1 ? 'Du vandt!' : `Du blev nummer ${PLACE_WORDS[place]}!`), 700)
    }

    // Effects are spawned at where the car was drawn last frame.
    const { x, y, s } = this.exhaust
    if (s > 0) {
      if (this.turboTime > 0) for (const side of [-1, 1]) for (let i = 0; i < 2; i++) this.particles.flame(x + side * s * 0.28, y + s * 0.15, s)
      if (offroad && p.speed > 1000) for (const side of [-1, 1]) this.particles.dirt(x + side * s * 0.42, y + s * 0.08, s)
    }
  }

  /** Picks up the cave coins, and runs into the swords, between two segments. */
  private collectCoins(from: number, to: number) {
    const p = this.player
    const n = this.track.segments.length
    for (let i = from; i !== (to + 1) % n; i = (i + 1) % n) {
      const blade = this.track.segments[i].blade
      if (blade && this.wobble === 0 && Math.abs(p.offset - blade.x) < blade.reach) {
        p.speed *= 0.3
        this.wobble = 0.8
        this.shake = Math.max(this.shake, 0.9)
        audio.clang()
        const { x, y, s } = this.exhaust
        for (let k = 0; k < 20; k++) this.particles.spark(x, y - s * 0.3, s)
      }
      for (const coin of this.track.segments[i].coins ?? []) {
        const key = `${this.lap}:${coin.id}`
        if (this.takenCoins.has(key) || Math.abs(p.offset - coin.x) > 0.25) continue
        this.takenCoins.add(key)
        audio.coin()
        const { x, y, s } = this.exhaust
        for (let k = 0; k < 6; k++) this.particles.spark(x, y - s * 0.4, s)
        if (this.shield) continue
        this.coins++
        this.coinPulse = 1
        if (this.coins >= COINS_FOR_SHIELD) {
          this.shield = true
          audio.ding()
          setTimeout(() => audio.speak('Du har et skjold!'), 300)
        }
      }
    }
  }

  /** Height of whatever the car is driving on: a ramp, or the road (0). */
  private ground(r: Racer, underground: boolean): { h: number; kind: JumpKind | null } {
    const z = this.z(r)
    const seg = this.track.findSegment(z)
    const t = (z % SEGMENT_LENGTH) / SEGMENT_LENGTH
    if (underground) return seg.caveRamp ? { h: lerp(seg.caveRamp.h1, seg.caveRamp.h2, t), kind: 'cave' } : { h: 0, kind: null }
    if (seg.ramp && Math.abs(r.offset - seg.ramp.x) < seg.ramp.halfW + 0.06) {
      return { h: lerp(seg.ramp.h1, seg.ramp.h2, t), kind: 'lava' }
    }
    return { h: 0, kind: null }
  }

  /** Ramps, take-off, flight and landing. Returns what happened this frame, if anything. */
  private vertical(r: Racer, underground: boolean, dt: number): 'launch' | 'land' | null {
    const g = this.ground(r, underground)
    if (r.ramp && g.h === 0) {
      const kind = r.ramp
      r.ramp = null
      r.vy = kind === 'cave' ? CAVE_LAUNCH_VY : this.lavaLaunchSpeed(r)
      return 'launch'
    }
    if (r.height <= g.h + 1 && r.vy <= 0) {
      r.height = g.h
      r.vy = 0
      r.ramp = g.h > 0 ? g.kind : null
      return null
    }
    r.vy -= GRAVITY * dt
    r.height += r.vy * dt
    if (r.height <= g.h) {
      const impact = -r.vy
      r.height = g.h
      r.vy = 0
      return impact > 2500 ? 'land' : null
    }
    return null
  }

  /** Take-off speed that always carries the car clear of the lava pool ahead. */
  private lavaLaunchSpeed(r: Racer): number {
    const zSeg = this.z(r) / SEGMENT_LENGTH
    const zone = this.track.lavas.find((l) => zSeg >= l.rampStart - 2 && zSeg <= l.lavaEnd)
    if (!zone) return 2500
    const distance = (zone.lavaEnd + 6 - zSeg) * SEGMENT_LENGTH
    const t = clamp(distance / Math.max(r.speed, MAX_SPEED * 0.5), 0.6, 1.8)
    return (GRAVITY * t * t) / 2 / t - r.height / t
  }

  /** Drove into lava: puff of smoke, then back to the arrows in front of the ramp. */
  private die() {
    const p = this.player
    const zSeg = this.z(p) / SEGMENT_LENGTH
    this.respawnZone = this.track.lavas.find((l) => zSeg >= l.arrowStart && zSeg < l.lavaEnd + 1) ?? null
    this.respawnTimer = RESPAWN_TIME
    this.turboTime = 0
    p.speed = 0
    const { x, y, s } = this.exhaust
    for (let i = 0; i < 28; i++) this.particles.smoke(x, y - s * 0.15, s)
    audio.puff()
    setTimeout(() => audio.speak('Hovsa!'), 150)
  }

  private respawn() {
    const p = this.player
    const zone = this.respawnZone
    if (zone) {
      p.dist -= this.z(p) - zone.arrowStart * SEGMENT_LENGTH
      p.offset = zone.x
    }
    p.speed = MAX_SPEED * 0.55
    p.height = 0
    p.vy = 0
    p.ramp = null
    this.respawnTimer = 0
    this.blink = 1.2
  }

  private updateOpponents(dt: number) {
    const p = this.player
    const L = this.track.length
    for (const o of this.opponents) {
      // Rubber band: computer cars ease off when far ahead and push when far behind,
      // so the race stays close and exciting.
      const gap = (o.dist - p.dist) / SEGMENT_LENGTH
      const { ahead, behind } = this.level
      const factor = p.finished ? 1 : gap > 40 ? ahead[0] : gap > 15 ? ahead[1] : gap < -60 ? behind[0] : gap < -25 ? behind[1] : 1
      let target = o.baseSpeed * factor

      o.retarget -= dt
      if (o.retarget <= 0) {
        o.targetOffset = (Math.random() * 2 - 1) * 0.7
        o.retarget = 2 + Math.random() * 3
      }

      // Don't drive through the player or other cars: move aside and match their speed.
      for (const other of [p as Racer, ...this.opponents]) {
        if (other === o) continue
        const otherCave = other === p ? this.cave === 'in' : (other as Opponent).cave
        if (otherCave !== o.cave) continue
        const dz = other.dist - o.dist
        if (dz > 0 && dz < 6 * SEGMENT_LENGTH && Math.abs(other.offset - o.offset) < 0.45) {
          o.targetOffset = clamp(o.offset + (o.offset > other.offset ? 0.5 : -0.5), -0.8, 0.8)
          if (dz < 1.6 * SEGMENT_LENGTH) target = Math.min(target, other.speed * 0.98)
        }
      }

      // Computer cars always line up for the ramps and steer around holes.
      let steerRate = 0.6
      const zSeg = this.z(o) / SEGMENT_LENGTH
      const lava = this.track.lavas.find((l) => zSeg >= l.arrowStart - 40 && zSeg < l.lavaStart)
      if (lava) {
        o.targetOffset = lava.x
        steerRate = 1.5
      }
      // Holes: each car decides by chance whether to dive in, once per hole per lap.
      const hole = this.track.holes.find((hz) => zSeg >= hz.start - 40 && zSeg < hz.end)
      if (hole && !o.cave) {
        const key = `${Math.floor(o.dist / L)}:${hole.start}`
        if (o.holePlan?.key !== key) o.holePlan = { key, dive: Math.random() < AI_HOLE_CHANCE }
        if (o.holePlan.dive) {
          o.targetOffset = hole.x
          steerRate = 1.5
        } else if (Math.abs(o.targetOffset - hole.x) < 0.5) {
          o.targetOffset = hole.x > 0 ? hole.x - 0.8 : hole.x + 0.8
        }
        const seg = this.track.findSegment(this.z(o))
        if (o.holePlan.dive && seg.hole && Math.abs(o.offset - seg.hole.x) < seg.hole.halfW && o.height <= 0) {
          o.cave = true
        }
      }
      if (o.cave) {
        target *= 1.25
        o.targetOffset = clamp(o.targetOffset, -0.8, 0.8)
        // Steer round the spinning swords ahead.
        const n = this.track.segments.length
        for (let k = 0; k < 40; k++) {
          const blade = this.track.segments[(Math.floor(zSeg) + k) % n].blade
          if (blade) {
            o.targetOffset = blade.x > 0 ? blade.x - 0.85 : blade.x + 0.85
            steerRate = 1.5
            break
          }
        }
      }

      if (o.speed < target) o.speed = Math.min(target, o.speed + ACCEL * 0.8 * dt)
      else if (o.height <= 0) o.speed = Math.max(target, o.speed - MAX_SPEED * dt)
      o.offset += clamp(o.targetOffset - o.offset, -steerRate * dt, steerRate * dt)
      const wasRamp = o.ramp
      if (this.vertical(o, o.cave, dt) === 'launch' && wasRamp === 'cave') o.cave = false
      o.dist += o.speed * dt

      if (!o.finished && o.dist >= LAPS * L) {
        o.finished = true
        this.finishOrder.push(o)
      }
    }
  }

  private z(r: Racer) {
    const L = this.track.length
    return (((this.lineZ + r.dist) % L) + L) % L
  }

  private ranking(): Racer[] {
    const racing = [this.player, ...this.opponents].filter((r) => !r.finished).sort((a, b) => b.dist - a.dist)
    return [...this.finishOrder, ...racing]
  }

  private place() {
    return this.ranking().indexOf(this.player) + 1
  }

  // ---- drawing -----------------------------------------------------------

  draw(ctx: Ctx, w: number, h: number, now: number) {
    this.w = w
    this.h = h
    const p = this.player
    const L = this.track.length

    ctx.save()
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 16 * this.shake, (Math.random() - 0.5) * 16 * this.shake)

    // The camera rises with the car on jumps (and sinks with it into a hole).
    const lift = this.cave === 'falling' ? p.height * 0.9 : p.height * (this.airKind === 'cave' ? 0.8 : 0.55)
    const view = {
      position: (((this.z(p) - PLAYER_Z) % L) + L) % L,
      playerX: p.offset,
      skyOffset: this.skyOffset,
      hillOffset: this.hillOffset,
      cameraLift: lift,
      cave: this.cave === 'in',
      time: this.time,
      coinTaken: (id: number) => this.takenCoins.has(`${this.lap}:${id}`),
    }
    const below = this.cave === 'in'
    const cars =
      this.cave === 'falling'
        ? []
        : this.opponents.filter((o) => o.cave === below).map((o) => ({ z: this.z(o), offset: o.offset, height: o.height, colors: o.colors }))
    renderWorld(ctx, w, h, this.track, view, cars)

    const s = playerCarSize(w)
    const speedPct = p.speed / MAX_SPEED
    const offroad = !this.cave && p.height <= 0 && Math.abs(p.offset) > 1.1
    const bounce =
      p.height > 0 ? 0 : Math.sin(this.time * 30) * s * 0.006 * speedPct + (offroad && p.speed > 0 ? (Math.random() - 0.5) * s * 0.03 : 0)
    const groundY = playerGroundY(this.track, view, h)
    const carY = groundY - s * 0.18 - playerScale(h) * p.height + bounce
    const airborne = p.height > 20 && p.ramp === null
    if (airborne) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.ellipse(w / 2, groundY, s * 0.5, s * 0.06, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    const hidden = this.respawnTimer > 0 || (this.blink > 0 && Math.floor(this.time * 10) % 2 === 0)
    // Nose up while climbing, down while falling.
    const pitch = airborne ? clamp(p.vy / 40000, -0.12, 0.12) : 0
    // Golden bubble around the car while the coin shield is ready: glow behind, rim in front.
    const bubble = this.shield && !hidden
    const pulse = 1 + Math.sin(this.time * 5) * 0.04
    const bubblePath = () => {
      ctx.beginPath()
      ctx.ellipse(w / 2, carY - s * 0.08, s * 0.68 * pulse, s * 0.4 * pulse, 0, 0, Math.PI * 2)
    }
    if (bubble) {
      ctx.fillStyle = 'rgba(255, 210, 63, 0.22)'
      bubblePath()
      ctx.fill()
    }
    const lean = this.steer * 0.08 + Math.sin(this.wobble * 30) * this.wobble * 0.4
    if (!hidden) drawCar(ctx, w / 2, carY, s * (1 + pitch), lean, p.colors, !airborne)
    if (bubble) {
      ctx.strokeStyle = 'rgba(255, 220, 90, 0.9)'
      ctx.lineWidth = 4
      bubblePath()
      ctx.stroke()
    }
    this.exhaust = { x: w / 2, y: carY + s * 0.1, s }

    if (this.turboTime > 0) for (const side of [-1, 1]) drawFlameJet(ctx, w / 2 + side * s * 0.28, carY + s * 0.1, s)
    this.particles.draw(ctx)
    if (this.turboTime > 0) {
      drawLightning(ctx, w / 2, carY, s)
      drawSpeedLines(ctx, w, h, 1)
    } else if (speedPct > 0.9 && this.state !== 'grid') {
      drawSpeedLines(ctx, w, h, 0.25)
    }
    ctx.restore()

    if (this.flash.a > 0) {
      ctx.globalAlpha = this.flash.a
      ctx.fillStyle = this.flash.color
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1
    }

    if (this.state === 'grid') return
    this.drawHud(ctx, w, now)
    if (this.state === 'countdown') this.drawCountdown(ctx, w, h)
    if (this.state === 'finished') this.drawFinished(ctx, w, h, now)
    if (this.paused) this.drawPaused(ctx, w, h, now)
  }

  private drawHud(ctx: Ctx, w: number, now: number) {
    const ranking = this.ranking()
    const place = ranking.indexOf(this.player) + 1

    // Position badge
    ctx.fillStyle = place <= 3 ? MEDAL[place - 1] : '#2f7de1'
    circle(ctx, 72, 72, 50)
    ctx.lineWidth = 5
    ctx.strokeStyle = '#fff'
    ctx.beginPath()
    ctx.arc(72, 72, 50, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = place <= 3 ? '#3a2a00' : '#fff'
    ctx.font = 'bold 60px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(place), 72, 76)

    // Standings: one coloured pill per car, leader at the top, the player outlined.
    ranking.forEach((r, i) => {
      const y = 145 + i * 30
      const me = r === this.player
      ctx.fillStyle = r.colors.body
      roundRect(ctx, me ? 30 : 36, y, me ? 84 : 72, me ? 24 : 20, 10)
      if (me) {
        ctx.lineWidth = 3
        ctx.strokeStyle = '#fff'
        ctx.beginPath()
        ctx.roundRect(30, y, 84, 24, 10)
        ctx.stroke()
      }
    })

    // Laps: chequered flag and one dot per lap.
    const lx = w / 2 - 70
    ctx.font = '40px system-ui, sans-serif'
    ctx.fillText('🏁', lx - 40, 48)
    for (let i = 0; i < LAPS; i++) {
      const cx = lx + 20 + i * 50
      const done = i < this.lap - 1 || this.player.finished
      const current = i === this.lap - 1 && !this.player.finished
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      circle(ctx, cx, 48, 20)
      if (done || current) {
        ctx.fillStyle = done ? '#fff' : '#ffd23f'
        circle(ctx, cx, 48, current ? 16 + Math.sin(now / 200) * 2 : 16)
      }
    }

    // Turbo button with a charge ring around it.
    const tb = this.turboButton
    const ready = this.turboCharge >= 1 && this.turboTime === 0 && this.state === 'racing'
    const active = this.turboTime > 0
    ctx.lineWidth = 14
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.arc(tb.x, tb.y, tb.r + 12, 0, Math.PI * 2)
    ctx.stroke()
    const fill = active ? this.turboTime / TURBO_TIME : this.turboCharge
    ctx.strokeStyle = active ? '#3fc8ff' : ready ? '#ffd23f' : '#ff8c1a'
    ctx.beginPath()
    ctx.arc(tb.x, tb.y, tb.r + 12, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2)
    ctx.stroke()
    drawIconButton(
      ctx,
      tb,
      active ? '⚡' : '🔥',
      active ? '#1d8fd1' : ready ? '#ff5a1f' : '#7a4a3a',
      ready ? Math.sin(now / 150) * 0.05 : 0,
    )

    this.drawCoinMeter(ctx, w)
    drawIconButton(ctx, this.pauseButton, '⏸', 'rgba(0,0,0,0.35)')
    ctx.globalAlpha = 0.6
    drawIconButton(ctx, this.invertButton, '⇄', 'rgba(0,0,0,0.35)')
    drawIconButton(ctx, this.centerButton, '◎', 'rgba(0,0,0,0.35)')
    ctx.globalAlpha = 1
  }

  /** Coin icon with a bar filling towards the shield; the shield shows when earned. */
  private drawCoinMeter(ctx: Ctx, w: number) {
    const x = w - 390
    const y = 50
    const bw = 200
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    roundRect(ctx, x, y - 14, bw, 28, 14)
    const fill = this.shield ? 1 : this.coins / COINS_FOR_SHIELD
    if (fill > 0) {
      ctx.fillStyle = this.shield ? '#ffe680' : '#ffd23f'
      roundRect(ctx, x + 3, y - 11, Math.max(22, (bw - 6) * fill), 22, 11)
    }
    const r = 24 * (1 + this.coinPulse * 0.25)
    ctx.fillStyle = '#b8860b'
    circle(ctx, x - 10, y, r)
    ctx.fillStyle = '#ffd23f'
    circle(ctx, x - 10, y, r * 0.8)
    if (this.shield) {
      ctx.font = `${Math.round(40 + Math.sin(this.time * 6) * 4)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🛡️', x + bw + 30, y + 2)
    }
  }

  private drawCountdown(ctx: Ctx, w: number, h: number) {
    const count = Math.ceil(this.countdown)
    const lit = COUNTDOWN - count + 1 // 1, 2, 3 red lamps
    const bw = 240
    const bx = w / 2 - bw / 2
    const by = h * 0.18
    ctx.fillStyle = '#222'
    roundRect(ctx, bx, by, bw, 90, 20)
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < lit ? '#ff3b30' : '#4a1d1d'
      circle(ctx, bx + 45 + i * 75, by + 45, 30)
    }
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 10
    ctx.font = `bold ${Math.round(h * 0.25)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeText(String(count), w / 2, h * 0.5)
    ctx.fillText(String(count), w / 2, h * 0.5)
  }

  private drawFinished(ctx: Ctx, w: number, h: number, now: number) {
    const place = this.place()
    const t = this.finishTimer
    const scale = Math.min(1, t * 3)
    ctx.save()
    ctx.translate(w / 2, h * 0.35)
    ctx.scale(scale, scale)
    ctx.font = `${Math.round(h * 0.2)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.rotate(Math.sin(now / 150) * 0.1)
    ctx.fillText('🏁', 0, 0)
    ctx.restore()
    if (t > 0.6) {
      ctx.fillStyle = place <= 3 ? MEDAL[place - 1] : '#fff'
      ctx.strokeStyle = '#222'
      ctx.lineWidth = 10
      ctx.font = `bold ${Math.round(h * 0.2)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeText(String(place), w / 2, h * 0.58)
      ctx.fillText(String(place), w / 2, h * 0.58)
    }
  }

  private drawPaused(ctx: Ctx, w: number, h: number, now: number) {
    ctx.fillStyle = 'rgba(10,10,30,0.6)'
    ctx.fillRect(0, 0, w, h)
    drawPlayButton(ctx, this.resumeButton, now)
    const rb = this.restartButton
    drawIconButton(ctx, rb, '', '#ff8c1a')
    drawAgainIcon(ctx, rb.x, rb.y, rb.r)
    drawIconButton(ctx, this.menuButton, '🏠', '#2f7de1')
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
