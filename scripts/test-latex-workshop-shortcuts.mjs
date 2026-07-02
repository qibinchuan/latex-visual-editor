import { chromium } from 'playwright'
import { downloadAndUnzipVSCode } from '@vscode/test-electron'
import JSZip from 'jszip'
import { spawn } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const code = await downloadAndUnzipVSCode('1.95.0')
const userDataDir = await mkdtemp(path.join(tmpdir(), 'latex-workshop-shortcuts-'))
const extensionsDir = path.join(userDataDir, 'extensions')
const workspaceDir = path.join(userDataDir, 'workspace')
const fixture = path.join(workspaceDir, 'workshop-shortcuts.tex')
const pdf = path.join(workspaceDir, 'workshop-shortcuts.pdf')

await mkdir(path.join(userDataDir, 'User'), { recursive: true })
await mkdir(extensionsDir, { recursive: true })
await mkdir(workspaceDir, { recursive: true })
await writeFile(
  path.join(userDataDir, 'User', 'settings.json'),
  JSON.stringify({
    'extensions.autoCheckUpdates': false,
    'extensions.autoUpdate': false,
    'latex-workshop.message.log.show': true,
    'latex-workshop.view.pdf.viewer': 'tab',
    'latex-workshop.view.pdf.tab.editorGroup': 'right',
    'latex-workshop.view.pdf.internal.synctex.keybinding': 'double-click',
    'latex-workshop.synctex.indicator': 'rectangle',
  })
)
await writeFile(
  fixture,
  String.raw`\documentclass{article}
\begin{document}
First page.
\newpage
Sync this line from the visual editor.
\end{document}
`
)

await installLatexWorkshop()

const codeEnvironment = { ...process.env }
delete codeEnvironment.ELECTRON_RUN_AS_NODE
let codeErrors = ''
const debuggingPort = 9334
const codeProcess = spawn(
  code,
  [
    `--remote-debugging-port=${debuggingPort}`,
    '--new-window',
    '--verbose',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-updates',
    '--disable-workspace-trust',
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${extensionsDir}`,
    `--extensionDevelopmentPath=${root}`,
    fixture,
  ],
  { env: codeEnvironment, stdio: ['ignore', 'ignore', 'pipe'] }
)
codeProcess.stderr.on('data', chunk => {
  codeErrors += chunk
})

let browser
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${debuggingPort}`
    )
    break
  } catch {
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}
if (!browser) throw new Error('Could not connect Playwright to VS Code')

try {
  let window
  for (let attempt = 0; attempt < 120; attempt++) {
    window = browser.contexts().flatMap(context => context.pages())[0]
    if (window) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!window) {
    throw new Error(
      `VS Code did not create a workbench page (exit ${codeProcess.exitCode}): ${codeErrors}`
    )
  }
  await window.locator('.monaco-workbench').waitFor({ timeout: 60_000 })

  const sourceTab = window
    .locator('.tabs-container .tab')
    .filter({ hasText: 'workshop-shortcuts.tex' })
  await sourceTab.waitFor({ state: 'visible', timeout: 30_000 })
  await window
    .locator('.editor-actions [aria-label*="Build LaTeX project"]')
    .waitFor({ state: 'visible', timeout: 60_000 })
  const sourceEditor = window.locator('.editor-instance .monaco-editor').last()
  await sourceEditor.locator('.view-lines').click()
  await window.keyboard.press('Control+Alt+B')
  await waitForFile(pdf, 90_000)
  const sourceBuildTime = (await stat(pdf)).mtimeMs
  await window.keyboard.press('Control+Home')
  await window.keyboard.press('Control+Alt+J')
  const pdfTab = window
    .locator('.tabs-container .tab')
    .filter({ hasText: 'workshop-shortcuts.pdf' })
  await pdfTab.waitFor({ state: 'visible', timeout: 30_000 })
  const initialPdfTabCount = await pdfTab.count()
  const pdfFrame = await findFrameWithSelector(window, '#pageNumber')
  if (!pdfFrame) throw new Error('LaTeX Workshop PDF viewer was not created')
  if (
    !(await waitForInputValue(
      pdfFrame.locator('#pageNumber'),
      '1',
      30_000
    ))
  ) {
    throw new Error('Source SyncTeX did not initialize the PDF viewer on page 1')
  }

  await sourceTab.click()
  const toggleVisual = window.locator(
    '.editor-actions [aria-label="Toggle Visual Editor"]'
  )
  await toggleVisual.first().click()

  const webview = window.locator(
    'iframe.webview[src*="cyndigan.latex-visual-editor"]'
  )
  await webview.waitFor({ state: 'attached', timeout: 60_000 })
  let frame = await findFrameWithSelector(window, '.cm-content')
  if (!frame) throw new Error('Visual editor content frame was not created')

  const line = frame
    .locator('.cm-line')
    .filter({ hasText: 'Sync this line' })
  await line.click({ force: true })
  await line.press('End')
  await line.press('Space')
  await window.evaluate(() => {
    const target = document.querySelector(
      'iframe.webview[src*="cyndigan.latex-visual-editor"]'
    )
    window.__visualEditorWasUnavailable = false
    window.__visualEditorObserver = new MutationObserver(() => {
      if (!target?.isConnected) window.__visualEditorWasUnavailable = true
    })
    window.__visualEditorObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  })
  const outputWasVisible = await window.locator('.output-view').isVisible()
  await line.press('Control+Alt+B')
  const buildSpinnerWorked = await window
    .locator('.part.statusbar .codicon-sync.codicon-modifier-spin')
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  const visualBuildWorked = await waitForFileNewer(
    pdf,
    sourceBuildTime,
    30_000
  )
  const visualEditorStayedOpen = await window.evaluate(() => {
    window.__visualEditorObserver?.disconnect()
    return !window.__visualEditorWasUnavailable
  })
  const outputWasOpened =
    !outputWasVisible && (await window.locator('.output-view').isVisible())

  await frame
    .locator('.cm-line')
    .filter({ hasText: 'Sync this line' })
    .click({ force: true })
  await pdfFrame.evaluate(() => {
    window.__rectangleSyncTeXIndicatorSeen = false
    window.__circleSyncTeXIndicatorSeen = false
    window.__syncTeXIndicatorObserver = new MutationObserver(() => {
      if (document.querySelector('.synctex-indicator-rect')) {
        window.__rectangleSyncTeXIndicatorSeen = true
      }
      if (document.querySelector('#synctex-indicator.show')) {
        window.__circleSyncTeXIndicatorSeen = true
      }
    })
    window.__syncTeXIndicatorObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    })
  })
  await frame.locator('.cm-content').press('Control+Alt+J')

  const pdfViewerWasReused = (await pdfTab.count()) === initialPdfTabCount
  const visualSyncTeXLocated = await waitForInputValue(
    pdfFrame.locator('#pageNumber'),
    '2',
    30_000
  )
  const visualSyncTeXUsedRectangle = await pdfFrame.evaluate(() => {
    window.__syncTeXIndicatorObserver?.disconnect()
    return (
      window.__rectangleSyncTeXIndicatorSeen &&
      !window.__circleSyncTeXIndicatorSeen
    )
  })
  const pdfText = pdfFrame
    .locator('.textLayer span')
    .filter({ hasText: 'Sync this line' })
    .first()
  await pdfText.waitFor({ state: 'visible', timeout: 30_000 })
  const initialVisualEditorCount = await countFramesWithSelector(
    window,
    '.cm-content'
  )
  await window.evaluate(() => {
    window.__reverseSyncSourceEditorSeen = false
    window.__reverseSyncSourceObserver = new MutationObserver(() => {
      if (document.querySelector('.editor-instance .monaco-editor')) {
        window.__reverseSyncSourceEditorSeen = true
      }
    })
    window.__reverseSyncSourceObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  })
  await pdfText.dblclick()
  const reverseSyncFrame = await findFrameWithSelector(
    window,
    '.cm-reverse-synctex-highlight',
    40
  )
  const reverseSyncHighlightedText = reverseSyncFrame !== undefined
  if (reverseSyncFrame) frame = reverseSyncFrame
  await window.waitForTimeout(700)
  const reverseSyncHighlightExpired =
    (await countFramesWithSelector(
      window,
      '.cm-reverse-synctex-highlight'
    )) === 0
  const reverseSyncReusedVisualEditor = await waitForCondition(
    async () =>
      (await countFramesWithSelector(window, '.cm-content')) ===
      initialVisualEditorCount,
    30_000
  )
  const reverseSyncAvoidedSourceEditor = await window.evaluate(() => {
    window.__reverseSyncSourceObserver?.disconnect()
    return !window.__reverseSyncSourceEditorSeen
  })

  const failures = [
    !visualBuildWorked && 'Ctrl+Alt+B did not rebuild the PDF',
    !buildSpinnerWorked && 'Ctrl+Alt+B did not show a spinning status icon',
    outputWasOpened && 'Ctrl+Alt+B opened the Output panel',
    !visualEditorStayedOpen && 'Ctrl+Alt+B switched away from visual mode',
    !pdfViewerWasReused && 'Ctrl+Alt+J opened a duplicate PDF tab',
    !visualSyncTeXLocated && 'Ctrl+Alt+J did not move the PDF viewer to page 2',
    !visualSyncTeXUsedRectangle &&
      'Ctrl+Alt+J did not use the configured rectangle SyncTeX indicator',
    !reverseSyncReusedVisualEditor &&
      'PDF reverse SyncTeX opened a duplicate visual editor',
    !reverseSyncAvoidedSourceEditor &&
      'PDF reverse SyncTeX temporarily opened a source editor',
    !reverseSyncHighlightedText &&
      'PDF reverse SyncTeX did not temporarily highlight the target line',
    !reverseSyncHighlightExpired &&
      'PDF reverse SyncTeX highlight outlived LaTeX Workshop duration',
  ].filter(Boolean)
  if (failures.length > 0) {
    throw new Error(`Visual LaTeX Workshop shortcuts failed: ${failures.join('; ')}`)
  }
  console.log('LaTeX Workshop shortcuts work from the visual editor.')
} finally {
  await browser.close()
  codeProcess.kill()
}

async function installLatexWorkshop() {
  const version = '10.0.0'
  const response = await fetch(
    `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/James-Yu/vsextensions/latex-workshop/${version}/vspackage`
  )
  if (!response.ok) {
    throw new Error(
      `Could not download LaTeX Workshop ${version}: ${response.status}`
    )
  }
  const archive = await JSZip.loadAsync(await response.arrayBuffer())
  const destination = path.join(
    extensionsDir,
    `james-yu.latex-workshop-${version}`
  )
  await Promise.all(
    Object.values(archive.files)
      .filter(entry => !entry.dir && entry.name.startsWith('extension/'))
      .map(async entry => {
        const relativePath = entry.name.slice('extension/'.length)
        const outputPath = path.join(destination, relativePath)
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, await entry.async('nodebuffer'))
      })
  )
}

async function waitForFile(file, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      await access(file)
      return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  const files = await readdir(path.dirname(file))
  throw new Error(
    `Ctrl+Alt+B did not build ${path.basename(file)}. Files: ${files.join(', ')}`
  )
}

async function waitForFileNewer(file, previousTime, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if ((await stat(file)).mtimeMs > previousTime) return true
    } catch {
      // The build may briefly replace the output file.
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

async function findFrameWithSelector(window, selector, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const frame of window.frames()) {
      if (await frame.locator(selector).count().catch(() => 0)) return frame
    }
    await window.waitForTimeout(250)
  }
}

async function waitForInputValue(locator, expected, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await locator.inputValue().catch(() => undefined)) === expected) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return false
}

async function waitForCondition(predicate, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return false
}

async function countFramesWithSelector(window, selector) {
  let count = 0
  for (const frame of window.frames()) {
    if (await frame.locator(selector).count().catch(() => 0)) count += 1
  }
  return count
}
