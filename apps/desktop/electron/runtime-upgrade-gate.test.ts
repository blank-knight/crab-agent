import { describe, expect, it } from 'vitest'

import { compareDisplayVersions, isRuntimeOutdated } from './runtime-upgrade-gate'

describe('compareDisplayVersions', () => {
  it('orders plain semver', () => {
    expect(compareDisplayVersions('0.20.4', '0.20.5')).toBeLessThan(0)
    expect(compareDisplayVersions('0.20.5', '0.20.4')).toBeGreaterThan(0)
    expect(compareDisplayVersions('0.20.5', '0.20.5')).toBe(0)
  })

  it('treats a letter suffix as NEWER than the bare number (0.20.5 < 0.20.5-m)', () => {
    // Our release scheme: 0.20.5, then 0.20.5-a ... 0.20.5-n are successive patch builds.
    expect(compareDisplayVersions('0.20.5', '0.20.5-m')).toBeLessThan(0)
    expect(compareDisplayVersions('0.20.5-m', '0.20.5')).toBeGreaterThan(0)
  })

  it('orders letter suffixes alphabetically (a < k < m < n)', () => {
    expect(compareDisplayVersions('0.20.5-a', '0.20.5-k')).toBeLessThan(0)
    expect(compareDisplayVersions('0.20.5-m', '0.20.5-n')).toBeLessThan(0)
    expect(compareDisplayVersions('0.20.5-n', '0.20.5-m')).toBeGreaterThan(0)
  })

  it('compares the numeric part first (0.20.5-n < 0.20.6)', () => {
    expect(compareDisplayVersions('0.20.5-n', '0.20.6')).toBeLessThan(0)
    expect(compareDisplayVersions('0.21.0', '0.20.9-z')).toBeGreaterThan(0)
  })

  it('handles empty strings as oldest', () => {
    expect(compareDisplayVersions('', '0.1.0')).toBeLessThan(0)
  })
})

describe('isRuntimeOutdated', () => {
  const APP = '0.20.5-n'

  it('no marker at all → outdated (fresh-ish machine, stage once)', () => {
    expect(isRuntimeOutdated(null, APP)).toBe(true)
    expect(isRuntimeOutdated(undefined, APP)).toBe(true)
  })

  it('marker WITHOUT desktopVersion → outdated (every fielded marker today)', () => {
    // The 0.20.5m user machine: { schemaVersion:1, pinnedCommit:"...", branch:null, installedAt:"..." }
    expect(isRuntimeOutdated({ pinnedCommit: 'abc123' }, APP)).toBe(true)
  })

  it('marker version OLDER than app → outdated', () => {
    expect(isRuntimeOutdated({ desktopVersion: '0.20.5-m' }, APP)).toBe(true)
    expect(isRuntimeOutdated({ desktopVersion: '0.20.5' }, APP)).toBe(true)
  })

  it('marker version EQUAL to app → NOT outdated (no restage loop)', () => {
    expect(isRuntimeOutdated({ desktopVersion: '0.20.5-n' }, APP)).toBe(false)
  })

  it('marker version NEWER than app (downgraded app) → NOT outdated, do not thrash', () => {
    expect(isRuntimeOutdated({ desktopVersion: '0.20.6' }, '0.20.5-n')).toBe(false)
  })

  it('non-string version → outdated (malformed marker)', () => {
    expect(isRuntimeOutdated({ desktopVersion: 42 }, APP)).toBe(true)
    expect(isRuntimeOutdated({ desktopVersion: '' }, APP)).toBe(true)
  })
})
