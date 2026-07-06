import {
  BorderTheme,
  insertColumn,
  insertRow,
  mergeCells,
  moveCaption,
  removeCaption,
  removeColumnWidths,
  removeRowsOrColumns,
  removeTable,
  setAlignment,
  setBorders,
  unmergeCells,
} from '../table-commands'
import { useTableContext } from '../contexts/table-context'
import { useTableSelection } from '../contexts/selection-context'
import { useTableUI } from '../contexts/ui-context'
import { ToolbarButton, ToolbarMenu, type MenuItem } from './controls'

export function Toolbar() {
  const { view, parsed, positions, environment, directTableChild } =
    useTableContext()
  const { selection } = useTableSelection()
  const { setDialog } = useTableUI()
  const model = parsed.table
  if (!selection || view.state.readOnly) return null

  const captionAbove =
    Boolean(environment?.caption) &&
    environment!.caption!.from < positions.tabular.from
  const captionBelow =
    Boolean(environment?.caption) &&
    environment!.caption!.from > positions.tabular.to
  const captionLabel = captionAbove
    ? 'Caption above'
    : captionBelow
      ? 'Caption below'
      : 'No caption'
  const borderTheme = model.getBorderTheme()
  const borderLabel =
    borderTheme === BorderTheme.FULLY_BORDERED
      ? 'All borders'
      : borderTheme === BorderTheme.NO_BORDERS
        ? 'No borders'
        : borderTheme === BorderTheme.BOOKTABS
          ? 'Booktabs'
          : 'Custom borders'
  const fullColumn = selection.isAnyColumnSelected(model)
  const merged = selection.isMergedCellSelected(model)
  const { minX } = selection.normalized()
  const currentAlignment = merged
    ? model.getCell(selection.from.row, selection.from.cell).multiColumn
        ?.columns.specification[0]?.alignment
    : model.columns[minX]?.alignment
  const alignmentIcon =
    currentAlignment === 'center'
      ? 'format_align_center'
      : currentAlignment === 'right'
        ? 'format_align_right'
        : currentAlignment === 'paragraph'
          ? 'format_align_justify'
          : 'format_align_left'

  const captionItems: MenuItem[] = [
    {
      id: 'table-generator-caption-none',
      label: 'No caption',
      active: !environment?.caption,
      run: () => removeCaption(view, environment),
    },
    {
      id: 'table-generator-caption-above',
      label: 'Caption above',
      active: captionAbove,
      run: () => moveCaption(view, positions, 'above', environment),
    },
    {
      id: 'table-generator-caption-below',
      label: 'Caption below',
      active: captionBelow,
      run: () => moveCaption(view, positions, 'below', environment),
    },
  ]
  const borderItems: MenuItem[] = [
    {
      id: 'table-generator-borders-fully-bordered',
      label: 'All borders',
      icon: 'border_all',
      active: borderTheme === BorderTheme.FULLY_BORDERED,
      run: () => setBorders(view, BorderTheme.FULLY_BORDERED, positions, model),
    },
    {
      id: 'table-generator-borders-no-borders',
      label: 'No borders',
      icon: 'border_clear',
      active: borderTheme === BorderTheme.NO_BORDERS,
      run: () => setBorders(view, BorderTheme.NO_BORDERS, positions, model),
    },
    {
      id: 'table-generator-borders-booktabs',
      label: 'Booktabs',
      icon: 'border_top',
      active: borderTheme === BorderTheme.BOOKTABS,
      run: () => setBorders(view, BorderTheme.BOOKTABS, positions, model),
    },
  ]
  const alignmentItems: MenuItem[] = [
    {
      id: 'table-generator-align-left',
      label: 'Left',
      icon: 'format_align_left',
      active: currentAlignment === 'left',
      run: () => setAlignment(view, selection, 'left', positions, model),
    },
    {
      id: 'table-generator-align-center',
      label: 'Center',
      icon: 'format_align_center',
      active: currentAlignment === 'center',
      run: () => setAlignment(view, selection, 'center', positions, model),
    },
    {
      id: 'table-generator-align-right',
      label: 'Right',
      icon: 'format_align_right',
      active: currentAlignment === 'right',
      run: () => setAlignment(view, selection, 'right', positions, model),
    },
    ...(selection.isOnlyFixedWidthColumns(model) && !merged
      ? [{
          id: 'table-generator-align-justify',
          label: 'Justify',
          icon: 'format_align_justify',
          active: currentAlignment === 'paragraph',
          run: () =>
            setAlignment(view, selection, 'paragraph', positions, model),
        }]
      : []),
  ]
  const widthItems: MenuItem[] = [
    {
      id: 'table-generator-unwrap-text',
      label: 'Stretch width to text',
      active: selection.isOnlyNonFixedWidthColumns(model),
      run: () => removeColumnWidths(view, selection, positions, model),
    },
    {
      id: 'table-generator-wrap-text',
      label: selection.isOnlyFixedWidthColumns(model)
        ? 'Fixed width'
        : 'Fixed width (wrap text)',
      active: selection.isOnlyFixedWidthColumns(model),
      mutates: false,
      run: () => setDialog('width'),
    },
    ...(selection.isOnlyFixedWidthColumns(model)
      ? [
          { divider: true },
          {
            id: 'table-generator-resize',
            label: 'Set column width',
            mutates: false,
            run: () => setDialog('width'),
          },
        ]
      : []),
  ]
  const insertItems: MenuItem[] = [
    {
      id: 'table-generator-insert-column-left',
      label: `Insert ${
        selection.maximumCellWidth(model) === 1
          ? 'column'
          : `${selection.maximumCellWidth(model)} columns`
      } left`,
      run: () => insertColumn(view, selection, positions, false, model),
    },
    {
      id: 'table-generator-insert-column-right',
      label: `Insert ${
        selection.maximumCellWidth(model) === 1
          ? 'column'
          : `${selection.maximumCellWidth(model)} columns`
      } right`,
      run: () => insertColumn(view, selection, positions, true, model),
    },
    { divider: true },
    {
      id: 'table-generator-insert-row-above',
      label: `Insert ${
        selection.height() === 1 ? 'row' : `${selection.height()} rows`
      } above`,
      run: () => insertRow(view, selection, positions, false, model),
    },
    {
      id: 'table-generator-insert-row-below',
      label: `Insert ${
        selection.height() === 1 ? 'row' : `${selection.height()} rows`
      } below`,
      run: () => insertRow(view, selection, positions, true, model),
    },
  ]

  return (
    <div className="table-generator-floating-toolbar">
      <div className="table-generator-button-group">
        <ToolbarMenu
          id="table-generator-caption-dropdown"
          label={captionLabel}
          items={captionItems}
          disabled={!environment || !directTableChild}
        />
        <ToolbarMenu
          id="table-generator-borders-dropdown"
          label={borderLabel}
          items={borderItems}
        />
      </div>
      <div className="table-generator-button-group">
        <ToolbarMenu
          id="table-generator-align-dropdown"
          label="Alignment"
          icon={alignmentIcon}
          compact
          disabled={!fullColumn && !merged}
          items={alignmentItems}
        />
        <ToolbarMenu
          id="format_text_wrap"
          label="Adjust column width"
          icon={
            selection.isOnlyFixedWidthColumns(model) ? 'format_text_wrap' : 'width'
          }
          compact
          disabled={!fullColumn}
          items={widthItems}
        />
        <ToolbarButton
          id="table-generator-merge-cells"
          icon="cell_merge"
          label={merged ? 'Unmerge cells' : 'Merge cells'}
          disabled={!merged && !selection.isMergeableCells(model)}
          active={merged}
          run={() =>
            merged
              ? unmergeCells(view, selection, model)
              : mergeCells(view, selection, model)
          }
        />
        <ToolbarButton
          id="table-generator-remove-column-row"
          icon="delete"
          label="Delete row or column"
          disabled={
            !selection.isAnyRowSelected(model) &&
            !selection.isAnyColumnSelected(model)
          }
          run={() => removeRowsOrColumns(view, selection, positions, model)}
        />
        <ToolbarMenu
          id="table-generator-add-dropdown"
          label="Insert"
          icon="add"
          compact
          items={insertItems}
        />
      </div>
      <div className="table-generator-button-group">
        <ToolbarButton
          id="table-generator-remove-table"
          icon="delete_forever"
          label="Delete table"
          run={() => removeTable(view, positions, environment)}
        />
        <ToolbarButton
          id="table-generator-show-help"
          icon="help"
          label="Help"
          mutates={false}
          run={() => setDialog('help')}
        />
      </div>
    </div>
  )
}
