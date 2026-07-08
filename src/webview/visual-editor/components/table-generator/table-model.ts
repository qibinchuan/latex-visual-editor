import type { WidthSelection } from './toolbar/column-width-modal/column-width'

export type ColumnDefinition = {
  alignment: 'left' | 'center' | 'right' | 'paragraph'
  borderLeft: number
  borderRight: number
  content: string
  cellSpacingLeft: string
  cellSpacingRight: string
  customCellDefinition: string
  isParagraphColumn: boolean
  size?: WidthSelection
}

export type CellData = {
  content: string
  from: number
  to: number
  multiColumn?: {
    columnSpan: number
    columns: {
      specification: ColumnDefinition[]
      from: number
      to: number
    }
    from: number
    to: number
    preamble: { from: number; to: number }
    postamble: { from: number; to: number }
  }
}

export type RowData = {
  cells: CellData[]
  borderTop: number
  borderBottom: number
}

export enum BorderTheme {
  NO_BORDERS = 0,
  FULLY_BORDERED = 1,
  BOOKTABS = 2,
}

/**
 * Stores the parsed rows and columns of a visual LaTeX table.
 */
export class TableData {
  constructor(
    public readonly rows: RowData[],
    public readonly columns: ColumnDefinition[]
  ) {}

  getCellIndex(row: number, column: number): number {
    let offset = 0
    for (let index = 0; index < this.rows[row].cells.length; index++) {
      offset += this.rows[row].cells[index].multiColumn?.columnSpan ?? 1
      if (column < offset) return index
    }
    return this.rows[row].cells.length - 1
  }

  getCell(row: number, column: number): CellData {
    return this.rows[row].cells[this.getCellIndex(row, column)]
  }

  getCellBoundaries(row: number, column: number) {
    let offset = 0
    for (const cell of this.rows[row].cells) {
      const width = cell.multiColumn?.columnSpan ?? 1
      if (offset + width > column) {
        return { from: offset, to: offset + width - 1 }
      }
      offset += width
    }
    throw new Error("Couldn't find cell boundaries")
  }

  iterateCells(
    minRow: number,
    maxRow: number,
    minColumn: number,
    maxColumn: number,
    callback: (cell: CellData, row: number, column: number) => void
  ): void {
    for (let row = minRow; row <= maxRow; row++) {
      let logicalColumn = this.getCellBoundaries(row, minColumn).from
      const first = this.getCellIndex(row, minColumn)
      const last = this.getCellIndex(row, maxColumn)
      for (let index = first; index <= last; index++) {
        const cell = this.rows[row].cells[index]
        callback(cell, row, logicalColumn)
        logicalColumn += cell.multiColumn?.columnSpan ?? 1
      }
    }
  }

  getBorderTheme(): BorderTheme | null {
    if (!this.rows.length || !this.columns.length) return null

    const hasTopRule = this.rows[0].borderTop === 1
    const hasMidRule =
      this.rows[1]?.borderTop === 1 &&
      (this.rows.length === 2 || this.rows[1].borderBottom === 0)
    const lastRow = this.rows.at(-1)!
    const hasBottomRule =
      lastRow.borderBottom === 1 &&
      (this.rows.length === 2 || lastRow.borderTop === 0)

    if (hasTopRule && hasMidRule && hasBottomRule) {
      const noExtraRowBorders = this.rows
        .slice(2, -1)
        .every(row => row.borderTop === 0 && row.borderBottom === 0)
      const noColumnBorders = this.columns.every(
        column => column.borderLeft === 0 && column.borderRight === 0
      )
      if (noExtraRowBorders && noColumnBorders) return BorderTheme.BOOKTABS
    }

    const hasAllRowBorders =
      lastRow.borderBottom > 0 &&
      this.rows.every(row => row.borderTop > 0)
    const hasNoRowBorders =
      lastRow.borderBottom === 0 &&
      this.rows.every(row => row.borderTop === 0)
    const hasAllColumnBorders =
      this.columns[0].borderLeft > 0 &&
      this.columns.every(column => column.borderRight > 0) &&
      this.rows.every(row =>
        row.cells.every(cell => {
          if (!cell.multiColumn) return true
          const columns = cell.multiColumn.columns.specification
          return (
            columns.length > 0 &&
            columns[0].borderLeft > 0 &&
            columns.every(column => column.borderRight > 0)
          )
        })
      )
    const hasNoColumnBorders =
      this.columns[0].borderLeft === 0 &&
      this.columns.every(column => column.borderRight === 0) &&
      this.rows.every(row =>
        row.cells.every(cell =>
          cell.multiColumn
            ? cell.multiColumn.columns.specification.every(
                column => column.borderLeft === 0 && column.borderRight === 0
              )
            : true
        )
      )

    if (hasAllRowBorders && hasAllColumnBorders) {
      return BorderTheme.FULLY_BORDERED
    }
    if (hasNoRowBorders && hasNoColumnBorders) return BorderTheme.NO_BORDERS
    return null
  }
}
