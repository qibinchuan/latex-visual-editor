import { createContext, useContext, type PropsWithChildren } from 'react'
import type { EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { ParsedTableData } from '../utils'
import type { TablePositions } from '../table-commands'

export type TableEnvironmentData = {
  table: { from: number; to: number }
  caption?: { from: number; to: number }
  label?: { from: number; to: number }
}

export type TableContextValue = {
  view: EditorView
  parsed: ParsedTableData
  positions: TablePositions
  environment?: TableEnvironmentData
  tabularNode: SyntaxNode
  tableNode: SyntaxNode | null
  directTableChild: boolean
  captionSource?: string
  captionAbove: boolean
}

const TableContext = createContext<TableContextValue | null>(null)

export function TableProvider({
  value,
  children,
}: PropsWithChildren<{ value: TableContextValue }>) {
  return <TableContext.Provider value={value}>{children}</TableContext.Provider>
}

export function useTableContext() {
  const value = useContext(TableContext)
  if (!value) throw new Error('TableProvider is missing')
  return value
}
