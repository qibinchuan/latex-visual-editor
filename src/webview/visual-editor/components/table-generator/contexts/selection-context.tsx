import { createContext, useContext } from 'react'
import type { TableSelection } from '../table-selection'

export type SelectionContextValue = {
  selection: TableSelection | null
  dragging: boolean
  setSelection(next: TableSelection | null): void
  selectRow(row: number, extend: boolean): void
  selectColumn(column: number, extend: boolean): void
  pointerDown(event: React.MouseEvent, row: number, from: number, to: number): void
  pointerMove(event: React.MouseEvent, row: number, from: number): void
  pointerUp(row: number, cellIndex: number, source: string): void
  dispatchCommand(command: () => void): void
}

export const SelectionContext =
  createContext<SelectionContextValue | null>(null)

export function useTableSelection() {
  const value = useContext(SelectionContext)
  if (!value) throw new Error('Table selection context is missing')
  return value
}
