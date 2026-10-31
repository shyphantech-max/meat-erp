/**
 * Print a single element in a clean window that reuses the app's stylesheets,
 * so invoices / slips / settlement reports print without the surrounding UI.
 */
export function printElement(el: HTMLElement, title = 'Print') {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) {
    window.print()
    return
  }
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((n) => n.outerHTML)
    .join('\n')
  const dir = document.documentElement.dir || 'ltr'
  const lang = document.documentElement.lang || 'en'
  w.document.open()
  w.document.write(`<!doctype html><html dir="${dir}" lang="${lang}"><head><meta charset="utf-8"><title>${title}</title>${styles}
<style>@page{size:A4;margin:12mm} body{background:#fff!important;padding:0;margin:0} .print-doc{max-width:none!important;box-shadow:none!important;padding:0!important}</style></head>
<body><div class="print-doc">${el.innerHTML}</div></body></html>`)
  w.document.close()
  const go = () => {
    w.focus()
    w.print()
  }
  // give fonts and stylesheets a moment to load
  if (w.document.readyState === 'complete') setTimeout(go, 350)
  else w.addEventListener('load', () => setTimeout(go, 250))
}
