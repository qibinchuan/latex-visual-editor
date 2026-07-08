import { useEffect, useRef, useState } from 'react'
import { setColumnWidth } from './table-commands'
import { useTableContext } from './contexts/table-context'
import { useTableSelection } from './contexts/selection-context'
import { useTableUI } from './contexts/ui-context'
import type { WidthUnit } from './toolbar/column-width-modal/column-width'

export function TableDialogs() {
  const { dialog, setDialog } = useTableUI()
  if (dialog === 'help') return <HelpDialog close={() => setDialog(null)} />
  if (dialog === 'width') return <WidthDialog close={() => setDialog(null)} />
  return null
}

function HelpDialog({ close }: { close(): void }) {
  return (
    <div
      className="table-generator-dialog-backdrop table-generator-help-modal"
      onMouseDown={event => event.target === event.currentTarget && close()}
    >
      <div
        className="table-generator-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-help-title"
      >
        <h2 id="table-help-title">Table editor help</h2>
        <p>
          This tool lets you edit simple LaTeX tables without writing the table
          code directly.
        </p>
        <h3>How it works</h3>
        <p>
          Select cells by dragging, or use the row and column handles.
          Double-click a cell to edit it. Use the floating toolbar to change the
          selected cells.
        </p>
        <h3>Customizing tables</h3>
        <p>
          Complex table code may need source mode. Fixed-width columns require
          the <code>array</code> package.
        </p>
        <div className="table-generator-dialog-actions">
          <button type="button" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}

function WidthDialog({ close }: { close(): void }) {
  const { view, parsed, positions } = useTableContext()
  const { selection, dispatchCommand } = useTableSelection()
  const single =
    selection?.width() === 1 ? parsed.table.columns[selection.to.cell] : undefined
  const [unit, setUnit] = useState<WidthUnit>(single?.size?.unit ?? '%')
  const [width, setWidth] = useState(String(single?.size?.width ?? ''))
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  if (!selection) return null
  return (
    <div className="table-generator-dialog-backdrop table-generator-width-modal">
      <form
        className="table-generator-dialog"
        onSubmit={event => {
          event.preventDefault()
          dispatchCommand(() =>
            setColumnWidth(
              view,
              selection,
              unit === 'custom'
                ? { unit, width }
                : { unit, width: Number(width) },
              positions,
              parsed.table
            )
          )
          close()
        }}
      >
        <h2>Set column width</h2>
        <div className="table-generator-width-fields">
          <label>
            Column width
            <input
              ref={inputRef}
              required
              value={width}
              type={unit === 'custom' ? 'text' : 'number'}
              onChange={event => setWidth(event.target.value)}
            />
          </label>
          <label>
            <span className="visually-hidden">Length unit</span>
            <select
              value={unit}
              onChange={event => setUnit(event.target.value as WidthUnit)}
            >
              <option value="%">%</option>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="in">in</option>
              <option value="pt">pt</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>
        <p className="table-generator-width-help">
          % is the percentage of the line width.
        </p>
        <p>Text wrapping requires <code>\usepackage{'{array}'}</code>.</p>
        <div className="table-generator-dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit">OK</button>
        </div>
      </form>
    </div>
  )
}
