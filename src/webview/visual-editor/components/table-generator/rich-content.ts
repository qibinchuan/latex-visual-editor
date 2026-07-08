import { EditorState } from '@codemirror/state'
import { parser } from '../../lezer-latex/latex.mjs'
import { typesetNodeIntoElement } from '../../extensions/visual/utils/typeset-content'
import { generateTable, validateParsedTable, type ParsedTableData } from './utils'

export function renderTableCellContent(source: string, element: HTMLElement) {
  element.replaceChildren()
  const tree = parser.parse(source)
  const state = EditorState.create({ doc: source })
  let nested = false
  tree.iterate({
    enter(nodeRef) {
      if (nested) return false
      if (nodeRef.type.name !== 'TabularEnvironment') return
      try {
        const parsed = generateTable(nodeRef.node, state)
        if (!validateParsedTable(parsed)) return
        renderStaticTable(parsed, element)
        nested = true
        return false
      } catch {
        return
      }
    },
  })
  if (!nested) {
    typesetNodeIntoElement(tree.topNode, element, source.substring.bind(source))
  }
}

function renderStaticTable(parsed: ParsedTableData, element: HTMLElement) {
  const table = document.createElement('table')
  table.className = 'latex-visual-table latex-visual-nested-table'
  for (const row of parsed.table.rows) {
    const tr = table.insertRow()
    for (const cell of row.cells) {
      const td = tr.insertCell()
      td.colSpan = cell.multiColumn?.columnSpan ?? 1
      renderTableCellContent(cell.content, td)
    }
  }
  element.append(table)
}
