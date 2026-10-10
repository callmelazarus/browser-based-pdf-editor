const LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export function nextZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) return LEVELS.find((z) => z > current + 1e-9) ?? LEVELS[LEVELS.length - 1]
  return [...LEVELS].reverse().find((z) => z < current - 1e-9) ?? LEVELS[0]
}
