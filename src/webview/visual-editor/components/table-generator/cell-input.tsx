import { useLayoutEffect, useRef } from 'react'
import { useTableEditing } from './contexts/editing-context'

const filterInput = (value: string) =>
  value
    .replace(/(^|[^\\])&/g, '$1\\&')
    .replace(/(^|[^\\])%/g, '$1\\%')
    .replaceAll('\\\\', '')

export function CellInput() {
  const { editing, updateDraft, commitEditing, cancelEditing } =
    useTableEditing()
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const input = ref.current
    if (!input || !editing) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
    input.style.height = '1px'
    input.style.height = `${Math.max(30, input.scrollHeight)}px`
  }, [])

  if (!editing) return null
  return (
    <textarea
      ref={ref}
      className="table-generator-cell-input"
      value={editing.content}
      onChange={event => {
        const input = event.currentTarget
        const filtered = filterInput(input.value)
        const caret =
          input.selectionStart + filtered.length - input.value.length
        updateDraft(filtered)
        requestAnimationFrame(() => {
          input.setSelectionRange(caret, caret)
          input.style.height = '1px'
          input.style.height = `${Math.max(30, input.scrollHeight)}px`
        })
      }}
      onBlur={() => commitEditing(false)}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelEditing()
        } else if (event.key === 'Tab') {
          event.preventDefault()
          commitEditing()
        }
      }}
    />
  )
}
