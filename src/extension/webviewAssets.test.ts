import { describe, expect, it } from 'vitest'
import { cacheBustAssetUri } from './webviewAssets'

describe('cacheBustAssetUri', () => {
  it('produces a distinct asset URL for each webview refresh', () => {
    const uri = 'vscode-webview://extension/dist/webview.js'

    expect(cacheBustAssetUri(uri, 'first')).not.toBe(
      cacheBustAssetUri(uri, 'second')
    )
  })

  it('preserves an existing query string', () => {
    expect(cacheBustAssetUri('asset.js?existing=1', 'next')).toBe(
      'asset.js?existing=1&v=next'
    )
  })
})
