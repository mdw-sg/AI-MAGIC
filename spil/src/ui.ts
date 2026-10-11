// Shared drawing helpers: shapes, the car, trophies and round icon buttons.

export type Ctx = CanvasRenderingContext2D

export type CarColors = { body: string; dark: string }

export const CAR_COLORS: CarColors[] = [
  { body: '#e8384f', dark: '#b02238' }, // red — the player
  { body: '#2f7de1', dark: '#1d56a3' },
  { body: '#f5c518', dark: '#c29a0c' },
  { body: '#2ecc71', dark: '#1f9a54' },
  { body: '#9b59b6', dark: '#6f3a85' },
  { body: '#ff8c1a', dark: '#c4650a' },
]

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Car seen from behind. (x, y) is the middle of the body; the tyres touch the ground at
 * y + 0.18·s, and the exhausts sit at (x ± 0.28·s, y + 0.1·s).
 */
export function drawCar(ctx: Ctx, x: number, y: number, s: number, lean: number, colors: CarColors, shadow = true) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(lean)
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(0, s * 0.17, s * 0.56, s * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#1a1a1a'
  roundRect(ctx, -s * 0.52, -s * 0.02, s * 0.2, s * 0.2, s * 0.04)
  roundRect(ctx, s * 0.32, -s * 0.02, s * 0.2, s * 0.2, s * 0.04)
  ctx.fillStyle = colors.body
  roundRect(ctx, -s * 0.46, -s * 0.18, s * 0.92, s * 0.3, s * 0.08)
  ctx.fillStyle = colors.dark
  roundRect(ctx, -s * 0.3, -s * 0.38, s * 0.6, s * 0.24, s * 0.08)
  ctx.fillStyle = '#9fd8ff'
  roundRect(ctx, -s * 0.24, -s * 0.34, s * 0.48, s * 0.15, s * 0.05)
  ctx.fillStyle = '#222'
  roundRect(ctx, -s * 0.5, -s * 0.24, s, s * 0.06, s * 0.02)
  ctx.fillStyle = '#ffdf5c'
  roundRect(ctx, -s * 0.42, -s * 0.1, s * 0.14, s * 0.07, s * 0.03)
  roundRect(ctx, s * 0.28, -s * 0.1, s * 0.14, s * 0.07, s * 0.03)
  ctx.fillStyle = '#888'
  circle(ctx, -s * 0.28, s * 0.1, s * 0.04)
  circle(ctx, s * 0.28, s * 0.1, s * 0.04)
  ctx.restore()
}

export const MEDAL = ['#ffd23f', '#d6dde6', '#e09a5a'] // gold, silver, bronze

/** A cup trophy; (x, y) is the bottom centre, h its height. */
export function drawTrophy(ctx: Ctx, x: number, y: number, h: number, color: string) {
  const s = h / 100
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#5a3a1e'
  roundRect(ctx, -30 * s, -14 * s, 60 * s, 14 * s, 3 * s)
  ctx.fillStyle = color
  roundRect(ctx, -8 * s, -36 * s, 16 * s, 24 * s, 2 * s)
  roundRect(ctx, -20 * s, -40 * s, 40 * s, 8 * s, 3 * s)
  // Handles
  ctx.lineWidth = 7 * s
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.arc(-30 * s, -78 * s, 13 * s, Math.PI * 0.5, Math.PI * 1.5)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(30 * s, -78 * s, 13 * s, -Math.PI * 0.5, Math.PI * 0.5)
  ctx.stroke()
  // Cup
  ctx.beginPath()
  ctx.moveTo(-32 * s, -100 * s)
  ctx.lineTo(32 * s, -100 * s)
  ctx.quadraticCurveTo(30 * s, -44 * s, 0, -40 * s)
  ctx.quadraticCurveTo(-30 * s, -44 * s, -32 * s, -100 * s)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  roundRect(ctx, -22 * s, -94 * s, 8 * s, 34 * s, 4 * s)
  ctx.restore()
}

export type IconButton = { x: number; y: number; r: number }

export function hitButton(b: IconButton, x: number, y: number) {
  return Math.hypot(x - b.x, y - b.y) <= b.r + 12
}

/** Round button with a white rim and an emoji/symbol in the middle. */
export function drawIconButton(ctx: Ctx, b: IconButton, icon: string, fill: string, pulse = 0) {
  const r = b.r * (1 + pulse)
  ctx.fillStyle = fill
  circle(ctx, b.x, b.y, r)
  ctx.lineWidth = Math.max(3, b.r * 0.08)
  ctx.strokeStyle = '#fff'
  ctx.beginPath()
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = `${Math.round(b.r * 0.95)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, b.x, b.y + b.r * 0.06)
}

/** Big white play triangle inside a green circle. */
export function drawPlayButton(ctx: Ctx, b: IconButton, now: number) {
  const r = b.r * (1 + Math.sin(now / 250) * 0.05)
  ctx.fillStyle = '#2ecc71'
  circle(ctx, b.x, b.y, r)
  ctx.lineWidth = 8
  ctx.strokeStyle = '#fff'
  ctx.beginPath()
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(b.x - r * 0.32, b.y - r * 0.45)
  ctx.lineTo(b.x + r * 0.5, b.y)
  ctx.lineTo(b.x - r * 0.32, b.y + r * 0.45)
  ctx.fill()
}

/** Circular arrow ("again"), drawn rather than an emoji so it's big and clear. */
export function drawAgainIcon(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save()
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = r * 0.22
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(x, y, r * 0.5, -Math.PI * 0.35, Math.PI * 1.35)
  ctx.stroke()
  const a = -Math.PI * 0.35
  const tx = x + Math.cos(a) * r * 0.5
  const ty = y + Math.sin(a) * r * 0.5
  ctx.beginPath()
  ctx.moveTo(tx + r * 0.28, ty - r * 0.05)
  ctx.lineTo(tx - r * 0.12, ty - r * 0.3)
  ctx.lineTo(tx - r * 0.02, ty + r * 0.22)
  ctx.fill()
  ctx.restore()
}
