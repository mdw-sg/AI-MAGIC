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
import { PLAYER_Z, playerCarSize, playerGroundY, renderWorld } from './render'
import { SEGMENT_LENGTH, START_SEGMENT, buildTrack } from './track'

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

const PLACE_WORDS = ['', 'et', 'to', 'tre', 'fire', 'fem', 'seks']

type Racer = { colors: CarColors; dist: number; offset: number; speed: number; finished: boolean }
type Opponent = Racer & { baseSpeed: number; targetOffset: number; retarget: number }

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
    }
    this.opponents = GRID.map((g, i) => ({
      colors: CAR_COLORS[i + 1],
      dist: g.d * SEGMENT_LENGTH,
      offset: g.o,
      speed: 0,
      finished: false,
      baseSpeed: MAX_SPEED * g.speed * this.level.speed,
      targetOffset: g.o,
      retarget: 1 + Math.random() * 2,
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
    audio.engine(this.player.speed / MAX_SPEED, this.state !== 'grid')
    if (moving) {
      this.updatePlayer(dt)
      this.updateOpponents(dt)
    }

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
    const seg = this.track.findSegment(this.z(p))
    const speedPct = p.speed / MAX_SPEED

    // After the finish line the car steers itself back to the middle and slows down.
    const steer = p.finished ? clamp(-p.offset * 2, -1, 1) : this.steer
    const dx = dt * 1.9 * Math.min(speedPct, 1.3)
    p.offset += dx * steer
    p.offset -= dx * speedPct * seg.curve * CENTRIFUGAL
    p.offset = clamp(p.offset, -2.5, 2.5)

    const turbo = this.turboTime > 0
    if (turbo) this.turboTime = Math.max(0, this.turboTime - dt)
    else if (this.state === 'racing') this.turboCharge = Math.min(1, this.turboCharge + dt / TURBO_CHARGE_TIME)

    const offroad = Math.abs(p.offset) > 1.1
    let target = p.finished ? MAX_SPEED * 0.5 : turbo ? TURBO_SPEED : MAX_SPEED
    if (offroad) target = Math.min(target, turbo ? OFFROAD_LIMIT * 1.6 : OFFROAD_LIMIT)
    if (p.speed < target) p.speed = Math.min(target, p.speed + ACCEL * dt * (turbo ? 3 : 1))
    else p.speed = Math.max(target, p.speed - MAX_SPEED * 0.8 * dt)

    // Running into the back of a computer car slows you to its speed and nudges you aside.
    for (const o of this.opponents) {
      const dz = o.dist - p.dist
      if (dz > 0 && dz < 320 && Math.abs(o.offset - p.offset) < 0.33 && p.speed > o.speed) {
        p.speed = o.speed * 0.92
        p.offset += (p.offset < o.offset ? -1 : 1) * 0.06
        this.shake = Math.max(this.shake, 0.5)
        if (this.bumpCooldown === 0) {
          audio.bump()
          this.bumpCooldown = 0.4
        }
      }
    }

    p.dist += p.speed * dt
    this.skyOffset += (0.001 * seg.curve * p.speed * dt) / SEGMENT_LENGTH
    this.hillOffset += (0.002 * seg.curve * p.speed * dt) / SEGMENT_LENGTH

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
        const dz = other.dist - o.dist
        if (dz > 0 && dz < 6 * SEGMENT_LENGTH && Math.abs(other.offset - o.offset) < 0.45) {
          o.targetOffset = clamp(o.offset + (o.offset > other.offset ? 0.5 : -0.5), -0.8, 0.8)
          if (dz < 1.6 * SEGMENT_LENGTH) target = Math.min(target, other.speed * 0.98)
        }
      }

      if (o.speed < target) o.speed = Math.min(target, o.speed + ACCEL * 0.8 * dt)
      else o.speed = Math.max(target, o.speed - MAX_SPEED * dt)
      o.offset += clamp(o.targetOffset - o.offset, -0.6 * dt, 0.6 * dt)
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

    const view = {
      position: (((this.z(p) - PLAYER_Z) % L) + L) % L,
      playerX: p.offset,
      skyOffset: this.skyOffset,
      hillOffset: this.hillOffset,
    }
    renderWorld(
      ctx,
      w,
      h,
      this.track,
      view,
      this.opponents.map((o) => ({ z: this.z(o), offset: o.offset, colors: o.colors })),
    )

    const s = playerCarSize(w)
    const speedPct = p.speed / MAX_SPEED
    const offroad = Math.abs(p.offset) > 1.1
    const bounce = Math.sin(this.time * 30) * s * 0.006 * speedPct + (offroad && p.speed > 0 ? (Math.random() - 0.5) * s * 0.03 : 0)
    const carY = playerGroundY(this.track, view, h) - s * 0.18 + bounce
    drawCar(ctx, w / 2, carY, s, this.steer * 0.08, p.colors)
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

    drawIconButton(ctx, this.pauseButton, '⏸', 'rgba(0,0,0,0.35)')
    ctx.globalAlpha = 0.6
    drawIconButton(ctx, this.invertButton, '⇄', 'rgba(0,0,0,0.35)')
    drawIconButton(ctx, this.centerButton, '◎', 'rgba(0,0,0,0.35)')
    ctx.globalAlpha = 1
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
