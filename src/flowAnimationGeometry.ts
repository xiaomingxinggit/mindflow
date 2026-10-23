import { exportToSvg, getCommonBounds } from '@excalidraw/excalidraw'
import type { ExcalidrawLinearElement, ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types'

export type FlowPath = { points: Float64Array; length: number; step: number }

/** Sample the pinned native renderer, so curves, elbows and rotations share its geometry. */
export async function measureFlowPath(element: ExcalidrawLinearElement): Promise<FlowPath | null> {
  const line = { ...element, boundElements: null, frameId: null, link: null }
  const [minX, minY] = getCommonBounds([line])
  const svg = await exportToSvg({
    elements: [line], files: null, exportPadding: 0, skipInliningFonts: true,
    appState: { exportBackground: false, exportWithDarkMode: false, exportScale: 1, exportEmbedScene: false },
  }) as SVGSVGElement
  const source = Array.from(svg.querySelectorAll('path')).find(path => path.getAttribute('stroke') !== 'none' && path.getAttribute('fill') === 'none')
  if (!source) return null
  const path = source.cloneNode(false) as SVGPathElement
  // RoughJS emits one move per sharp/elbow segment, and a second pen pass for
  // solid strokes. Keep every segment's first pass, not just the first segment.
  const strokes = (source.getAttribute('d') || '').trim().split(/(?=[Mm])/).filter(Boolean)
  const firstPass = element.strokeStyle === 'solid' ? strokes.filter((_, index) => index % 2 === 0) : strokes
  if (!firstPass.length) return null
  path.setAttribute('d', firstPass.join(' '))
  let matrix = new DOMMatrix()
  let node: Element | null = source
  while (node && node !== svg) {
    if (node instanceof SVGGraphicsElement) {
      const transform = node.transform.baseVal.consolidate()?.matrix
      if (transform) matrix = new DOMMatrix([transform.a, transform.b, transform.c, transform.d, transform.e, transform.f]).multiply(matrix)
    }
    node = node.parentElement
  }
  const length = path.getTotalLength()
  if (!Number.isFinite(length) || length < 1) return null
  const count = Math.ceil(length / 2)
  const points = new Float64Array((count + 1) * 2)
  for (let index = 0; index <= count; index++) {
    const point = path.getPointAtLength(length * index / count)
    // SVGPoint.matrixTransform still requires a legacy SVGMatrix in Chromium.
    // Apply the consolidated DOMMatrix coefficients without crossing that API.
    points[index * 2] = point.x * matrix.a + point.y * matrix.c + matrix.e + minX
    points[index * 2 + 1] = point.x * matrix.b + point.y * matrix.d + matrix.f + minY
  }
  return { points, length, step: length / count }
}

export function pointOnFlowPath(path: FlowPath, distance: number): [number, number] {
  const position = Math.min(path.points.length / 2 - 1, Math.max(0, distance / path.step))
  const index = Math.min(path.points.length / 2 - 2, Math.floor(position))
  const fraction = position - index
  return [
    path.points[index * 2] + (path.points[index * 2 + 2] - path.points[index * 2]) * fraction,
    path.points[index * 2 + 1] + (path.points[index * 2 + 3] - path.points[index * 2 + 1]) * fraction,
  ]
}

export function isInsideFlowLabel(x: number, y: number, label: ExcalidrawTextElement, padding: number): boolean {
  const centerX = label.x + label.width / 2
  const centerY = label.y + label.height / 2
  const cos = Math.cos(-label.angle)
  const sin = Math.sin(-label.angle)
  const dx = x - centerX
  const dy = y - centerY
  return Math.abs(dx * cos - dy * sin) <= label.width / 2 + padding
    && Math.abs(dx * sin + dy * cos) <= label.height / 2 + padding
}
