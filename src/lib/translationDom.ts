const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,td,th,dt,dd,figcaption'
const BREAKS = `${BLOCKS},ul,ol,table,pre,blockquote,div,details,summary`
const EXCLUDED = 'pre,code,kbd,samp,script,style,svg,button,textarea,[translate="no"],.notranslate'

export interface TranslationPassage {
  original: HTMLSpanElement
  translated: HTMLSpanElement
  text: string
  protectedNodes: Node[]
}

/** Wrap inline runs only. Nested lists, table rows, anchors and code stay in place. */
export function collectTranslationPassages(root: HTMLElement): TranslationPassage[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS))
  if (!elements.length) elements.push(root)
  const passages: TranslationPassage[] = []
  for (const element of elements) {
    if (element.closest(EXCLUDED)) continue
    let run: Node[] = []
    const flush = () => {
      if (!run.length) return
      const fragment = document.createElement('span')
      run.forEach((node) => fragment.appendChild(node.cloneNode(true)))
      // Badge/image-only paragraphs and code-only examples are not prose.
      const prose = fragment.cloneNode(true) as HTMLElement
      prose.querySelectorAll('code,kbd,samp,img,svg').forEach((node) => node.remove())
      if (!/\p{L}/u.test(prose.textContent ?? '')) { run = []; return }
      const protectedNodes: Node[] = []
      fragment.querySelectorAll('a,code,kbd,samp,img,br,[translate="no"],.notranslate').forEach((node) => {
        if (!fragment.contains(node)) return // an ancestor was already protected
        const index = protectedNodes.push(node.cloneNode(true)) - 1
        node.replaceWith(document.createTextNode(`⟪ORBIT_${index}⟫`))
      })
      const text = (fragment.textContent ?? '').trim()
      if (!/\p{L}/u.test(text.replace(/⟪ORBIT_\d+⟫/g, ''))) { run = []; return }
      const original = document.createElement('span')
      original.className = 'translation-original'
      run[0].parentNode!.insertBefore(original, run[0])
      run.forEach((node) => original.appendChild(node))
      const translated = document.createElement('span')
      translated.className = 'translation-result'
      translated.hidden = true
      translated.dir = 'auto'
      original.after(translated)
      passages.push({ original, translated, text, protectedNodes })
      run = []
    }
    for (const node of Array.from(element.childNodes)) {
      if (node instanceof Element && (node.matches(BREAKS) || node.querySelector(BREAKS))) flush()
      else run.push(node)
    }
    flush()
  }
  return passages
}

/** Provider output is always text, with only our own sanitized nodes reinserted. */
export function showTranslation(passage: TranslationPassage, text: string, language: string) {
  const fragment = document.createDocumentFragment()
  for (const part of text.split(/(⟪ORBIT_\d+⟫)/g)) {
    const match = /^⟪ORBIT_(\d+)⟫$/.exec(part)
    const protectedNode = match ? passage.protectedNodes[Number(match[1])] : undefined
    if (protectedNode) {
      const clone = protectedNode.cloneNode(true)
      // A translated link/image must not duplicate an original fragment anchor.
      if (clone instanceof Element) {
        clone.removeAttribute('id')
        clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
      }
      fragment.appendChild(clone)
    } else fragment.appendChild(document.createTextNode(part))
  }
  passage.translated.replaceChildren(fragment)
  passage.translated.lang = language
  passage.translated.hidden = false
  passage.original.classList.add('has-translation')
}

export function removeTranslations(passages: TranslationPassage[]) {
  for (const passage of passages) {
    passage.translated.remove()
    passage.original.replaceWith(...Array.from(passage.original.childNodes))
  }
}

export function escapeTranslationText(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}
