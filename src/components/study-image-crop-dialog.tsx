"use client";

import { Crop, LoaderCircle, RotateCcw, RotateCw, X } from "lucide-react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { useEffect, useRef, useState } from "react";

export type CroppedStudyImage = {
  height: number;
  src: string;
  width: number;
};

type AspectPreset = "original" | "square" | "landscape" | "wide";

const aspectPresets: Array<{ id: AspectPreset; label: string }> = [
  { id: "original", label: "Original" },
  { id: "square", label: "1:1" },
  { id: "landscape", label: "4:3" },
  { id: "wide", label: "16:9" },
];

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível abrir esta imagem para recorte."));
    image.src = src;
  });
}

function rotatedBounds(width: number, height: number, rotation: number) {
  const radians = rotation * Math.PI / 180;
  return {
    height: Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height),
    width: Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height),
  };
}

async function cropImage(src: string, area: Area, rotation: number): Promise<CroppedStudyImage> {
  const image = await loadImage(src);
  const bounds = rotatedBounds(image.naturalWidth, image.naturalHeight, rotation);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = Math.max(1, Math.round(bounds.width));
  sourceCanvas.height = Math.max(1, Math.round(bounds.height));
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) throw new Error("Não foi possível preparar o recorte.");

  sourceContext.translate(sourceCanvas.width / 2, sourceCanvas.height / 2);
  sourceContext.rotate(rotation * Math.PI / 180);
  sourceContext.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

  const outputWidth = Math.max(1, Math.round(area.width));
  const outputHeight = Math.max(1, Math.round(area.height));
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) throw new Error("Não foi possível finalizar o recorte.");

  outputContext.drawImage(
    sourceCanvas,
    Math.round(area.x),
    Math.round(area.y),
    outputWidth,
    outputHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const mimeType = src.startsWith("data:image/png") ? "image/png" : "image/jpeg";
  return {
    height: outputHeight,
    src: outputCanvas.toDataURL(mimeType, 0.9),
    width: outputWidth,
  };
}

function aspectValue(preset: AspectPreset, originalAspect: number) {
  if (preset === "square") return 1;
  if (preset === "landscape") return 4 / 3;
  if (preset === "wide") return 16 / 9;
  return originalAspect > 0 ? originalAspect : 4 / 3;
}

export function StudyImageCropDialog({
  alt,
  onApply,
  onClose,
  originalAspect,
  src,
}: {
  alt: string;
  onApply: (result: CroppedStudyImage) => void;
  onClose: () => void;
  originalAspect: number;
  src: string;
}) {
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>("original");
  const [busy, setBusy] = useState(false);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function applyCrop() {
    if (!cropPixels || busy) return;
    setBusy(true);
    setError(null);
    try {
      onApply(await cropImage(src, cropPixels, rotation));
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "Não foi possível recortar a imagem.");
      setBusy(false);
    }
  }

  return (
    <div
      className="study-image-crop-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section aria-labelledby="study-image-crop-title" aria-modal="true" className="study-image-crop-dialog" role="dialog">
        <header className="study-image-crop-header">
          <div>
            <Crop size={18} />
            <h2 id="study-image-crop-title">Recortar imagem</h2>
          </div>
          <button aria-label="Fechar recorte" disabled={busy} onClick={onClose} ref={closeRef} title="Fechar" type="button">
            <X size={18} />
          </button>
        </header>

        <div className="study-image-crop-stage">
          <Cropper
            aspect={aspectValue(aspectPreset, originalAspect)}
            crop={crop}
            image={src}
            mediaProps={{ alt }}
            onCropChange={setCrop}
            onCropComplete={(_, pixels) => setCropPixels(pixels)}
            onRotationChange={setRotation}
            onZoomChange={setZoom}
            rotation={rotation}
            showGrid
            zoom={zoom}
          />
        </div>

        <div className="study-image-crop-controls">
          <div className="study-image-aspect-control" role="group" aria-label="Proporção do recorte">
            {aspectPresets.map((preset) => (
              <button
                aria-pressed={aspectPreset === preset.id}
                className={aspectPreset === preset.id ? "active" : ""}
                key={preset.id}
                onClick={() => setAspectPreset(preset.id)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="study-image-crop-range">
            <span>Zoom</span>
            <input
              aria-label="Zoom do recorte"
              max="3"
              min="1"
              onChange={(event) => setZoom(Number(event.target.value))}
              step="0.05"
              type="range"
              value={zoom}
            />
            <output>{Math.round(zoom * 100)}%</output>
          </label>
          <div className="study-image-rotation-control">
            <button onClick={() => setRotation((value) => value - 90)} title="Girar 90 graus para a esquerda" type="button">
              <RotateCcw size={17} />
            </button>
            <span>{((rotation % 360) + 360) % 360} graus</span>
            <button onClick={() => setRotation((value) => value + 90)} title="Girar 90 graus para a direita" type="button">
              <RotateCw size={17} />
            </button>
          </div>
        </div>

        {error ? <p className="study-image-crop-error" role="alert">{error}</p> : null}

        <footer className="study-image-crop-footer">
          <button className="secondary" disabled={busy} onClick={onClose} type="button">Cancelar</button>
          <button disabled={!cropPixels || busy} onClick={() => void applyCrop()} type="button">
            {busy ? <LoaderCircle className="spin-icon" size={16} /> : <Crop size={16} />}
            Aplicar recorte
          </button>
        </footer>
      </section>
    </div>
  );
}
