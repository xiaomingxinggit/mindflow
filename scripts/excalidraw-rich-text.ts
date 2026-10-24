import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)
const packageDirectory = resolve(dirname(require.resolve('@excalidraw/excalidraw')), '../..')
const sourceDirectory = resolve(packageDirectory, 'dist/dev')
const rendererFile = 'chunk-4FTI6OG3.js'

function replaceExactly(source: string, original: string, replacement: string) {
  if (source.split(original).length !== 2) {
    throw new Error(`Excalidraw 0.18.1 rich-text adapter anchor changed: ${original.slice(0, 90)}`)
  }
  return source.replace(original, replacement)
}

/**
 * Uses the official, readable 0.18.1 ESM distribution for reproducible hooks.
 * Vite still tree-shakes and minifies it for production; node_modules is untouched.
 */
export function excalidrawRichText(): Plugin {
  let production = false
  return {
    name: 'mindflow-excalidraw-rich-text-0.18.1',
    enforce: 'pre',
    config(_, environment) {
      production = environment.command === 'build'
      const version = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8')).version
      if (version !== '0.18.1') throw new Error('The Mindflow renderer adapter requires Excalidraw 0.18.1')
      return {
        resolve: {
          alias: [{ find: /^@excalidraw\/excalidraw$/, replacement: resolve(sourceDirectory, 'index.js') }],
        },
        optimizeDeps: {
          exclude: ['@excalidraw/excalidraw'],
          include: [
            'es6-promise-pool',
            'png-chunks-extract',
            'png-chunk-text',
            'png-chunks-encode',
            'pako',
            'open-color',
            'lodash.throttle',
            'lodash.debounce',
            'fuzzy',
            'roughjs/bin/rough',
            'roughjs/bin/generator',
            'roughjs/bin/math',
            'points-on-curve',
            '@braintree/sanitize-url',
            'use-sync-external-store/shim/with-selector.js',
          ],
        },
      }
    },
    transform(source, id) {
      const normalized = id.replaceAll('\\', '/').split('?')[0]
      if (!normalized.includes('/@excalidraw/excalidraw/dist/dev/')) return
      if (production && normalized.endsWith('/chunk-AWQI2HM3.js')) {
        const officialEnvironment = readFileSync(resolve(packageDirectory, 'dist/prod/chunk-ZUYEQ4TG.js'), 'utf8')
        return replaceExactly(
          replaceExactly(officialEnvironment, 'var c=', 'var define_import_meta_env_default='),
          'export{c as a}', 'export{define_import_meta_env_default}',
        )
      }
      if (normalized.endsWith('/index.js')) {
        let code = replaceExactly(source,
          '      const fontFamily = existingTextElement?.fontFamily || this.state.currentItemFontFamily;',
          '      if (globalThis.__mindflowRichText?.edit({ element: existingTextElement, container, sceneX, sceneY })) return;\n      const fontFamily = existingTextElement?.fontFamily || this.state.currentItemFontFamily;')
        // refresh() rerenders App but StaticCanvas otherwise memoizes the same
        // scene. A display-only revision invalidates it without touching history.
        code = replaceExactly(code,
          '                            visibleElements,\n                            sceneNonce,\n                            selectionNonce: this.state.selectionElement?.versionNonce,',
          '                            visibleElements,\n                            sceneNonce,\n                            selectionNonce: this.state.selectionElement?.versionNonce,\n                            mindflowRenderRevision: globalThis.__mindflowRichText?.displayRevision() ?? 0,')
        code = replaceExactly(code,
          'var areEqual4 = (prevProps, nextProps) => {',
          'var areEqual4 = (prevProps, nextProps) => {\n  if (prevProps.mindflowRenderRevision !== nextProps.mindflowRenderRevision) return false;')
        return { code, map: null }
      }
      if (!normalized.endsWith(`/${rendererFile}`)) return
      let code = source
      // Smooth modern vector caches at fractional positions/zoom; keep the
      // upstream pixel handling for images and hand-drawn/system elements.
      code = replaceExactly(code,
        '          !appState?.shouldCacheIgnoreZoom && // angle is 0 -> always disable smoothing',
        '          !(element.customData?.mindflowStyle !== "system" && element.roughness === 0 && ["rectangle", "diamond", "ellipse", "line", "arrow"].includes(element.type)) &&\n          !appState?.shouldCacheIgnoreZoom && // angle is 0 -> always disable smoothing')
      code = replaceExactly(code,
        'var drawElementOnCanvas = (element, rc, context, renderConfig, appState) => {',
        'var drawElementOnCanvas = (element, rc, context, renderConfig, appState) => {\n  if (globalThis.__mindflowRichText?.drawCanvas(element, context, renderConfig.isExporting)) return;')
      code = replaceExactly(code,
        '    imageCrop: isImageElement(element) ? element.crop : null\n  };',
        '    imageCrop: isImageElement(element) ? element.crop : null,\n    mindflowRichRevision: globalThis.__mindflowRichText?.revision(element) ?? 0,\n    mindflowBoundRichRevision: globalThis.__mindflowRichText?.revision(getBoundTextElement(element, elementsMap) || element) ?? 0\n  };')
      code = replaceExactly(code,
        '  if (!prevElementWithCanvas || shouldRegenerateBecauseZoom ||',
        '  if (!prevElementWithCanvas || prevElementWithCanvas.mindflowRichRevision !== (globalThis.__mindflowRichText?.revision(element) ?? 0) || prevElementWithCanvas.mindflowBoundRichRevision !== (globalThis.__mindflowRichText?.revision(boundTextElement || element) ?? 0) || shouldRegenerateBecauseZoom ||')
      code = replaceExactly(code,
        '  const opacity = (getContainingFrame(element, elementsMap)?.opacity ?? 100) * element.opacity / 1e4;\n  switch (element.type) {',
        '  const opacity = (getContainingFrame(element, elementsMap)?.opacity ?? 100) * element.opacity / 1e4;\n  if (isTextElement(element)) {\n    const richNode = globalThis.__mindflowRichText?.createSvg(element, svgRoot.ownerDocument);\n    if (richNode) {\n      richNode.setAttribute("opacity", String(opacity));\n      richNode.setAttribute("transform", `translate(${offsetX || 0} ${offsetY || 0}) rotate(${degree} ${cx} ${cy})`);\n      const clipped = maybeWrapNodesInFrameClipPath(element, root, [richNode], renderConfig.frameRendering, elementsMap);\n      addToRoot(clipped || richNode, element);\n      return;\n    }\n  }\n  switch (element.type) {')
      code = replaceExactly(code,
        '  await loadFonts();\n  const frameRendering = getFrameRenderingConfig(',
        '  await loadFonts();\n  await globalThis.__mindflowRichText?.prepare(elements);\n  const frameRendering = getFrameRenderingConfig(')
      code = replaceExactly(code,
        'var exportToSvg = async (elements, appState, files, opts) => {',
        'var exportToSvg = async (elements, appState, files, opts) => {\n  await globalThis.__mindflowRichText?.prepare(elements);')
      code = replaceExactly(code,
        '  for (const element of elements) {\n    if (!element.isDeleted && "fileId" in element && element.fileId && files[element.fileId]) {',
        '  for (const element of elements) {\n    if (!element.isDeleted) {\n      for (const fileId of element.customData?.mindflowMarkdown?.imageFiles || []) {\n        if (files[fileId]) nextFiles[fileId] = files[fileId];\n      }\n    }\n    if (!element.isDeleted && "fileId" in element && element.fileId && files[element.fileId]) {')
      code = replaceExactly(code,
        '  const _files = elements.reduce((acc, element) => {\n    if (isInitializedImageElement(element)) {',
        '  const _files = elements.reduce((acc, element) => {\n    for (const fileId of element.customData?.mindflowMarkdown?.imageFiles || []) {\n      foundFile = true;\n      if (files?.[fileId]) acc[fileId] = files[fileId];\n    }\n    if (isInitializedImageElement(element)) {')
      code = replaceExactly(code,
        'var computeBoundTextPosition = (container, boundTextElement, elementsMap) => {',
        'var computeBoundTextPosition = (container, boundTextElement, elementsMap) => {\n  if (container.type === "rectangle" && container.customData?.mindflowNote && boundTextElement.customData?.mindflowMarkdown) return { x: container.x + 16, y: container.y + 16 };')
      code = replaceExactly(code,
        'var redrawTextBoundingBox = (textElement, container, elementsMap, informMutation = true) => {',
        `var redrawTextBoundingBox = (textElement, container, elementsMap, informMutation = true) => {
  if (textElement.customData?.mindflowMarkdown) {
    // History replay passes false: its stored geometry must remain authoritative.
    if (informMutation) {
      const richBounds = globalThis.__mindflowRichText?.resizeBoundText(textElement, container || null);
      if (richBounds) {
        mutateElement(textElement, richBounds, informMutation);
        if (container && !isArrowElement(container)) {
          const factor = container.type === "diamond" ? 2 : container.type === "ellipse" ? Math.SQRT2 : 1;
          const width = Math.max(container.width, (textElement.width + 32) * factor);
          const height = Math.max(container.height, (textElement.height + 32) * factor);
          if (width !== container.width || height !== container.height) {
            mutateElement(container, { width, height }, informMutation);
            updateBoundElements(container, elementsMap);
          }
        }
      }
    }
    const updates = { angle: container?.angle ?? textElement.angle };
    if (container) Object.assign(updates, computeBoundTextPosition(container, textElement, elementsMap));
    mutateElement(textElement, updates, informMutation);
    return;
  }`)
      code = replaceExactly(code,
        'var refreshTextDimensions = (textElement, container, elementsMap, text = textElement.text) => {',
        'var refreshTextDimensions = (textElement, container, elementsMap, text = textElement.text) => {\n  if (textElement.customData?.mindflowMarkdown) return { text: textElement.text, x: textElement.x, y: textElement.y, width: textElement.width, height: textElement.height };')
      code = replaceExactly(code,
        '  const textElement = getBoundTextElement(container, elementsMap);\n  if (textElement && textElement.text) {',
        `  const textElement = getBoundTextElement(container, elementsMap);
  if (textElement?.customData?.mindflowMarkdown) {
    if (!isArrowElement(container)) {
      const richBounds = globalThis.__mindflowRichText?.resizeBoundText(textElement, container);
      if (richBounds) mutateElement(textElement, richBounds);
      const factor = container.type === "diamond" ? 2 : container.type === "ellipse" ? Math.SQRT2 : 1;
      const width = Math.max(container.width, ((richBounds ? 100 : textElement.width) + 32) * factor);
      const height = Math.max(container.height, (textElement.height + 32) * factor);
      if (width !== container.width || height !== container.height) {
        mutateElement(container, { width, height });
        updateBoundElements(container, elementsMap);
      }
    }
    mutateElement(textElement, computeBoundTextPosition(container, textElement, elementsMap));
    return;
  }
  if (textElement && textElement.text) {`)
      code = replaceExactly(code,
        '      Scene_default.getScene(element)?.getNonDeletedElementsMap() ?? /* @__PURE__ */ new Map()',
        '      mindflowRichBindingElementsMap ?? Scene_default.getScene(element)?.getNonDeletedElementsMap() ?? /* @__PURE__ */ new Map()')
      code = replaceExactly(code,
        '    mutateElement(element, resizedElement);\n  }\n};\nvar rotateMultipleElements =',
        `    mutateElement(element, resizedElement);
  }
  if (element.customData?.mindflowMarkdown) {
    const richBounds = globalThis.__mindflowRichText?.resizeBoundText(element, null);
    mutateElement(element, {
      ...richBounds,
      text: element.originalText,
      customData: richBounds?.customData || {
        ...element.customData,
        mindflowMarkdown: { ...element.customData.mindflowMarkdown, width: element.width }
      }
    });
  }
};
var rotateMultipleElements =`)
      // A short-lived map supplies native elbow routing without attaching copies
      // to the live Scene, so native mutation cannot change a prior history value.
      code += `\nglobalThis.__mindflowComputeBoundTextPosition = computeBoundTextPosition;
var mindflowRichBindingElementsMap = null;
globalThis.__mindflowRebindRichContainers = (elements, changedContainerIds) => {
  const originals = new Map(elements.map(element => [element.id, element]));
  const affected = new Set(changedContainerIds);
  for (const id of changedContainerIds) {
    const container = originals.get(id);
    for (const binding of container?.boundElements || []) {
      const bound = originals.get(binding.id);
      if (bound && isLinearElement(bound) && !bound.isDeleted) {
        affected.add(bound.id);
        const label = getBoundTextElement(bound, originals);
        if (label) affected.add(label.id);
      }
    }
  }
  const next = new Map(elements.map(element => [element.id,
    affected.has(element.id) ? deepCopyElement(element) : element]));
  const previous = mindflowRichBindingElementsMap;
  mindflowRichBindingElementsMap = next;
  try {
    for (const id of affected) {
      const element = next.get(id);
      if (element && isLinearElement(element) && !element.isDeleted &&
        (element.points[0]?.[0] !== 0 || element.points[0]?.[1] !== 0)) {
        LinearElementEditor.normalizePoints(element);
      }
    }
    for (const id of changedContainerIds) {
      const container = next.get(id);
      if (container && !container.isDeleted) updateBoundElements(container, next);
    }
  } finally {
    mindflowRichBindingElementsMap = previous;
  }
  return elements.map(element => next.get(element.id));
};
globalThis.__mindflowApplyLayoutTranslations = (elements, moves) => {
  const originals = new Map(elements.map(element => [element.id, element]));
  const translations = new Map(moves.map(move => [move.id, move]));
  const affected = new Set(translations.keys());
  for (const element of elements) {
    if (element.isDeleted || !isLinearElement(element)) continue;
    if (translations.has(element.id) || translations.has(element.startBinding?.elementId) || translations.has(element.endBinding?.elementId)) {
      affected.add(element.id);
      const text = getBoundTextElement(element, originals);
      if (text) affected.add(text.id);
    }
  }
  const next = new Map(elements.map(element => [element.id,
    affected.has(element.id) ? deepCopyElement(element) : element]));
  for (const move of moves) {
    const element = next.get(move.id);
    if (element && !element.isDeleted) mutateElement(element, { x: element.x + move.dx, y: element.y + move.dy }, false);
  }
  // An internal connector translated with its endpoints keeps its own geometry.
  const together = elements.filter(element => {
    const move = translations.get(element.id);
    return move && isLinearElement(element) && [element.startBinding, element.endBinding].every(binding => {
      if (!binding) return true;
      const endpoint = translations.get(binding.elementId);
      return endpoint && Math.abs(endpoint.dx - move.dx) < 1e-7 && Math.abs(endpoint.dy - move.dy) < 1e-7;
    });
  }).map(element => next.get(element.id));
  const previous = mindflowRichBindingElementsMap;
  mindflowRichBindingElementsMap = next;
  try {
    for (const id of affected) {
      const element = next.get(id);
      if (element && isLinearElement(element) && !element.isDeleted &&
        (element.points[0]?.[0] !== 0 || element.points[0]?.[1] !== 0)) LinearElementEditor.normalizePoints(element);
    }
    for (const move of moves) {
      const element = next.get(move.id);
      if (element && !element.isDeleted) updateBoundElements(element, next, { simultaneouslyUpdated: together });
    }
    for (const id of affected) {
      const element = next.get(id);
      if (!element || element.isDeleted) continue;
      if (![element.x, element.y, element.width, element.height, ...(isLinearElement(element) ? element.points.flat() : [])].every(Number.isFinite)) {
        throw new Error("Non-finite layout result");
      }
    }
  } finally {
    mindflowRichBindingElementsMap = previous;
  }
  return elements.map(element => next.get(element.id));
};\n`
      return { code, map: null }
    },
  }
}
