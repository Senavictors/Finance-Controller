import { describe, expect, it } from 'vitest'
import { findPlacement, type PlacedItem } from './auto-placement'

describe('findPlacement', () => {
  it('places first widget at origin when grid is empty', () => {
    expect(findPlacement({ items: [], cols: 12, w: 5, h: 6 })).toEqual({ x: 0, y: 0 })
  })

  it('fills free slot on the same row when width allows', () => {
    const items: PlacedItem[] = [{ x: 0, y: 0, w: 5, h: 6 }]
    expect(findPlacement({ items, cols: 12, w: 7, h: 6 })).toEqual({ x: 5, y: 0 })
  })

  it('falls to a new row when row is full', () => {
    const items: PlacedItem[] = [
      { x: 0, y: 0, w: 5, h: 6 },
      { x: 5, y: 0, w: 7, h: 6 },
    ]
    expect(findPlacement({ items, cols: 12, w: 4, h: 3 })).toEqual({ x: 0, y: 6 })
  })

  it('fits smaller widget into a leftover horizontal gap', () => {
    const items: PlacedItem[] = [
      { x: 0, y: 0, w: 5, h: 6 },
      { x: 5, y: 0, w: 7, h: 6 },
      { x: 0, y: 6, w: 8, h: 5 },
    ]
    expect(findPlacement({ items, cols: 12, w: 4, h: 5 })).toEqual({ x: 8, y: 6 })
  })

  it('clamps width larger than cols and still finds a slot', () => {
    const items: PlacedItem[] = [{ x: 0, y: 0, w: 12, h: 4 }]
    expect(findPlacement({ items, cols: 12, w: 20, h: 3 })).toEqual({ x: 0, y: 4 })
  })

  it('never produces a placement that overlaps existing items', () => {
    const items: PlacedItem[] = [
      { x: 0, y: 0, w: 6, h: 4 },
      { x: 6, y: 0, w: 6, h: 4 },
      { x: 0, y: 4, w: 4, h: 3 },
    ]
    const placement = findPlacement({ items, cols: 12, w: 6, h: 3 })
    const candidate = { ...placement, w: 6, h: 3 }
    const overlaps = items.some(
      (it) =>
        candidate.x < it.x + it.w &&
        candidate.x + candidate.w > it.x &&
        candidate.y < it.y + it.h &&
        candidate.y + candidate.h > it.y,
    )
    expect(overlaps).toBe(false)
  })
})
