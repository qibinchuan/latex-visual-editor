import { chromium } from 'playwright'
import { downloadAndUnzipVSCode } from '@vscode/test-electron'
import { spawn } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const sourceFixture = path.join(root, 'examples', 'test-document.tex')
const code = await downloadAndUnzipVSCode('1.95.0')
const userDataDir = await mkdtemp(path.join(tmpdir(), 'latex-visual-editor-'))
const overleafKeybindingsEnabled = !process.argv.includes('--disabled')
const extensionsDir = path.join(userDataDir, 'extensions')
const fixture = path.join(userDataDir, 'keyboard-shortcuts.tex')
const sidebarExtensionDir = path.join(
  extensionsDir,
  'latex-visual-editor-tests.test-sidebar-1.0.0'
)
await copyFile(sourceFixture, fixture)
await mkdir(path.join(userDataDir, 'User'), { recursive: true })
await mkdir(sidebarExtensionDir, { recursive: true })
await writeFile(
  path.join(userDataDir, 'User', 'settings.json'),
  JSON.stringify({
    'latexVisualEditor.useOverleafKeybindings': overleafKeybindingsEnabled,
  })
)
await writeFile(
  path.join(sidebarExtensionDir, 'package.json'),
  JSON.stringify({
    name: 'test-sidebar',
    displayName: 'Test Sidebar',
    publisher: 'latex-visual-editor-tests',
    version: '1.0.0',
    engines: { vscode: '^1.95.0' },
    main: './extension.js',
    activationEvents: ['onCommand:testSidebar.open', 'onView:testSidebar.view'],
    contributes: {
      commands: [
        {
          command: 'testSidebar.open',
          title: 'Test Sidebar: Open',
        },
      ],
      viewsContainers: {
        activitybar: [
          {
            id: 'testSidebar',
            title: 'Test Sidebar',
            icon: 'icon.svg',
          },
        ],
      },
      views: {
        testSidebar: [
          {
            id: 'testSidebar.view',
            name: 'Copy Test',
            type: 'webview',
          },
        ],
      },
    },
  })
)
await writeFile(
  path.join(sidebarExtensionDir, 'extension.js'),
  String.raw`
const vscode = require('vscode')

exports.activate = context => {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('testSidebar.view', {
      resolveWebviewView(view) {
        view.webview.html =
          '<textarea aria-label="Sidebar copy source">sidebar-copy-marker</textarea>'
      },
    }),
    vscode.commands.registerCommand('testSidebar.open', () =>
      vscode.commands.executeCommand('workbench.view.extension.testSidebar')
    )
  )
}
`
)
await writeFile(
  path.join(sidebarExtensionDir, 'icon.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#888" d="M2 2h12v12H2z"/></svg>'
)
await writeFile(
  path.join(sidebarExtensionDir, 'README.md'),
  '# Test Sidebar'
)
const before = await readFile(fixture, 'utf8')
const codeEnvironment = { ...process.env }
delete codeEnvironment.ELECTRON_RUN_AS_NODE
let codeErrors = ''

const debuggingPort = 9333
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
    `--extensionDevelopmentPath=${sidebarExtensionDir}`,
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
    .filter({ hasText: 'keyboard-shortcuts.tex' })
  await sourceTab.waitFor({ state: 'visible', timeout: 30_000 })
  for (let attempt = 0; attempt < 60; attempt++) {
    await sourceTab.click().catch(() => {})
    const toggleVisual = window.locator(
      '.editor-actions [aria-label="Toggle Visual Editor"]'
    )
    if (await toggleVisual.count()) {
      await toggleVisual.first().evaluate(element => element.click()).catch(() => {})
    }
    await window.waitForTimeout(500)
    if (
      await window
        .locator('iframe.webview[src*="cyndigan.latex-visual-editor"]')
        .count()
    ) {
      break
    }
  }

  const webview = window.locator(
    'iframe.webview[src*="cyndigan.latex-visual-editor"]'
  )
  await webview.waitFor({ state: 'attached', timeout: 60_000 })
  let frame
  for (let attempt = 0; attempt < 120; attempt++) {
    frame = window.frames().find(item => item.name() === 'pending-frame')
    if (frame) break
    await window.waitForTimeout(250)
  }
  if (!frame) throw new Error('Visual editor content frame was not created')
  const editor = frame.locator('.cm-content')
  await editor.waitFor({ state: 'visible', timeout: 30_000 })
  const textLine = frame
    .locator('.cm-line')
    .filter({ hasText: 'The visual editor should display' })
  await textLine.click({ force: true })
  await editor.press('Home')
  await editor.press('Control+Shift+ArrowRight')
  await window.waitForTimeout(500)
  const sidebarWasVisible = await window.locator('.part.sidebar').isVisible()
  if (overleafKeybindingsEnabled) {
    await editor.press('Control+C')
    await window.waitForTimeout(250)
    await window.keyboard.press('Control+Shift+P')
    const commandInput = window.locator('.quick-input-widget input.input')
    await commandInput.waitFor({ state: 'visible', timeout: 10_000 })
    await commandInput.press('Control+V')
    if (!(await commandInput.inputValue()).includes('The')) {
      throw new Error('Ctrl+C did not copy the visual-editor selection')
    }

    // Keep the command palette open by using a query that matches commands.
    const workbenchCopyMarker = 'Save All'
    await commandInput.fill(workbenchCopyMarker)
    await commandInput.evaluate(input => input.select())
    await window.waitForTimeout(250)
    await commandInput.press('Control+C')
    await commandInput.fill('')
    await commandInput.press('Control+V')
    if ((await commandInput.inputValue()) !== workbenchCopyMarker) {
      throw new Error(
        'Visual-editor Ctrl+C keybinding intercepted copying from workbench input'
      )
    }

    await window.keyboard.press('Escape')
    await window
      .locator('.activitybar .action-label[aria-label="Test Sidebar"]')
      .click()

    let sidebarFrame
    for (let attempt = 0; attempt < 40; attempt++) {
      sidebarFrame = window
        .frames()
        .find(item => item.url().includes('latex-visual-editor-tests.test-sidebar'))
      if (sidebarFrame) break
      await window.waitForTimeout(250)
    }
    if (!sidebarFrame) {
      throw new Error(
        `Test sidebar webview was not created: ${JSON.stringify({
          frames: window.frames().map(item => item.url()),
          activityLabels: await window
            .locator('.activitybar [aria-label]')
            .evaluateAll(items => items.map(item => item.getAttribute('aria-label'))),
          sidebarText: await window.locator('.part.sidebar').innerText(),
          codeErrors,
        })}`
      )
    }
    sidebarFrame = sidebarFrame.childFrames()[0] ?? sidebarFrame

    const sidebarCopySource = sidebarFrame.getByLabel('Sidebar copy source')
    await sidebarCopySource.waitFor({ state: 'visible', timeout: 10_000 })
    await sidebarCopySource.click()
    await sidebarCopySource.evaluate(input => input.select())
    await window.waitForTimeout(250)
    await sidebarCopySource.press('Control+C')

    await window.keyboard.press('Control+Shift+P')
    await commandInput.waitFor({ state: 'visible', timeout: 10_000 })
    await commandInput.press('Control+V')
    if (!(await commandInput.inputValue()).includes('sidebar-copy-marker')) {
      throw new Error(
        'Visual-editor Ctrl+C keybinding intercepted copying from a sidebar webview'
      )
    }

    await window.keyboard.press('Escape')
    await window
      .locator('.activitybar .action-label[aria-label="Test Sidebar"]')
      .click()
    await textLine.click({ force: true })
    await editor.press('Home')
    await editor.press('Control+Shift+ArrowRight')
    await window.waitForTimeout(250)
  }
  await editor.press('Control+B')
  await window.waitForTimeout(500)
  const sidebarIsVisible = await window.locator('.part.sidebar').isVisible()
  if (!overleafKeybindingsEnabled) {
    if (sidebarIsVisible === sidebarWasVisible) {
      throw new Error('Ctrl+B did not use the default VS Code sidebar shortcut')
    }
    await window.keyboard.press('Control+S')
    await window.waitForTimeout(500)
    if ((await readFile(fixture, 'utf8')) !== before) {
      throw new Error('Ctrl+B applied Overleaf formatting while disabled')
    }
    console.log(
      'Disabled mode left Ctrl+B to the default VS Code sidebar shortcut.'
    )
  } else {
    if (sidebarIsVisible !== sidebarWasVisible) {
      throw new Error('Ctrl+B also toggled the VS Code sidebar')
    }
    await window.keyboard.press('Control+S')
    await window.waitForTimeout(500)

    await editor.press('Control+Z')
    await window.keyboard.press('Control+S')
    await window.waitForTimeout(500)
    if ((await readFile(fixture, 'utf8')) !== before) {
      throw new Error('Ctrl+Z did not undo visual-editor formatting')
    }

    await editor.press('Control+Y')
    await window.keyboard.press('Control+S')
    await window.waitForTimeout(500)

    await editor.press('Control+F')
    await frame.locator('.cm-search').waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    await editor.press('Escape')

    await window.waitForTimeout(500)
    const after = await readFile(fixture, 'utf8')
    if (after === before || !after.includes(String.raw`\textbf{The}`)) {
      throw new Error('Ctrl+B did not apply bold formatting')
    }

    console.log(
      'Visual-editor copy, formatting, undo, redo, and find shortcuts passed without toggling the VS Code sidebar.'
    )
  }

  const richTextHeading = frame
    .locator('.cm-line')
    .filter({ hasText: 'Rich text' })
    .first()
  await richTextHeading.click({ force: true })
  await editor.press('Control+Shift+[')
  await frame.locator('.cm-foldPlaceholder').first().waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  await editor.press('Control+Shift+]')
  await frame.locator('.cm-foldPlaceholder').first().waitFor({
    state: 'detached',
    timeout: 10_000,
  })

  await editor.press('Control+K')
  await editor.press('Control+0')
  await frame.locator('.cm-foldPlaceholder').first().waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  await editor.press('Control+K')
  await editor.press('Control+J')
  await frame.locator('.cm-foldPlaceholder').first().waitFor({
    state: 'detached',
    timeout: 10_000,
  })

  const environmentContent = frame
    .locator('.cm-line')
    .filter({ hasText: 'First numbered item.' })
    .first()
  await environmentContent.click({ force: true })
  await editor.press('Control+K')
  await editor.press('Control+L')
  await frame.locator('.cm-foldPlaceholder').first().waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  await editor.press('Control+K')
  await editor.press('Control+L')
  await frame.locator('.cm-foldPlaceholder').first().waitFor({
    state: 'detached',
    timeout: 10_000,
  })

  const remainingFoldingChords = [
    ['Control+[', 'fold recursively'],
    ['Control+]', 'unfold recursively'],
    ['Control+Shift+L', 'toggle fold recursively'],
    ['Control+/', 'fold all block comments'],
    ['Control+8', 'fold all regions'],
    ['Control+9', 'unfold all regions'],
    ['Control+-', 'fold all except selected'],
    ['Control+=', 'unfold all except selected'],
    ...Array.from({ length: 7 }, (_, index) => [
      `Control+${index + 1}`,
      `fold level ${index + 1}`,
    ]),
    ['Control+,', 'create folding range from selection'],
    ['Control+.', 'remove manual folding ranges'],
  ]
  for (const [secondKey, label] of remainingFoldingChords) {
    await editor.press('Control+K')
    await editor.press(secondKey)
    await window.waitForTimeout(100)
    if (await window.getByText(/not a command/i).count()) {
      throw new Error(`The ${label} shortcut was not registered`)
    }
    await editor.press('Control+K')
    await editor.press('Control+J')
  }
  console.log(
    'All standard visual-editor folding shortcuts passed.'
  )
} finally {
  await browser.close()
  codeProcess.kill()
}
