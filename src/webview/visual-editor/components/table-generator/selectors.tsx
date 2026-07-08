import { useTableContext } from './contexts/table-context'
import { useTableSelection } from './contexts/selection-context'

export function ColumnSelector({ column }: { column: number }) {
  const { parsed } = useTableContext()
  const { selection, selectColumn } = useTableSelection()
  const selected = selection?.isColumnSelected(column, parsed.table)
  return (
    <td
      className={[
        'table-generator-selector-cell column-selector',
        selected && 'fully-selected',
      ]
        .filter(Boolean)
        .join(' ')}
      data-column-selector={column}
      onMouseDown={event => {
        event.preventDefault()
        selectColumn(column, event.shiftKey)
      }}
    />
  )
}

export function RowSelector({ row }: { row: number }) {
  const { parsed } = useTableContext()
  const { selection, selectRow } = useTableSelection()
  const selected = selection?.isRowSelected(row, parsed.table)
  return (
    <td
      className={[
        'table-generator-selector-cell row-selector',
        selected && 'fully-selected',
      ]
        .filter(Boolean)
        .join(' ')}
      data-row-selector={row}
      onMouseDown={event => {
        event.preventDefault()
        selectRow(row, event.shiftKey)
      }}
    />
  )
}
