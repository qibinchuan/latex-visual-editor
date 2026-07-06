import type { RowData } from './table-model'
import { Cell } from './cell'
import { RowSelector } from './selectors'
import { useTableContext } from './contexts/table-context'

export function Row({ row, rowIndex }: { row: RowData; rowIndex: number }) {
  const { parsed } = useTableContext()
  let logicalColumn = 0
  return (
    <tr>
      <RowSelector row={rowIndex} />
      {row.cells.map((cell, cellIndex) => {
        const fromColumn = logicalColumn
        logicalColumn += cell.multiColumn?.columnSpan ?? 1
        const column = cell.multiColumn
          ? cell.multiColumn.columns.specification[0]
          : parsed.table.columns[fromColumn]
        return (
          <Cell
            key={cellIndex}
            cell={cell}
            column={column}
            rowIndex={rowIndex}
            cellIndex={cellIndex}
            fromColumn={fromColumn}
            rowLength={row.cells.length}
            borderTop={row.borderTop}
            borderBottom={row.borderBottom}
          />
        )
      })}
    </tr>
  )
}
