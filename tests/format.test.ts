import { describe, expect, it } from 'vitest'
import { getRoute, stopsInTravelOrder } from '../src/data/campus.ts'
import { formatEta, initials } from '../src/utils/format.ts'
import { interpolate } from '../src/utils/geo.ts'

describe('formatEta', () => {
  it('formats seconds for people', () => {
    expect(formatEta(0)).toBe('Arriving now')
    expect(formatEta(-5)).toBe('Arriving now')
    expect(formatEta(42)).toBe('42 s')
    expect(formatEta(60)).toBe('1 min')
    expect(formatEta(95)).toBe('1 min 35 s')
    expect(formatEta(94.6)).toBe('1 min 35 s')
  })
})

describe('initials', () => {
  it('uses the first and last names', () => {
    expect(initials('Asha Rao')).toBe('AR')
    expect(initials('Meera  Lakshmi Iyer')).toBe('MI')
    expect(initials('Ravi')).toBe('R')
    expect(initials('   ')).toBe('?')
  })
})

describe('stopsInTravelOrder', () => {
  const route = getRoute('campus-loop')

  it('keeps the listed order for clockwise shuttles', () => {
    expect(stopsInTravelOrder(route, 'clockwise')).toEqual(route.stopIds)
  })

  it('reverses the loop for anticlockwise shuttles, starting from the same stop', () => {
    const order = stopsInTravelOrder(route, 'anticlockwise')
    expect(order[0]).toBe('main-gate')
    expect(order[1]).toBe('innovation-hub')
    expect(order[order.length - 1]).toBe('academic-block')
    expect(order).toHaveLength(route.stopIds.length)
  })

  it('does not change the original route data', () => {
    const before = [...route.stopIds]
    stopsInTravelOrder(route, 'anticlockwise')
    expect(route.stopIds).toEqual(before)
  })
})

describe('interpolate', () => {
  it('finds points between two positions', () => {
    const a = { lat: 0, lng: 0 }
    const b = { lat: 10, lng: 20 }
    expect(interpolate(a, b, 0.5)).toEqual({ lat: 5, lng: 10 })
    expect(interpolate(a, b, 2)).toEqual(b)
  })
})
