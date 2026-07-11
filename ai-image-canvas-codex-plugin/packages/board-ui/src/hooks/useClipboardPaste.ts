import { useEffect, type RefObject } from 'react'
import { importPastedImage } from '../api'
import { useImageStore } from '../store/useImageStore'

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, [contenteditable="true"]'))
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read clipboard image'))
    reader.readAsDataURL(file)
  })
}

function readImageSize(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Failed to decode clipboard image'))
    image.src = dataUrl
  })
}

function fitImageSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return {
    w: Math.max(64, Math.round(width * scale)),
    h: Math.max(64, Math.round(height * scale))
  }
}

export function useClipboardPaste(enabled: boolean, canvasRef: RefObject<HTMLElement | null>) {
  const upsertShape = useImageStore((state) => state.upsertShape)

  useEffect(() => {
    if (!enabled) return

    const onPaste = async (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return

      const items = event.clipboardData?.items
      if (!items?.length) return

      for (const item of items) {
        if (!item.type.startsWith('image/')) continue

        const file = item.getAsFile()
        if (!file) continue

        event.preventDefault()

        try {
          const dataUrl = await fileToDataUrl(file)
          const natural = await readImageSize(dataUrl)
          const canvas = canvasRef.current
          const maxWidth = canvas ? Math.min(720, Math.max(240, canvas.clientWidth - 80)) : 480
          const maxHeight = canvas ? Math.min(720, Math.max(240, canvas.clientHeight - 80)) : 480
          const { w, h } = fitImageSize(natural.width, natural.height, maxWidth, maxHeight)
          const x = canvas ? Math.max(24, Math.round((canvas.clientWidth - w) / 2)) : 140
          const y = canvas ? Math.max(24, Math.round((canvas.clientHeight - h) / 2)) : 120
          const shape = await importPastedImage({
            dataUrl,
            title: file.name || 'Pasted image',
            x,
            y,
            w,
            h
          })
          upsertShape(shape)
        } catch (err) {
          console.error('[board-ui] failed to paste image', err)
        }
        break
      }
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [enabled, canvasRef, upsertShape])
}
