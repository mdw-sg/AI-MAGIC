// Particle effects (turbo flames, grass spray, confetti), lightning and speed lines.
import type { Ctx } from './ui'

type Kind = 'flame' | 'dirt' | 'confetti' | 'smoke'
type Particle = {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  hue: number
  spin: number
}

const CONFETTI_HUES = [0, 45, 120, 200, 280, 320]

export class Particles {
  private list: Particle[] = []

  flame(x: number, y: number, s: number) {
    this.list.push({
      kind: 'flame',
      x: x + (Math.random() - 0.5) * s * 0.04,
      y,
      vx: (Math.random() - 0.5) * s * 1.2,
      vy: s * (0.3 + Math.random() * 0.6),
      life: 0,
      max: 0.3 + Math.random() * 0.3,
      size: s * (0.06 + Math.random() * 0.07),
      hue: 10 + Math.random() * 40,
      spin: 0,
    })
  }

  dirt(x: number, y: number, s: number) {
    this.list.push({
      kind: 'dirt',
      x: x + (Math.random() - 0.5) * s * 0.15,
      y,
      vx: (Math.random() - 0.5) * s * 1.2,
      vy: -s * (1 + Math.random() * 1.5),
      life: 0,
      max: 0.5,
      size: s * (0.025 + Math.random() * 0.03),
      hue: Math.random() < 0.5 ? 100 : 30,
      spin: 0,
    })
  }

  smoke(x: number, y: number, s: number) {
    this.list.push({
      kind: 'smoke',
      x: x + (Math.random() - 0.5) * s * 0.6,
      y: y + (Math.random() - 0.5) * s * 0.2,
      vx: (Math.random() - 0.5) * s * 0.8,
      vy: -s * (0.3 + Math.random() * 0.6),
      life: 0,
      max: 0.7 + Math.random() * 0.4,
      size: s * (0.12 + Math.random() * 0.12),
      hue: 0,
      spin: 0,
    })
  }

  confetti(w: number) {
    this.list.push({
      kind: 'confetti',
      x: Math.random() * w,
      y: -20,
      vx: (Math.random() - 0.5) * 80,
      vy: 120 + Math.random() * 120,
      life: 0,
      max: 6,
      size: 8 + Math.random() * 8,
      hue: CONFETTI_HUES[Math.floor(Math.random() * CONFETTI_HUES.length)],
      spin: Math.random() * Math.PI,
    })
  }

  update(dt: number) {
    for (const p of this.list) {
      p.life += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === 'dirt') p.vy += 900 * dt
      if (p.kind === 'confetti') p.spin += dt * 6
    }
    this.list = this.list.filter((p) => p.life < p.max)
  }

  clear() {
    this.list = []
  }

  draw(ctx: Ctx) {
    for (const p of this.list) {
      const t = p.life / p.max
      if (p.kind === 'flame') {
        ctx.fillStyle = `hsla(${p.hue + t * 25}, 100%, ${55 + t * 35}%, ${1 - t})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(${Math.round(90 + t * 100)}, ${Math.round(85 + t * 100)}, ${Math.round(85 + t * 100)}, ${0.85 * (1 - t)})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 + t * 1.5), 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'dirt') {
        ctx.fillStyle = p.hue === 100 ? `rgba(60,150,50,${1 - t})` : `rgba(120,80,40,${1 - t})`
        ctx.fillRect(p.x, p.y, p.size, p.size)
      } else {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.spin)
        ctx.fillStyle = `hsl(${p.hue}, 90%, 60%)`
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
    }
  }
}

/** Flickering jet of fire from an exhaust at (x, y), pointing down towards the viewer. */
export function drawFlameJet(ctx: Ctx, x: number, y: number, s: number) {
  const len = s * (0.35 + Math.random() * 0.15)
  const layers: [string, number][] = [
    ['rgba(255,80,20,0.9)', 1],
    ['rgba(255,170,30,0.95)', 0.7],
    ['rgba(255,245,200,1)', 0.4],
  ]
  for (const [color, k] of layers) {
    const half = s * 0.07 * k
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x - half, y)
    ctx.quadraticCurveTo(x - half * 1.4, y + len * k * 0.5, x + (Math.random() - 0.5) * half, y + len * k)
    ctx.quadraticCurveTo(x + half * 1.4, y + len * k * 0.5, x + half, y)
    ctx.fill()
  }
}

/** Crackling blue lightning bolts coming off the back of the car. */
export function drawLightning(ctx: Ctx, x: number, y: number, s: number) {
  ctx.save()
  ctx.strokeStyle = '#d6f8ff'
  ctx.shadowColor = '#3fc8ff'
  ctx.shadowBlur = 18
  ctx.lineWidth = Math.max(2, s * 0.012)
  ctx.lineJoin = 'round'
  for (let n = 0; n < 3; n++) {
    let px = x + (Math.random() - 0.5) * s * 0.7
    let py = y + s * 0.08
    ctx.beginPath()
    ctx.moveTo(px, py)
    for (let i = 0; i < 6; i++) {
      px += (Math.random() - 0.5) * s * 0.3
      py += s * 0.06
      ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** White streaks at the screen edges that sell the feeling of speed. */
export function drawSpeedLines(ctx: Ctx, w: number, h: number, amount: number) {
  ctx.strokeStyle = `rgba(255,255,255,${0.35 + amount * 0.35})`
  ctx.lineWidth = 3
  for (let i = 0; i < 18 * amount; i++) {
    const side = i % 2 ? 1 : -1
    const y = Math.random() * h
    const x = side > 0 ? w - Math.random() * w * 0.18 : Math.random() * w * 0.18
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + side * (40 + Math.random() * 60), y)
    ctx.stroke()
  }
}
