import { useEffect, useMemo } from 'react'
import type { EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { ParsedTableData } from './utils'
import type { TablePositions } from './table-commands'
import {
  TableProvider,
  type TableEnvironmentData,
  useTableContext,
} from './contexts/table-context'
import { TableInteractionProvider } from './contexts/interaction-context'
import { TableUIProvider, useTableUI } from './contexts/ui-context'
import { Toolbar } from './toolbar/toolbar'
import { Table } from './table'
import { Caption } from './caption'
import { TableDialogs } from './dialogs'

export type TabularProps = {
  view: EditorView
  parsed: ParsedTableData
  positions: TablePositions
  environment?: TableEnvironmentData
  tabularNode: SyntaxNode
  tableNode: SyntaxNode | null
  directTableChild: boolean
  captionSource?: string
  captionAbove: boolean
  host: HTMLDivElement
}

export function Tabular(props: TabularProps) {
  const wrapperRef = useMemo(() => ({ current: props.host }), [props.host])
  return (
    <TableProvider value={props}>
      <TableUIProvider>
        <TableInteractionProvider wrapperRef={wrapperRef}>
          <TabularBody wrapperRef={wrapperRef} />
        </TableInteractionProvider>
      </TableUIProvider>
    </TableProvider>
  )
}

function TabularBody({
  wrapperRef: _wrapperRef,
}: {
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const { captionSource, captionAbove } = useTableValueForLayout()
  const { closeMenu } = useTableUI()
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('[aria-haspopup="menu"]')) {
        closeMenu()
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [closeMenu])
  return (
    <>
      <Toolbar />
      {captionSource !== undefined && captionAbove && <Caption />}
      <Table />
      {captionSource !== undefined && !captionAbove && <Caption />}
      <TableDialogs />
    </>
  )
}

function useTableValueForLayout() {
  return useTableContext()
}
