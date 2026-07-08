import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

type Dialog = 'help' | 'width' | null
type UIContextValue = {
  openMenu: string | null
  dialog: Dialog
  toggleMenu(id: string): void
  closeMenu(): void
  setDialog(dialog: Dialog): void
}

const UIContext = createContext<UIContextValue | null>(null)

export function TableUIProvider({ children }: PropsWithChildren) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [dialog, setDialogState] = useState<Dialog>(null)
  const closeMenu = useCallback(() => setOpenMenu(null), [])
  const toggleMenu = useCallback(
    (id: string) => setOpenMenu(current => (current === id ? null : id)),
    []
  )
  const setDialog = useCallback((next: Dialog) => {
    setOpenMenu(null)
    setDialogState(next)
  }, [])
  const value = useMemo(
    () => ({ openMenu, dialog, toggleMenu, closeMenu, setDialog }),
    [openMenu, dialog, toggleMenu, closeMenu, setDialog]
  )
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useTableUI() {
  const value = useContext(UIContext)
  if (!value) throw new Error('TableUIProvider is missing')
  return value
}
