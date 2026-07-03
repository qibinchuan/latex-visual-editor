import type { TableData } from './table-model'

type TableCoordinate = {
  readonly row: number
  readonly cell: number
}

/**
 * Logical table selection, including the expansion rules Overleaf applies to
 * selections that intersect a multicolumn cell.
 */
export class TableSelection {
  readonly from: TableCoordinate
  readonly to: TableCoordinate

  constructor(from: TableCoordinate, to: TableCoordinate = from) {
    this.from = from
    this.to = to
  }

  normalized() {
    return {
      minX: Math.min(this.from.cell, this.to.cell),
      maxX: Math.max(this.from.cell, this.to.cell),
      minY: Math.min(this.from.row, this.to.row),
      maxY: Math.max(this.from.row, this.to.row),
    }
  }

  eq(other: TableSelection): boolean {
    return (
      this.from.row === other.from.row &&
      this.from.cell === other.from.cell &&
      this.to.row === other.to.row &&
      this.to.cell === other.to.cell
    )
  }

  contains(row: number, column: number, table: TableData): boolean {
    const { minX, maxX, minY, maxY } = this.normalized()
    const bounds = table.getCellBoundaries(row, column)
    return row >= minY && row <= maxY && bounds.from >= minX && bounds.to <= maxX
  }

  explode(table: TableData): TableSelection {
    let selection: TableSelection = this
    while (true) {
      const { minX, maxX, minY, maxY } = selection.normalized()
      let next = selection
      for (let row = minY; row <= maxY; row++) {
        const left = table.getCellBoundaries(row, minX)
        const right = table.getCellBoundaries(row, maxX)
        if (left.from < minX) {
          next =
            selection.from.cell === minX
              ? new TableSelection(
                  { ...selection.from, cell: left.from },
                  selection.to
                )
              : new TableSelection(
                  selection.from,
                  { ...selection.to, cell: left.from }
                )
          break
        }
        if (right.to > maxX) {
          next =
            selection.to.cell === maxX
              ? new TableSelection(
                  selection.from,
                  { ...selection.to, cell: right.to }
                )
              : new TableSelection(
                  { ...selection.from, cell: right.to },
                  selection.to
                )
          break
        }
      }
      if (next.eq(selection)) return selection
      selection = next
    }
  }

  selectRow(row: number, extend: boolean, table: TableData): TableSelection {
    return new TableSelection(
      { row: extend ? this.from.row : row, cell: 0 },
      { row, cell: table.columns.length - 1 }
    ).explode(table)
  }

  selectColumn(
    column: number,
    extend: boolean,
    table: TableData
  ): TableSelection {
    return new TableSelection(
      { row: 0, cell: extend ? this.from.cell : column },
      { row: table.rows.length - 1, cell: column }
    ).explode(table)
  }

  isRowSelected(row: number, table: TableData): boolean {
    const { minX, maxX, minY, maxY } = this.normalized()
    return (
      row >= minY &&
      row <= maxY &&
      minX === 0 &&
      maxX === table.columns.length - 1
    )
  }

  isColumnSelected(column: number, table: TableData): boolean {
    const { minX, maxX, minY, maxY } = this.normalized()
    return (
      column >= minX &&
      column <= maxX &&
      minY === 0 &&
      maxY === table.rows.length - 1
    )
  }

  isAnyRowSelected(table: TableData): boolean {
    return table.rows.some((_, row) => this.isRowSelected(row, table))
  }

  isAnyColumnSelected(table: TableData): boolean {
    return table.columns.some((_, column) =>
      this.isColumnSelected(column, table)
    )
  }

  isMergedCellSelected(table: TableData): boolean {
    if (this.from.row !== this.to.row) return false
    const from = table.getCellBoundaries(this.from.row, this.from.cell)
    const to = table.getCellBoundaries(this.to.row, this.to.cell)
    return (
      from.from === to.from &&
      Boolean(table.getCell(this.from.row, from.from).multiColumn)
    )
  }

  isMergeableCells(table: TableData): boolean {
    const { minX, maxX, minY, maxY } = this.normalized()
    if (minY !== maxY || minX === maxX) return false
    for (let column = minX; column <= maxX; column++) {
      if (table.getCell(minY, column).multiColumn) return false
    }
    return true
  }

  isOnlyFixedWidthColumns(table: TableData): boolean {
    const { minX, maxX } = this.normalized()
    for (let column = minX; column <= maxX; column++) {
      if (
        !this.isColumnSelected(column, table) ||
        !table.columns[column].isParagraphColumn
      ) {
        return false
      }
    }
    return true
  }

  isOnlyNonFixedWidthColumns(table: TableData): boolean {
    const { minX, maxX } = this.normalized()
    for (let column = minX; column <= maxX; column++) {
      if (
        !this.isColumnSelected(column, table) ||
        table.columns[column].isParagraphColumn
      ) {
        return false
      }
    }
    return true
  }

  spansEntireTable(table: TableData): boolean {
    const { minX, maxX, minY, maxY } = this.normalized()
    return (
      minX === 0 &&
      minY === 0 &&
      maxX === table.columns.length - 1 &&
      maxY === table.rows.length - 1
    )
  }

  width(): number {
    const { minX, maxX } = this.normalized()
    return maxX - minX + 1
  }

  height(): number {
    const { minY, maxY } = this.normalized()
    return maxY - minY + 1
  }

  maximumCellWidth(table: TableData): number {
    const { minX, maxX, minY, maxY } = this.normalized()
    let maximum = 1
    for (let row = minY; row <= maxY; row++) {
      maximum = Math.max(
        maximum,
        table.getCellIndex(row, maxX) - table.getCellIndex(row, minX) + 1
      )
    }
    return maximum
  }

  moveRight(table: TableData): TableSelection {
    const next = Math.min(
      table.columns.length - 1,
      table.getCellBoundaries(this.to.row, this.to.cell).to + 1
    )
    return new TableSelection({ row: this.to.row, cell: next }).explode(table)
  }

  moveLeft(table: TableData): TableSelection {
    const previous = Math.max(
      0,
      table.getCellBoundaries(this.to.row, this.to.cell).from - 1
    )
    return new TableSelection({
      row: this.to.row,
      cell: previous,
    }).explode(table)
  }

  moveUp(table: TableData): TableSelection {
    return new TableSelection({
      row: Math.max(0, this.to.row - 1),
      cell: this.to.cell,
    }).explode(table)
  }

  moveDown(table: TableData): TableSelection {
    return new TableSelection({
      row: Math.min(table.rows.length - 1, this.to.row + 1),
      cell: table.getCellBoundaries(this.to.row, this.to.cell).from,
    }).explode(table)
  }

  moveNext(table: TableData): TableSelection {
    const boundary = table.getCellBoundaries(this.to.row, this.to.cell)
    if (
      this.to.row === table.rows.length - 1 &&
      boundary.to === table.columns.length - 1
    ) {
      return new TableSelection(this.to).explode(table)
    }
    if (boundary.to === table.columns.length - 1) {
      return new TableSelection({ row: this.to.row + 1, cell: 0 }).explode(
        table
      )
    }
    return new TableSelection({
      row: this.to.row,
      cell: boundary.to + 1,
    }).explode(table)
  }

  movePrevious(table: TableData): TableSelection {
    const boundary = table.getCellBoundaries(this.to.row, this.to.cell)
    if (this.to.row === 0 && boundary.from === 0) {
      return new TableSelection(this.to).explode(table)
    }
    if (boundary.from === 0) {
      return new TableSelection({
        row: this.to.row - 1,
        cell: table.columns.length - 1,
      }).explode(table)
    }
    return new TableSelection({
      row: this.to.row,
      cell: boundary.from - 1,
    }).explode(table)
  }

  extend(
    direction: 'left' | 'right' | 'up' | 'down',
    table: TableData
  ): TableSelection {
    let { row, cell } = this.to
    if (direction === 'left') cell = Math.max(0, cell - 1)
    if (direction === 'right') cell = Math.min(table.columns.length - 1, cell + 1)
    if (direction === 'up') row = Math.max(0, row - 1)
    if (direction === 'down') row = Math.min(table.rows.length - 1, row + 1)
    return new TableSelection(this.from, { row, cell }).explode(table)
  }
}
