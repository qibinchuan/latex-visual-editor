export function cacheBustAssetUri(uri: string, key: string): string {
  const separator = uri.includes('?') ? '&' : '?'
  return `${uri}${separator}v=${encodeURIComponent(key)}`
}
