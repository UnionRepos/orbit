/**
 * Behaviour shared by every custom dropdown: which option is highlighted, how
 * the keyboard moves through the list, typeahead matching and where the menu
 * fits on screen. Kept free of React and the DOM so it can be tested directly.
 */

export interface DropdownOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

export interface MenuLayoutInput {
  anchor: { top: number; bottom: number; left: number; right: number; width: number }
  menuHeight: number
  viewport: { width: number; height: number }
  align?: 'start' | 'end'
  /** The menu is never narrower than this, so short triggers still read well. */
  minWidth?: number
  /** Space between the trigger and the menu. */
  gap?: number
  /** Keep this much space between the menu and the viewport edges. */
  margin?: number
}

export interface MenuLayout {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'below' | 'above'
}

/** Index of `value` in the list, or -1 when it is not offered. */
export function optionIndex<T extends string>(
  options: readonly DropdownOption<T>[],
  value: T,
): number {
  return options.findIndex((option) => option.value === value)
}

/** First option that can be chosen, or -1 when every option is disabled. */
export function firstEnabled<T extends string>(options: readonly DropdownOption<T>[]): number {
  return options.findIndex((option) => !option.disabled)
}

/** Last option that can be chosen, or -1 when every option is disabled. */
export function lastEnabled<T extends string>(options: readonly DropdownOption<T>[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index
  }
  return -1
}

/**
 * Moves `delta` options from `from`, skipping disabled ones and wrapping around
 * the ends. Returns `from` when nothing else can be chosen.
 */
export function stepIndex<T extends string>(
  options: readonly DropdownOption<T>[],
  from: number,
  delta: number,
): number {
  if (options.length === 0) return -1
  const direction = delta >= 0 ? 1 : -1
  let index = from < 0 ? (direction > 0 ? -1 : 0) : from

  for (let step = 0; step < options.length; step += 1) {
    index = (index + direction + options.length) % options.length
    if (!options[index].disabled) return index
  }
  return from
}

/** Option that should be highlighted when the menu opens on `value`. */
export function activeOnOpen<T extends string>(
  options: readonly DropdownOption<T>[],
  value: T,
): number {
  const index = optionIndex(options, value)
  if (index >= 0 && !options[index].disabled) return index
  return firstEnabled(options)
}

/**
 * Index of the option matching a typeahead buffer, searching forward from
 * `from` and wrapping. Returns -1 when nothing matches. Labels are compared
 * case-insensitively by prefix, the way native selects behave.
 */
export function typeaheadIndex<T extends string>(
  options: readonly DropdownOption<T>[],
  query: string,
  from: number,
): number {
  const needle = query.trim().toLowerCase()
  if (!needle || options.length === 0) return -1

  for (let step = 1; step <= options.length; step += 1) {
    const index = (from + step + options.length) % options.length
    const option = options[index]
    if (!option.disabled && option.label.toLowerCase().startsWith(needle)) return index
  }
  return -1
}

/**
 * Places the menu below the trigger when it fits, otherwise above it, and keeps
 * it inside the viewport. `maxHeight` is the room actually available, so long
 * lists scroll instead of running off screen.
 */
export function placeMenu(input: MenuLayoutInput): MenuLayout {
  const gap = input.gap ?? 6
  const margin = input.margin ?? 8
  const width = Math.min(
    Math.max(input.anchor.width, input.minWidth ?? 0),
    Math.max(0, input.viewport.width - margin * 2),
  )

  let left = input.align === 'end' ? input.anchor.right - width : input.anchor.left
  left = Math.min(Math.max(margin, left), Math.max(margin, input.viewport.width - width - margin))

  const below = Math.max(0, input.viewport.height - input.anchor.bottom - gap - margin)
  const above = Math.max(0, input.anchor.top - gap - margin)
  const placement: MenuLayout['placement'] =
    input.menuHeight <= below || below >= above ? 'below' : 'above'
  const available = placement === 'below' ? below : above
  const maxHeight = Math.max(0, available)
  const height = Math.min(input.menuHeight, maxHeight)
  const top =
    placement === 'below' ? input.anchor.bottom + gap : Math.max(margin, input.anchor.top - gap - height)

  return { top, left, width, maxHeight, placement }
}

/** Whether two measured layouts are the same, to avoid redundant re-renders. */
export function sameLayout(a: MenuLayout | null, b: MenuLayout | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.maxHeight === b.maxHeight &&
    a.placement === b.placement
  )
}
