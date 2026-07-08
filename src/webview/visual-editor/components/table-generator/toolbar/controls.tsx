import type { ReactNode } from 'react'
import { useTableSelection } from '../contexts/selection-context'
import { useTableUI } from '../contexts/ui-context'

export type MenuItem = {
  id?: string
  label?: string
  icon?: string
  active?: boolean
  disabled?: boolean
  divider?: boolean
  mutates?: boolean
  run?: () => void
}

export function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="material-symbols" aria-hidden="true">
      {children}
    </span>
  )
}

export function ToolbarButton({
  id,
  icon,
  label,
  run,
  disabled = false,
  active = false,
  mutates = true,
}: {
  id: string
  icon: string
  label: string
  run(): void
  disabled?: boolean
  active?: boolean
  mutates?: boolean
}) {
  const { dispatchCommand } = useTableSelection()
  return (
    <button
      type="button"
      id={id}
      className={[
        'table-generator-toolbar-button',
        active && 'active',
      ].filter(Boolean).join(' ')}
      title={label}
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onMouseDown={event => event.preventDefault()}
      onClick={() => {
        if (disabled) return
        mutates ? dispatchCommand(run) : run()
      }}
    >
      <Icon>{icon}</Icon>
    </button>
  )
}

export function ToolbarMenu({
  id,
  label,
  items,
  icon,
  disabled = false,
  compact = false,
}: {
  id: string
  label: string
  items: MenuItem[]
  icon?: string
  disabled?: boolean
  compact?: boolean
}) {
  const { openMenu, toggleMenu, closeMenu } = useTableUI()
  const { dispatchCommand } = useTableSelection()
  const open = openMenu === id
  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className={[
          compact
            ? 'table-generator-toolbar-button'
            : 'table-generator-toolbar-dropdown-toggle',
          open && 'active',
        ].filter(Boolean).join(' ')}
        onMouseDown={event => event.preventDefault()}
        onClick={event => {
          event.stopPropagation()
          if (!disabled) toggleMenu(id)
        }}
      >
        {icon && <Icon>{icon}</Icon>}
        {!compact && <span>{label}</span>}
        <Icon>arrow_drop_down</Icon>
      </button>
      {open && (
        <div
          className="table-generator-toolbar-dropdown-popover table-generator-toolbar-dropdown-menu"
          role="menu"
          style={{ left: 0, top: 'calc(100% + 4px)' }}
        >
          {items.map((item, index) =>
            item.divider ? (
              <hr key={`divider-${index}`} />
            ) : (
              <button
                key={item.id}
                type="button"
                id={item.id}
                disabled={item.disabled}
                role="menuitem"
                aria-disabled={item.disabled}
                className={
                  item.active ? 'ol-cm-toolbar-dropdown-option-active' : ''
                }
                onMouseDown={event => event.preventDefault()}
                onClick={event => {
                  event.stopPropagation()
                  if (!item.disabled && item.run) {
                    closeMenu()
                    item.mutates === false
                      ? item.run()
                      : dispatchCommand(item.run)
                  }
                }}
              >
                {item.icon && <Icon>{item.icon}</Icon>}
                <span className="table-generator-button-label">
                  {item.label}
                </span>
              </button>
            )
          )}
        </div>
      )}
    </span>
  )
}
