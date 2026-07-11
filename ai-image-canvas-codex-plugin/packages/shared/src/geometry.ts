import type { Bounds, Point } from './types.js'

export function center(bounds: Bounds): Point {
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function intersects(a: Bounds, b: Bounds) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function intersection(a: Bounds, b: Bounds): Bounds | undefined {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  if (w <= 0 || h <= 0) return undefined
  return { x, y, w, h }
}

export function expanded(bounds: Bounds, amount: number): Bounds {
  return {
    x: bounds.x - amount,
    y: bounds.y - amount,
    w: bounds.w + amount * 2,
    h: bounds.h + amount * 2
  }
}

export function pointInBounds(point: Point, bounds: Bounds) {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.w &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.h
  )
}

export function boundsToRelativeRegion(inner: Bounds, outer: Bounds): Bounds {
  return {
    x: (inner.x - outer.x) / outer.w,
    y: (inner.y - outer.y) / outer.h,
    w: inner.w / outer.w,
    h: inner.h / outer.h
  }
}

export function pointToRelativeRegion(point: Point, outer: Bounds): Bounds {
  const size = Math.min(outer.w, outer.h) * 0.12
  return boundsToRelativeRegion(
    { x: point.x - size / 2, y: point.y - size / 2, w: size, h: size },
    outer
  )
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function normalizeRelativeRegion(region: Bounds): Bounds {
  return {
    x: clamp01(region.x),
    y: clamp01(region.y),
    w: clamp01(region.w),
    h: clamp01(region.h)
  }
}

export function regionsOverlap(a: Bounds, b: Bounds, threshold = 0.15) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const overlap = ix * iy
  const minArea = Math.min(a.w * a.h, b.w * b.h)
  return minArea > 0 && overlap / minArea >= threshold
}
