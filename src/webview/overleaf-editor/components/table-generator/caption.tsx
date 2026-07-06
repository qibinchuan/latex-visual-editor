import { useEffect, useRef } from 'react'
import { loadMathJax } from '../../../mathjax/load-mathjax'
import { renderTableCellContent } from './rich-content'
import { useTableContext } from './contexts/table-context'

export function Caption() {
  const { captionSource, view } = useTableContext()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || captionSource === undefined) return
    let cancelled = false
    renderTableCellContent(captionSource, element)
    void loadMathJax()
      .then(async MathJax => {
        if (cancelled || !element.isConnected) return
        await MathJax.typesetPromise([element])
        if (cancelled || !element.isConnected) return
        view.requestMeasure()
        MathJax.typesetClear([element])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [captionSource, view])
  if (captionSource === undefined) return null
  return <div ref={ref} className="table-generator-caption" />
}
