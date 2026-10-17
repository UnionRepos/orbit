import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activeOnOpen,
  firstEnabled,
  lastEnabled,
  optionIndex,
  placeMenu,
  sameLayout,
  stepIndex,
  typeaheadIndex,
  type DropdownOption,
} from './dropdown.ts'

const options: DropdownOption[] = [
  { value: 'best', label: 'Best match' },
  { value: 'stars', label: 'Most stars' },
  { value: 'forks', label: 'Most forks' },
  { value: 'updated', label: 'Recently updated' },
]

describe('option lookup', () => {
  it('finds the selected option', () => {
    assert.equal(optionIndex(options, 'forks'), 2)
    assert.equal(optionIndex(options, 'missing'), -1)
  })

  it('finds the first and last choosable options', () => {
    assert.equal(firstEnabled(options), 0)
    assert.equal(lastEnabled(options), 3)
  })

  it('skips disabled options at the edges', () => {
    const gated: DropdownOption[] = [
      { value: 'a', label: 'A', disabled: true },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C', disabled: true },
    ]
    assert.equal(firstEnabled(gated), 1)
    assert.equal(lastEnabled(gated), 1)
  })

  it('reports -1 when nothing can be chosen', () => {
    const locked: DropdownOption[] = [{ value: 'a', label: 'A', disabled: true }]
    assert.equal(firstEnabled(locked), -1)
    assert.equal(lastEnabled(locked), -1)
  })
})

describe('keyboard stepping', () => {
  it('moves down and up through the list', () => {
    assert.equal(stepIndex(options, 0, 1), 1)
    assert.equal(stepIndex(options, 2, -1), 1)
  })

  it('wraps at both ends', () => {
    assert.equal(stepIndex(options, 3, 1), 0)
    assert.equal(stepIndex(options, 0, -1), 3)
  })

  it('opens at either end when nothing is highlighted yet', () => {
    assert.equal(stepIndex(options, -1, 1), 0)
    assert.equal(stepIndex(options, -1, -1), 3)
  })

  it('skips disabled options', () => {
    const gated: DropdownOption[] = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
      { value: 'c', label: 'C' },
    ]
    assert.equal(stepIndex(gated, 0, 1), 2)
    assert.equal(stepIndex(gated, 2, -1), 0)
  })

  it('stays put when everything else is disabled', () => {
    const gated: DropdownOption[] = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
    ]
    assert.equal(stepIndex(gated, 0, 1), 0)
  })
})

describe('opening highlight', () => {
  it('highlights the current value', () => {
    assert.equal(activeOnOpen(options, 'stars'), 1)
  })

  it('falls back to the first option when the value is unknown', () => {
    assert.equal(activeOnOpen(options, 'nope'), 0)
  })

  it('falls back to the first enabled option when the value is disabled', () => {
    const gated: DropdownOption[] = [
      { value: 'a', label: 'A', disabled: true },
      { value: 'b', label: 'B' },
    ]
    assert.equal(activeOnOpen(gated, 'a'), 1)
  })
})

describe('typeahead', () => {
  it('matches a label prefix case-insensitively', () => {
    assert.equal(typeaheadIndex(options, 'mo', -1), 1)
    assert.equal(typeaheadIndex(options, 'MOST F', -1), 2)
  })

  it('searches forward from the active option and wraps', () => {
    assert.equal(typeaheadIndex(options, 'mo', 1), 2)
    assert.equal(typeaheadIndex(options, 'mo', 2), 1)
  })

  it('ignores disabled options and empty queries', () => {
    const gated: DropdownOption[] = [
      { value: 'a', label: 'Alpha', disabled: true },
      { value: 'b', label: 'Beta' },
    ]
    assert.equal(typeaheadIndex(gated, 'al', -1), -1)
    assert.equal(typeaheadIndex(options, '   ', -1), -1)
  })

  it('returns -1 when nothing matches', () => {
    assert.equal(typeaheadIndex(options, 'zzz', -1), -1)
  })
})

describe('menu placement', () => {
  const anchor = { top: 100, bottom: 130, left: 40, right: 160, width: 120 }

  it('opens below when there is room', () => {
    const layout = placeMenu({ anchor, menuHeight: 140, viewport: { width: 1000, height: 800 } })
    assert.equal(layout.placement, 'below')
    assert.equal(layout.top, 136)
    assert.equal(layout.maxHeight, 800 - 130 - 6 - 8)
  })

  it('flips above near the bottom of the viewport', () => {
    const low = { top: 700, bottom: 730, left: 40, right: 160, width: 120 }
    const layout = placeMenu({ anchor: low, menuHeight: 200, viewport: { width: 1000, height: 800 } })
    assert.equal(layout.placement, 'above')
    assert.equal(layout.top, 700 - 6 - 200)
    assert.equal(layout.maxHeight, 700 - 6 - 8)
  })

  it('never runs off the right or left edge', () => {
    const right = placeMenu({
      anchor: { top: 10, bottom: 40, left: 960, right: 1000, width: 40 },
      menuHeight: 100,
      viewport: { width: 1000, height: 800 },
      minWidth: 180,
    })
    assert.equal(right.left, 1000 - 180 - 8)

    const left = placeMenu({
      anchor: { top: 10, bottom: 40, left: -20, right: 30, width: 50 },
      menuHeight: 100,
      viewport: { width: 1000, height: 800 },
    })
    assert.equal(left.left, 8)
  })

  it('aligns the menu to the end of the trigger when asked', () => {
    const layout = placeMenu({
      anchor: { top: 100, bottom: 130, left: 600, right: 720, width: 120 },
      menuHeight: 100,
      viewport: { width: 1000, height: 800 },
      align: 'end',
      minWidth: 200,
    })
    assert.equal(layout.left, 720 - 200)
    assert.equal(layout.width, 200)
  })

  it('keeps the menu at least as wide as its trigger', () => {
    const layout = placeMenu({ anchor, menuHeight: 100, viewport: { width: 1000, height: 800 } })
    assert.equal(layout.width, 120)
  })

  it('shrinks to the viewport on small screens', () => {
    const narrow = placeMenu({
      anchor: { top: 10, bottom: 40, left: 0, right: 400, width: 400 },
      menuHeight: 100,
      viewport: { width: 320, height: 480 },
    })
    assert.equal(narrow.width, 320 - 16)
    assert.equal(narrow.left, 8)
  })
})

describe('layout comparison', () => {
  const base = { top: 10, left: 10, width: 100, maxHeight: 200, placement: 'below' as const }

  it('treats equal layouts as unchanged', () => {
    assert.equal(sameLayout(base, { ...base }), true)
    assert.equal(sameLayout(null, null), true)
  })

  it('detects any change', () => {
    assert.equal(sameLayout(base, { ...base, top: 11 }), false)
    assert.equal(sameLayout(base, { ...base, placement: 'above' }), false)
    assert.equal(sameLayout(base, null), false)
  })
})
