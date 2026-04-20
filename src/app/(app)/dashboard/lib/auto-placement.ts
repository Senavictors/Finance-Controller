export type PlacedItem = {
  x: number
  y: number
  w: number
  h: number
}

export type Placement = { x: number; y: number }

export type FindPlacementOptions = {
  items: readonly PlacedItem[]
  cols: number
  w: number
  h: number
}

function collides(a: PlacedItem, b: PlacedItem): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function findPlacement({ items, cols, w, h }: FindPlacementOptions): Placement {
  const width = Math.min(Math.max(1, w), cols)
  const height = Math.max(1, h)

  const maxExistingY = items.reduce((max, it) => Math.max(max, it.y + it.h), 0)
  const scanLimit = maxExistingY + height

  for (let y = 0; y <= scanLimit; y++) {
    for (let x = 0; x <= cols - width; x++) {
      const candidate: PlacedItem = { x, y, w: width, h: height }
      const overlaps = items.some((item) => collides(item, candidate))
      if (!overlaps) {
        return { x, y }
      }
    }
  }

  return { x: 0, y: maxExistingY }
}
