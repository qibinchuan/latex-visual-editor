import type { TablePositions } from './table-commands'
import { generateColumnSpecification } from './table-commands'
import type { TableData } from './table-model'
import type { TableSelection } from './table-selection'

type Change = { from: number; to: number; insert: string }

export function selectedTableText(
  selection: TableSelection,
  model: TableData
) {
  const { minX, maxX, minY, maxY } = selection.normalized()
  const output: string[] = []
  for (let row = minY; row <= maxY; row++) {
    const values: string[] = []
    model.iterateCells(row, row, minX, maxX, cell =>
      values.push(cell.content)
    )
    output.push(values.join('\t'))
  }
  return output.join('\n')
}

export function deleteTableSelectionChanges(
  selection: TableSelection,
  model: TableData,
  positions: TablePositions
): Change[] {
  const { minX, maxX, minY, maxY } = selection.normalized()
  const changes: Change[] = []
  if (minX === 0 && maxX === model.columns.length - 1) {
    if (minY === 0 && maxY === model.rows.length - 1) {
      changes.push({
        from: positions.rowPositions[0].from,
        to: positions.rowPositions.at(-1)!.to,
        insert: '',
      })
    } else {
      for (let row = minY; row <= maxY; row++) {
        changes.push({ ...positions.rowPositions[row], insert: '' })
      }
    }
    return changes
  }
  for (let row = 0; row < model.rows.length; row++) {
    const first = model.getCellIndex(row, minX)
    const last = model.getCellIndex(row, maxX)
    const firstPosition = positions.cellPositions[row][first]
    const lastPosition = positions.cellPositions[row][last]
    const separators = positions.cellSeparators[row]
    changes.push(
      first === 0
        ? {
            from: firstPosition.from,
            to: separators[last]?.to ?? lastPosition.to,
            insert: '',
          }
        : {
            from: separators[first - 1].from,
            to: lastPosition.to,
            insert: '',
          }
    )
  }
  changes.push({
    from: positions.specification.from,
    to: positions.specification.to,
    insert: generateColumnSpecification(
      model.columns.filter((_, column) => column < minX || column > maxX)
    ),
  })
  return changes
}

export function pasteTableChanges(
  text: string,
  selection: TableSelection,
  model: TableData
): Change[] {
  const { minX, minY } = selection.normalized()
  const changes: Change[] = []
  text.replace(/\r/g, '').split('\n').forEach((line, rowOffset) => {
    const row = minY + rowOffset
    if (row >= model.rows.length) return
    const start = model.getCellIndex(row, minX)
    line.split('\t').forEach((value, offset) => {
      const cell = model.rows[row].cells[start + offset]
      if (cell) changes.push({ from: cell.from, to: cell.to, insert: value })
    })
  })
  return changes
}
