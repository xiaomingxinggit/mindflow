import { FONT_FAMILY } from '@excalidraw/excalidraw'

/** Use the operating system font for Excalidraw's local sans-serif font slot. */
export function installSystemFont() {
  // Pinned to 0.18.1: canvas, WYSIWYG and SVG resolve names via Object.entries.
  // Keep Helvetica's numeric API available, but let slot 2 resolve to system-ui.
  Object.defineProperties(FONT_FAMILY, {
    Helvetica: { ...Object.getOwnPropertyDescriptor(FONT_FAMILY, 'Helvetica'), enumerable: false },
    'system-ui': { value: 2, enumerable: true, configurable: true, writable: true },
  })
}
