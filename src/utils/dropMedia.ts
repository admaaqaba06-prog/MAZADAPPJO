type MediaKind = 'cover' | 'gallery' | 'video';

const EXT_RE = /\.([a-z0-9]{2,4})(?:\?|$)/i;

/** Derive a download filename; defaults to .jpg for images with no discernible extension. */
export function mediaFileName(url: string, kind: MediaKind, idx = 0): string {
  const m = url.match(EXT_RE);
  const ext = m ? m[1].toLowerCase() : (kind === 'video' ? 'mp4' : 'jpg');
  if (kind === 'gallery') return `gallery-${idx + 1}.${ext}`;
  return `${kind}.${ext}`;
}

/** Copy an image to the clipboard. Returns false (never throws) if unsupported/blocked. */
export async function copyImageToClipboard(url: string): Promise<boolean> {
  try {
    if (!('clipboard' in navigator) || typeof (window as any).ClipboardItem === 'undefined') return false;
    const resp = await fetch(url);
    const blob = await resp.blob();
    // Safari/Chrome accept image/png; convert only if needed is out of scope — most covers are jpg/png.
    await (navigator.clipboard as any).write([new (window as any).ClipboardItem({ [blob.type || 'image/png']: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Download each media item via a temporary anchor (blob URL to force a save). */
export async function downloadMedia(
  items: { url: string; kind: MediaKind; idx?: number }[],
): Promise<void> {
  for (const it of items) {
    try {
      const resp = await fetch(it.url);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = mediaFileName(it.url, it.kind, it.idx ?? 0);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      /* skip a failed item; others still download */
    }
  }
}
