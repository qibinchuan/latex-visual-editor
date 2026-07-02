import { execFile } from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import * as vscode from 'vscode'

const execFileAsync = promisify(execFile)
const output = vscode.window.createOutputChannel('LaTeX Visual Editor Build')

type WorkshopRecipe = {
  name: string
  tools: string[]
}

type WorkshopTool = {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

type SyncTeXRecord = {
  page: number
  x: number
  y: number
  indicator: boolean
}

type SyncTeXRangeRecord = SyncTeXRecord & {
  h: number
  v: number
  W: number
  H: number
}

type SyncTeXIndicator = 'none' | 'circle' | 'rectangle'

export type ReverseSyncTeXData = {
  page: number
  pos: [number, number]
  textBeforeSelection: string
  textAfterSelection: string
}

export type ReverseSyncTeXRecord = {
  input: string
  line: number
  column: number
}

type WorkshopRuntime = {
  file: {
    toUri?: (file: string) => vscode.Uri
  }
  viewer: {
    locate(
      pdf: string | vscode.Uri,
      record: SyncTeXRecord | SyncTeXRangeRecord[]
    ): Promise<void>
  }
  log: (tag: string) => {
    showStatus(): void
    refreshStatus(
      icon: string,
      color: string,
      message?: string
    ): void
  }
  locate: {
    synctex: {
      toTeX(
        data: ReverseSyncTeXData,
        pdfUri: vscode.Uri | string
      ): Promise<void>
      components?: {
        computeToTeX(
          data: ReverseSyncTeXData,
          pdfUri: vscode.Uri
        ): Promise<ReverseSyncTeXRecord | undefined>
      }
    }
  }
}

/**
 * Builds the visual document with LaTeX Workshop's configured recipe and tools
 * without requiring a VS Code TextEditor.
 */
export async function buildWithLatexWorkshop(
  document: vscode.TextDocument
): Promise<void> {
  if (!(await document.save())) {
    throw new Error(`Could not save ${document.fileName} before building.`)
  }

  const rootFile = await findRootFile(document)
  const runtime = await getWorkshopRuntime()
  const configuration = vscode.workspace.getConfiguration(
    'latex-workshop',
    document.uri
  )
  const recipes = configuration.get<WorkshopRecipe[]>('latex.recipes', [])
  const tools = configuration.get<WorkshopTool[]>('latex.tools', [])
  const configuredRecipe = configuration.get<string>(
    'latex.recipe.default',
    'first'
  )
  const recipe =
    configuredRecipe !== 'first' && configuredRecipe !== 'lastUsed'
      ? recipes.find(candidate => candidate.name === configuredRecipe)
      : recipes[0]
  if (!recipe) throw new Error('LaTeX Workshop has no configured recipes.')

  setBuildStatus(
    runtime,
    'sync~spin',
    `Building ${path.basename(rootFile)}`
  )
  output.appendLine(`[Build] Recipe: ${recipe.name}`)
  try {
    for (const toolName of recipe.tools) {
      const tool = tools.find(candidate => candidate.name === toolName)
      if (!tool) {
        throw new Error(
          `LaTeX Workshop recipe "${recipe.name}" references unknown tool "${toolName}".`
        )
      }
      await runTool(tool, rootFile, document.uri)
    }
    setBuildStatus(runtime, 'check', 'Build succeeded.')
  } catch (error) {
    setBuildStatus(
      runtime,
      'x',
      error instanceof Error ? error.message : 'Build failed.'
    )
    throw error
  }
}

/**
 * Runs forward SyncTeX from the visual cursor and opens the resulting PDF in
 * LaTeX Workshop's PDF custom editor, without opening a source editor.
 */
export async function syncTeXWithLatexWorkshop(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<void> {
  const rootFile = await findRootFile(document)
  const configuration = vscode.workspace.getConfiguration(
    'latex-workshop',
    document.uri
  )
  const pdfFile = getPdfPath(rootFile, configuration)
  const command = configuration.get<string>('synctex.path', 'synctex')
  const indicator = configuration.get<SyncTeXIndicator>(
    'synctex.indicator',
    'rectangle'
  )
  const column =
    indicator === 'rectangle' ? 0 : position.character + 1

  // Running SyncTeX first verifies that the requested visual position exists
  // in the generated synchronization data before opening the viewer.
  const { stdout } = await execFileAsync(
    command,
    [
      'view',
      '-i',
      `${position.line + 1}:${column}:${document.fileName}`,
      '-o',
      pdfFile,
    ],
    { cwd: path.dirname(pdfFile) }
  )
  const record =
    indicator === 'rectangle'
      ? parseSyncTeXRangeRecords(stdout)
      : parseSyncTeXRecord(stdout, indicator !== 'none')
  const runtime = await getWorkshopRuntime()
  const viewerPdf = runtime.file.toUri
    ? runtime.file.toUri(pdfFile)
    : pdfFile
  await runtime.viewer.locate(viewerPdf, record)
}

/**
 * Routes Workshop reverse SyncTeX records directly to an open visual editor,
 * before Workshop opens a temporary source TextEditor.
 */
export async function installReverseSyncTeXHandler(
  handler: (
    record: ReverseSyncTeXRecord,
    data: ReverseSyncTeXData
  ) => Promise<boolean>
): Promise<vscode.Disposable> {
  const runtime = await getWorkshopRuntime()
  const synctex = runtime.locate.synctex
  const original = synctex.toTeX.bind(synctex)

  synctex.toTeX = async (data, pdfUri) => {
    const normalizedPdfUri =
      typeof pdfUri === 'string' ? vscode.Uri.file(pdfUri) : pdfUri
    const record = synctex.components?.computeToTeX
      ? await synctex.components.computeToTeX(data, normalizedPdfUri)
      : await computeReverseSyncTeX(data, normalizedPdfUri)
    if (record && (await handler(record, data))) return
    await original(data, pdfUri)
  }

  return new vscode.Disposable(() => {
    synctex.toTeX = original
  })
}

async function getWorkshopRuntime(): Promise<WorkshopRuntime> {
  const extension =
    vscode.extensions.getExtension('James-Yu.latex-workshop') ??
    vscode.extensions.getExtension('james-yu.latex-workshop')
  if (!extension) throw new Error('LaTeX Workshop is not installed.')
  await extension.activate()

  for (const module of Object.values(require.cache ?? {})) {
    const filename = module?.filename.replaceAll('\\', '/').toLowerCase()
    if (
      !filename?.includes('james-yu.latex-workshop-') ||
      !filename.endsWith('/out/src/lw.js')
    ) {
      continue
    }
    const runtime = (module?.exports as { lw?: unknown } | undefined)?.lw as
      | {
          file?: { toUri?: unknown }
          viewer?: { locate?: unknown }
          log?: unknown
          locate?: {
            synctex?: {
              toTeX?: unknown
              components?: { computeToTeX?: unknown }
            }
          }
        }
      | undefined
    if (
      runtime?.file &&
      typeof runtime.viewer?.locate === 'function' &&
      typeof runtime.log === 'function' &&
      typeof runtime.locate?.synctex?.toTeX === 'function'
    ) {
      return runtime as WorkshopRuntime
    }
  }
  throw new Error('The installed LaTeX Workshop version is incompatible.')
}

async function computeReverseSyncTeX(
  data: ReverseSyncTeXData,
  pdfUri: vscode.Uri
): Promise<ReverseSyncTeXRecord | undefined> {
  const configuration = vscode.workspace.getConfiguration(
    'latex-workshop',
    pdfUri
  )
  const command = configuration.get<string>('synctex.path', 'synctex')
  const { stdout } = await execFileAsync(
    command,
    [
      'edit',
      '-o',
      `${data.page}:${data.pos[0]}:${data.pos[1]}:${pdfUri.fsPath}`,
    ],
    { cwd: path.dirname(pdfUri.fsPath) }
  )
  const input = readSyncTeXString(stdout, 'Input')
  const line = readSyncTeXNumber(stdout, 'Line')
  const column = readSyncTeXNumber(stdout, 'Column')
  if (!input) return undefined
  return { input: path.resolve(input), line, column }
}

function setBuildStatus(
  runtime: WorkshopRuntime,
  icon: string,
  message: string
): void {
  const logger = runtime.log('VisualEditor')
  logger.showStatus()
  logger.refreshStatus(icon, 'statusBar.foreground', message)
}

async function runTool(
  tool: WorkshopTool,
  rootFile: string,
  resource: vscode.Uri
): Promise<void> {
  const configuration = vscode.workspace.getConfiguration(
    'latex-workshop',
    resource
  )
  const values = placeholderValues(rootFile, configuration)
  const command = replacePlaceholders(tool.command, values)
  const args = (tool.args ?? []).map(argument =>
    replacePlaceholders(argument, values)
  )
  const environment = Object.fromEntries(
    Object.entries(tool.env ?? {}).map(([key, value]) => [
      key,
      replacePlaceholders(value, values),
    ])
  )

  output.appendLine(`[Build] ${command} ${args.join(' ')}`)
  try {
    const result = await execFileAsync(command, args, {
      cwd: path.dirname(rootFile),
      env: { ...process.env, ...environment },
      maxBuffer: 16 * 1024 * 1024,
    })
    if (result.stdout) output.append(result.stdout)
    if (result.stderr) output.append(result.stderr)
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string }
    if (failure.stdout) output.append(failure.stdout)
    if (failure.stderr) output.append(failure.stderr)
    throw new Error(`${tool.name} failed: ${failure.message}`)
  }
}

async function findRootFile(document: vscode.TextDocument): Promise<string> {
  const match = document
    .getText()
    .match(/^\s*%\s*!\s*TEX\s+root\s*=\s*(.+?)\s*$/im)
  if (!match) return document.fileName

  const candidate = path.resolve(path.dirname(document.fileName), match[1])
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(candidate))
    return candidate
  } catch {
    throw new Error(`LaTeX root file does not exist: ${candidate}`)
  }
}

function getPdfPath(
  rootFile: string,
  configuration: vscode.WorkspaceConfiguration
): string {
  const values = placeholderValues(rootFile, configuration)
  const outputDirectory = replacePlaceholders(
    configuration.get<string>('latex.outDir', '%DIR%'),
    values
  )
  return path.join(
    path.resolve(path.dirname(rootFile), outputDirectory),
    `${path.parse(rootFile).name}.pdf`
  )
}

function placeholderValues(
  rootFile: string,
  configuration: vscode.WorkspaceConfiguration
): Record<string, string> {
  const directory = path.dirname(rootFile)
  const parsed = path.parse(rootFile)
  const workspace =
    vscode.workspace.getWorkspaceFolder(vscode.Uri.file(rootFile))?.uri.fsPath ??
    directory
  const baseValues: Record<string, string> = {
    '%DOC%': rootFile,
    '%DOCFILE%': parsed.base,
    '%DOCFILE_EXT%': parsed.base,
    '%DOCFILE_NAME%': parsed.name,
    '%DOC_EXT%': parsed.ext,
    '%DIR%': directory,
    '%WORKSPACE_FOLDER%': workspace,
    '%RELATIVE_DOC%': path.relative(workspace, rootFile),
    '%TMPDIR%': os.tmpdir(),
  }
  baseValues['%OUTDIR%'] = replacePlaceholders(
    configuration.get<string>('latex.outDir', '%DIR%'),
    baseValues
  )
  return baseValues
}

function replacePlaceholders(
  value: string,
  replacements: Record<string, string>
): string {
  return Object.entries(replacements).reduce(
    (result, [placeholder, replacement]) =>
      result.replaceAll(placeholder, replacement),
    value
  )
}

function parseSyncTeXRecord(
  value: string,
  indicator = true
): SyncTeXRecord {
  return {
    page: readSyncTeXNumber(value, 'Page'),
    x: readSyncTeXNumber(value, 'x'),
    y: readSyncTeXNumber(value, 'y'),
    indicator,
  }
}

function parseSyncTeXRangeRecords(value: string): SyncTeXRangeRecord[] {
  const records: SyncTeXRangeRecord[] = []
  let current: SyncTeXRangeRecord | undefined
  let started = false

  for (const line of value.split(/\r?\n/)) {
    if (line.includes('SyncTeX result begin')) {
      started = true
      continue
    }
    if (line.includes('SyncTeX result end')) break
    if (!started) continue

    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator)
    const parsed = Number(line.slice(separator + 1).trim())

    if (key === 'Output') {
      current = {
        page: 0,
        x: 0,
        y: 0,
        h: 0,
        v: 0,
        W: 0,
        H: 0,
        indicator: true,
      }
      records.push(current)
    } else if (
      current &&
      Number.isFinite(parsed) &&
      (key === 'Page' ||
        key === 'x' ||
        key === 'y' ||
        key === 'h' ||
        key === 'v' ||
        key === 'W' ||
        key === 'H')
    ) {
      if (key === 'Page') {
        current.page = parsed
      } else {
        current[key] = parsed
      }
    }
  }

  if (records.length === 0) {
    throw new Error('SyncTeX did not return a valid rectangular range.')
  }
  return records
}

function readSyncTeXNumber(value: string, key: string): number {
  const match = value.match(new RegExp(`^${key}:([^\\r\\n]+)`, 'm'))
  const number = Number(match?.[1])
  if (!Number.isFinite(number)) {
    throw new Error(`SyncTeX did not return a valid ${key} coordinate.`)
  }
  return number
}

function readSyncTeXString(value: string, key: string): string | undefined {
  return value
    .match(new RegExp(`^${key}:([^\\r\\n]+)`, 'm'))?.[1]
    ?.trim()
}
