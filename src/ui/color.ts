import type { Rgb } from '../model/types'

export const SWATCHES = ['#ffe600', '#ff8a00', '#e53935', '#d81b60', '#8e24aa', '#1e88e5', '#43a047', '#000000']

export const css = (c: Rgb): string => `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`

export function rgbToHex(c: Rgb): string {
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}
