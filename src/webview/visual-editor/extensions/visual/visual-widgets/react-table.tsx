import type { TableData } from '../../../components/table-generator/table-model'

export function ReactTable({ model }: { model: TableData }) {
  return (
    <>
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
                    data-column-width={index}
                    title="Set column width"
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
            <td
              key={index}
              className="table-generator-selector-cell column-selector"
              data-column-selector={index}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {model.rows.map((row, rowIndex) => {
          let logicalColumn = 0
          return (
            <tr key={rowIndex}>
              <td
                className="table-generator-selector-cell row-selector"
                data-row-selector={rowIndex}
              />
              {row.cells.map((cell, cellIndex) => {
                const width = cell.multiColumn?.columnSpan ?? 1
                const fromColumn = logicalColumn
                logicalColumn += width
                const column = cell.multiColumn
                  ? cell.multiColumn.columns.specification[0]
                  : model.columns[fromColumn]
                const className = [
                  'table-generator-cell',
                  `alignment-${column.alignment}`,
                  column.borderLeft > 0 &&
                    'table-generator-cell-border-left',
                  column.borderRight > 0 &&
                    'table-generator-cell-border-right',
                  row.borderTop > 0 && 'table-generator-row-border-top',
                  row.borderBottom > 0 && 'table-generator-row-border-bottom',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <td
                    key={cellIndex}
                    colSpan={width}
                    tabIndex={rowIndex * row.cells.length + cellIndex + 1}
                    className={className}
                    data-cell-index={cellIndex}
                    data-from-column={fromColumn}
                  >
                    <div className="table-generator-cell-render" />
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </>
  )
}
