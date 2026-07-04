// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { EditorState } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import { parser } from '../../../lezer-latex/latex.mjs'
import {
  generateTable,
  validateParsedTable,
} from '../../../components/table-generator/utils'
import { TableData } from '../../../components/table-generator/table-model'
import { TabularWidget, renderTableCellContent } from './tabular'
import { tableDecorationRange } from '../atomic-decorations'

describe('renderTableCellContent', () => {
  it('renders rich LaTeX formatting instead of raw commands', () => {
    const element = document.createElement('div')

    renderTableCellContent(
      String.raw`\textbf{Bold} and \textit{italic} with \underline{underline}`,
      element
    )

    expect(element.textContent).toBe('Bold and italic with underline')
    expect(element.querySelector('b')?.textContent).toBe('Bold')
    expect(element.querySelector('i')?.textContent).toBe('italic')
    expect(
      element.querySelector('.ol-cm-command-underline')?.textContent
    ).toBe('underline')
  })

  it('renders nested tabular content as a table', () => {
    const element = document.createElement('div')

    renderTableCellContent(
      String.raw`\begin{tabular}{l}Inner A\\Inner B\end{tabular}`,
      element
    )

    const table = element.querySelector('table')
    expect(table).not.toBeNull()
    expect(table?.querySelectorAll('tr')).toHaveLength(2)
    expect(element.textContent).toContain('Inner A')
    expect(element.textContent).toContain('Inner B')
  })
})

describe('TabularWidget', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  const createWidget = () => {
    const dispatches: unknown[] = []
    const widget = new TabularWidget(
      {
        table: new TableData(
          [
            {
              cells: [
                { content: 'first', from: 0, to: 5 },
                { content: 'second', from: 8, to: 14 },
              ],
              borderTop: 0,
              borderBottom: 0,
            },
          ],
          [
            {
              alignment: 'left',
              borderLeft: 0,
              borderRight: 0,
              content: 'l',
              cellSpacingLeft: '',
              cellSpacingRight: '',
              customCellDefinition: '',
              isParagraphColumn: false,
            },
            {
              alignment: 'right',
              borderLeft: 0,
              borderRight: 0,
              content: 'r',
              cellSpacingLeft: '',
              cellSpacingRight: '',
              customCellDefinition: '',
              isParagraphColumn: false,
            },
          ]
        ),
        cellPositions: [[{ from: 0, to: 5 }, { from: 8, to: 14 }]],
        cellSeparators: [[{ from: 5, to: 8 }]],
        rowPositions: [{ from: 0, to: 17, hlines: [] }],
        rowSeparators: [],
        specification: { from: 20, to: 22 },
      } as never,
      { from: 0, to: 17 } as never,
      'first & second',
      null,
      false
    )
    const dom = widget.toDOM({
      dispatch(spec?: unknown) {
        dispatches.push(spec)
      },
      requestMeasure() {},
      state: {
        readOnly: false,
        doc: { length: 22 },
        selection: { main: { anchor: 0, head: 0 } },
        sliceDoc: () => 'lr',
      },
    } as never)
    document.body.append(dom)
    expect(dom.classList.contains('table-generator')).toBe(true)
    return {
      dom,
      cells: dom.querySelectorAll<HTMLTableCellElement>(
        '.table-generator-cell'
      ),
      dispatches,
    }
  }

  it('inserts a caret and keeps table options visible on a single click', () => {
    const { dom, cells } = createWidget()
    cells[0].dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 10,
      })
    )
    cells[0].dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        clientX: 10,
      })
    )

    const input = cells[0].querySelector('textarea')
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)
    expect(input?.selectionStart).toBe('first'.length)
    expect(cells[0].classList.contains('selected')).toBe(true)
    expect(
      dom.querySelector<HTMLElement>('.table-generator-floating-toolbar')
        ?.hidden
    ).toBe(false)
    expect(
      dom.querySelector('#table-generator-borders-dropdown')
    ).not.toBeNull()
  })

  it('selects cells by dragging without native text selection', async () => {
    const { cells } = createWidget()
    cells[0].dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 0,
        clientY: 0,
      })
    )
    cells[1].dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 1,
        clientX: 10,
        clientY: 0,
      })
    )
    cells[1].dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, button: 0 })
    )
    expect(cells[0].classList.contains('selected')).toBe(true)
    expect(cells[1].classList.contains('selected')).toBe(true)
    expect(cells[0].classList.contains('selection-edge-left')).toBe(true)
    expect(cells[1].classList.contains('selection-edge-right')).toBe(true)
    expect(document.getSelection()?.rangeCount).toBe(0)

    document.body.tabIndex = -1
    document.body.focus()
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        ctrlKey: true,
        key: 'a',
      })
    )
    expect([...cells].every(cell => cell.classList.contains('selected'))).toBe(
      true
    )

    document.body.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0 })
    )
    document.body.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, button: 0 })
    )
    await new Promise(resolve => window.setTimeout(resolve))
    expect([...cells].some(cell => cell.classList.contains('selected'))).toBe(
      false
    )
  })

  it('deletes selected cells structurally', () => {
    const { cells, dispatches } = createWidget()
    cells[1].dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 0,
        clientY: 0,
      })
    )
    cells[1].dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 1,
        clientX: 10,
        clientY: 0,
      })
    )
    cells[1].dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, button: 0 })
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))

    expect(dispatches.at(-1)).toEqual({
      changes: [
        { from: 5, to: 14, insert: '' },
        { from: 20, to: 22, insert: 'l' },
      ],
      userEvent: 'delete',
    })
  })

  it('deletes a column from the example document and keeps a valid table', () => {
    const source = readFileSync('examples/test-document.tex', 'utf8')
    const state = EditorState.create({ doc: source })
    let tabularNode: SyntaxNode | undefined
    parser.parse(source).iterate({
      enter(node) {
        if (node.type.name === 'TabularEnvironment' && !tabularNode) {
          tabularNode = node.node
        }
      },
    })
    const parsed = generateTable(tabularNode!, state)
    let transaction: { changes: unknown; userEvent: string } | undefined
    const widget = new TabularWidget(
      parsed,
      tabularNode!,
      source.slice(tabularNode!.from, tabularNode!.to),
      null,
      false
    )
    const dom = widget.toDOM({
      dispatch(spec: typeof transaction) {
        if (spec?.changes) transaction = spec
      },
      requestMeasure() {},
      state,
    } as never)
    document.body.append(dom)
    const secondColumnSelector = dom.querySelector<HTMLTableCellElement>(
      '[data-column-selector="1"]'
    )!

    secondColumnSelector.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
      })
    )
    dom
      .querySelector<HTMLButtonElement>(
        '#table-generator-remove-column-row'
      )!
      .click()

    expect(Array.isArray(transaction!.changes)).toBe(true)
    const nextState = state.update({
      changes: transaction!.changes as never,
    }).state
    const nextSource = nextState.doc.toString()
    let nextTabularNode: SyntaxNode | undefined
    parser.parse(nextSource).iterate({
      enter(node) {
        if (node.type.name === 'TabularEnvironment' && !nextTabularNode) {
          nextTabularNode = node.node
        }
      },
    })
    const nextParsed = generateTable(nextTabularNode!, nextState)

    expect(validateParsedTable(nextParsed)).toBe(true)
    expect(nextParsed.table.rows).toHaveLength(4)
    expect(nextParsed.table.columns).toHaveLength(1)
    expect(
      nextState.sliceDoc(
        nextParsed.specification.from,
        nextParsed.specification.to
      )
    ).toBe('l')
    expect(nextParsed.table.rows[1].cells.map(cell => cell.content.trim())).toEqual([
      'Headings',
    ])
  })

  it.each(['above', 'below'] as const)(
    'renders a rich caption %s the visual table',
    position => {
      const caption = String.raw`\caption{A \textbf{bold} caption}`
      const tabular = String.raw`\begin{tabular}{l}
A\\
\end{tabular}`
      const source = String.raw`\begin{table}
${position === 'above' ? `${caption}\n${tabular}` : `${tabular}\n${caption}`}
\end{table}`
      const state = EditorState.create({ doc: source })
      let tableNode: SyntaxNode | undefined
      let tabularNode: SyntaxNode | undefined
      parser.parse(source).iterate({
        enter(node) {
          if (node.type.name === 'TableEnvironment' && !tableNode) {
            tableNode = node.node
          }
          if (node.type.name === 'TabularEnvironment' && !tabularNode) {
            tabularNode = node.node
          }
        },
      })
      const widget = new TabularWidget(
        generateTable(tabularNode!, state),
        tabularNode!,
        source,
        tableNode!,
        true
      )
      const dom = widget.toDOM({
        dispatch() {},
        requestMeasure() {},
        state,
      } as never)
      document.body.append(dom)

      const captionElement = dom.querySelector('.table-generator-caption')
      const tableElement = dom.querySelector('.table-generator-table')
      expect(captionElement?.textContent).toBe('A bold caption')
      expect(captionElement?.querySelector('b')?.textContent).toBe('bold')
      const children = [...dom.children]
      expect(
        children.indexOf(captionElement!) < children.indexOf(tableElement!)
      ).toBe(position === 'above')
      widget.destroy(dom)
    }
  )

  it('opens the table toolbar menu popups', () => {
    const { dom, cells } = createWidget()
    cells[0].dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0 })
    )
    cells[0].dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 1,
        clientX: 10,
      })
    )
    cells[0].dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        clientX: 10,
      })
    )

    dom
      .querySelector<HTMLButtonElement>(
        '#table-generator-borders-dropdown'
      )!
      .click()
    expect(
      dom.querySelector('#table-generator-borders-fully-bordered')
    ).not.toBeNull()

    dom
      .querySelector<HTMLButtonElement>('#table-generator-add-dropdown')!
      .click()
    expect(
      dom.querySelector('#table-generator-insert-column-left')
    ).not.toBeNull()
    expect(dom.querySelector('#table-generator-insert-row-below')).not.toBeNull()
  })

  it('parses tabularx with a width argument and X columns', () => {
    const source = String.raw`\begin{tabularx}{\linewidth}{@{}XXXXX@{}}
\toprule
Dataset & Year & Fault generation & Modalities & Notes\\
\midrule
CWRU & 1999 & Artificial bearing faults & Vibration & Widely cited dataset\\
\bottomrule
\end{tabularx}`
    const state = EditorState.create({ doc: source })
    let tabularNode: SyntaxNode | undefined
    parser.parse(source).iterate({
      enter(node) {
        if (node.type.name === 'TabularEnvironment' && !tabularNode) {
          tabularNode = node.node
        }
      },
    })

    const parsed = generateTable(tabularNode!, state)

    expect(validateParsedTable(parsed)).toBe(true)
    expect(parsed.table.columns).toHaveLength(5)
    expect(state.sliceDoc(parsed.specification.from, parsed.specification.to)).toBe(
      '@{}XXXXX@{}'
    )
  })

  it('parses an inserted empty column as a valid table', () => {
    const source = String.raw`\begin{tabular}{clc}
    A  && B \\
    C  && D \\
  \end{tabular}`
    const state = EditorState.create({ doc: source })
    let tabularNode: SyntaxNode | undefined
    parser.parse(source).iterate({
      enter(node) {
        if (node.type.name === 'TabularEnvironment' && !tabularNode) {
          tabularNode = node.node
        }
      },
    })

    const parsed = generateTable(tabularNode!, state)
    expect(validateParsedTable(parsed)).toBe(true)
    expect(parsed.table.columns).toHaveLength(3)
    expect(parsed.table.rows).toHaveLength(2)
  })

  it('hides table-only wrapper commands with the visual table', () => {
    const source = String.raw`\renewcommand{\arraystretch}{1.4}
\resizebox{\textwidth}{!}{
\begin{tabular}{ll}
A & B\\
\end{tabular}
}`
    const state = EditorState.create({ doc: source })
    let tabularNode: SyntaxNode | undefined
    parser.parse(source).iterate({
      enter(node) {
        if (node.type.name === 'TabularEnvironment' && !tabularNode) {
          tabularNode = node.node
        }
      },
    })

    expect(tableDecorationRange(tabularNode!, state, null)).toEqual({
      from: 0,
      to: source.length,
    })
  })
})
