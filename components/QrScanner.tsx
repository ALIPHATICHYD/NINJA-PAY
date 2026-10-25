'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ImageIcon, X } from 'lucide-react'
import decodeQR from 'qr/decode.js'
import { parseScannedRecipient, type ScannedRecipient } from '@/lib/scanned-recipient'

type Props = { onScan: (recipient: ScannedRecipient) => void; onClose: () => void }

// Chrome on Android has a built-in QR reader; elsewhere frames go to the `qr` package's decoder.
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type DetectorClass = new (options: { formats: string[] }) => Detector

const SCAN_EVERY_MS = 250

async function readCode(canvas: HTMLCanvasElement, detector: Detector | null): Promise<string | null> {
  if (detector) {
    const codes = await detector.detect(canvas).catch(() => [])
    return codes[0]?.rawValue ?? null
  }
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  try {
    return decodeQR({ data, width, height })
  } catch {
    return null
  }
}

/**
 * Scans a recipient from a QR code with the phone's camera, or from a photo when the camera
 * can't be opened (some wallet browsers don't allow it). Only codes NinjaPay can send to are
 * accepted: addresses, .inj names, payment-request links and wallet URIs.
 */
export function QrScanner({ onScan, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const done = useRef(false)

  const detector = (): Detector | null => {
    const Barcode = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector
    try { return Barcode ? new Barcode({ formats: ['qr_code'] }) : null } catch { return null }
  }

  const accept = (text: string | null): boolean => {
    if (!text || done.current) return false
    const recipient = parseScannedRecipient(text)
    if (!recipient) {
      setProblem("That QR code isn't an Injective address, a .inj name or a NinjaPay payment link.")
      return false
    }
    done.current = true
    onScan(recipient)
    return true
  }

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    let stopped = false
    const reader = detector()

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This browser can't open the camera here. Scan a photo of the code instead.")
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      } catch {
        setProblem("The camera couldn't be opened. Allow camera access, or scan a photo of the code instead.")
        return
      }
      if (stopped || !video.current) { stream.getTracks().forEach(t => t.stop()); return }
      video.current.srcObject = stream
      await video.current.play().catch(() => undefined)
      setCameraOn(true)
      canvas.current = document.createElement('canvas')
      let busy = false
      timer = setInterval(async () => {
        const v = video.current
        const c = canvas.current
        if (busy || !v || !c || v.readyState < 2 || done.current) return
        busy = true
        c.width = v.videoWidth
        c.height = v.videoHeight
        c.getContext('2d', { willReadFrequently: true })?.drawImage(v, 0, 0, c.width, c.height)
        accept(await readCode(c, reader))
        busy = false
      }, SCAN_EVERY_MS)
    }
    void start()

    return () => {
      stopped = true
      clearInterval(timer)
      stream?.getTracks().forEach(t => t.stop())
    }
    // Runs once per open scanner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scanPhoto = async (file: File | undefined) => {
    if (!file) return
    setProblem(null)
    try {
      const bitmap = await createImageBitmap(file)
      // Large photos are scaled down: the decoder only needs the code's modules to be a few pixels wide.
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bitmap.width * scale)
      c.height = Math.round(bitmap.height * scale)
      c.getContext('2d', { willReadFrequently: true })?.drawImage(bitmap, 0, 0, c.width, c.height)
      const text = await readCode(c, detector())
      if (!text) setProblem("No QR code found in that photo. Try again closer, with the whole code in view.")
      else accept(text)
    } catch {
      setProblem("That photo couldn't be read. Try another one.")
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="qr-scan-title" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="qr-scan-title" style={{ fontSize: '16px', fontWeight: 600 }}>Scan recipient</h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Close scanner" style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#000', aspectRatio: '1 / 1' }}>
          <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraOn ? 'block' : 'none' }} />
          {!cameraOn && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Camera size={28} />
            </div>
          )}
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Point the camera at an inj1… or 0x… address, a .inj name, or a NinjaPay payment link.
        </p>
        {problem && <p role="alert" style={{ fontSize: '12px', color: 'var(--error)' }}>{problem}</p>}

        <label className="btn-secondary" style={{ justifyContent: 'center', cursor: 'pointer' }}>
          <ImageIcon size={15} /> Scan a photo instead
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => void scanPhoto(e.target.files?.[0])} />
        </label>
      </div>
    </div>
  )
}
