import { WidgetType, type EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { Tabular } from '../../../components/table-generator/tabular'
import type { TablePositions } from '../../../components/table-generator/table-commands'
import {
  parseTableEnvironment,
  type ParsedTableData,
} from '../../../components/table-generator/utils'

export { renderTableCellContent } from '../../../components/table-generator/rich-content'

export class TabularWidget extends WidgetType {
  private static roots = new WeakMap<HTMLElement, Root>()

  constructor(
    private parsedTableData: ParsedTableData,
    private tabularNode: SyntaxNode,
    private content: string,
    private tableNode: SyntaxNode | null,
    private isDirectChildOfTableEnvironment: boolean
  ) {
    super()
  }

  private render(element: HTMLDivElement, view: EditorView, root: Root) {
    const positions: TablePositions = {
      ...this.parsedTableData,
      tabular: { from: this.tabularNode.from, to: this.tabularNode.to },
    }
    const environment = this.tableNode
      ? parseTableEnvironment(this.tableNode)
      : undefined
    flushSync(() => {
      root.render(
        <Tabular
          key={this.content}
          host={element}
          view={view}
          parsed={this.parsedTableData}
          positions={positions}
          environment={environment}
          tabularNode={this.tabularNode}
          tableNode={this.tableNode}
          directTableChild={this.isDirectChildOfTableEnvironment}
        />
      )
    })
  }

  toDOM(view: EditorView) {
    const element = document.createElement('div')
    element.className = 'ol-cm-tabular table-generator'
    if (this.tableNode) element.classList.add('ol-cm-environment-table')
    const root = createRoot(element)
    TabularWidget.roots.set(element, root)
    this.render(element, view, root)
    return element
  }

  updateDOM(element: HTMLElement, view: EditorView) {
    const root = TabularWidget.roots.get(element)
    if (!root || !(element instanceof HTMLDivElement)) return false
    element.classList.toggle('ol-cm-environment-table', Boolean(this.tableNode))
    this.render(element, view, root)
    return true
  }

  eq(widget: TabularWidget) {
    return (
      this.tabularNode.from === widget.tabularNode.from &&
      this.tableNode?.from === widget.tableNode?.from &&
      this.tableNode?.to === widget.tableNode?.to &&
      this.content === widget.content &&
      this.isDirectChildOfTableEnvironment ===
        widget.isDirectChildOfTableEnvironment
    )
  }

  ignoreEvent() {
    return true
  }

  destroy(element: HTMLElement) {
    const root = TabularWidget.roots.get(element)
    if (root) {
      root.unmount()
      TabularWidget.roots.delete(element)
    }
  }

  coordsAt(element: HTMLElement) {
    return element.getBoundingClientRect()
  }

  get estimatedHeight() {
    return this.parsedTableData.table.rows.length * 50
  }
}
