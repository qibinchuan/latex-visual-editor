import { Row } from './row'
import { ColumnSelector } from './selectors'
import { useTableContext } from './contexts/table-context'
import { useTableSelection } from './contexts/selection-context'
import { useTableUI } from './contexts/ui-context'
import { TableSelection } from './table-selection'

export function Table() {
  const { parsed } = useTableContext()
  const { setSelection } = useTableSelection()
  const { setDialog } = useTableUI()
  const model = parsed.table
  return (
    <table className="latex-visual-table table-generator-table" tabIndex={-1}>
      <thead>
        {model.columns.some(column => column.size) && (
          <tr className="table-generator-column-widths-row">
            <td />
            {model.columns.map((column, index) => (
              <td key={index}>
                {column.size && (
                  <button
                    type="button"
                    className="table-generator-column-indicator-button"
                    title="Set column width"
                    onClick={() => {
                      setSelection(
                        new TableSelection(
                          { row: 0, cell: index },
                          { row: model.rows.length - 1, cell: index }
                        )
                      )
                      setDialog('width')
                    }}
                  >
                    {column.size.width}
                    {column.size.unit}
                  </button>
                )}
              </td>
            ))}
          </tr>
        )}
        <tr>
          <td />
          {model.columns.map((_, index) => (
            <ColumnSelector key={index} column={index} />
          ))}
        </tr>
      </thead>
      <tbody>
        {model.rows.map((row, index) => (
          <Row key={index} row={row} rowIndex={index} />
        ))}
      </tbody>
    </table>
  )
}
