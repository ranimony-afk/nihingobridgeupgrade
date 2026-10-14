"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export type KanjiStrokeOrderStatus =
  | "loading"
  | "available"
  | "unavailable"
  | "error";

export type KanjiStrokeOrderResolution =
  | { status: "available"; imageSource: string }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * Keep service SVG out of the HTML DOM. It is displayed as an encoded image
 * URL, and unexpected markup fails closed instead of being injected inline.
 */
export function getKanjiStrokeOrderImageSource(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const svg = value.trim();
  if (!/^<svg\b[\s\S]*<\/svg>\s*$/i.test(svg)) return null;
  if (
    /<(?:script|foreignObject|iframe|object|embed)\b/i.test(svg) ||
    /\son[a-z][\w:-]*\s*=/i.test(svg) ||
    /\b(?:href|src)\s*=/i.test(svg) ||
    /url\s*\(/i.test(svg)
  ) {
    return null;
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveKanjiStrokeOrderResponse(
  response: Pick<Response, "ok" | "status">,
  payload: unknown,
  requestedCharacter: string
): KanjiStrokeOrderResolution {
  const body = isRecord(payload) ? payload : null;
  const error = body && isRecord(body.error) ? body.error : null;

  if (response.status === 404 && error?.code === "STROKE_ORDER_UNAVAILABLE") {
    return { status: "unavailable" };
  }
  if (!response.ok || !body || body.success !== true) {
    return { status: "error" };
  }
  if (body.character !== requestedCharacter) {
    return { status: "error" };
  }

  const imageSource = getKanjiStrokeOrderImageSource(body.diagramSvg);
  return imageSource
    ? { status: "available", imageSource }
    : { status: "error" };
}

export function KanjiStrokeOrderPanelView({
  character,
  status,
  imageSource,
  onRetry,
  onImageError,
}: {
  character: string;
  status: KanjiStrokeOrderStatus;
  imageSource?: string;
  onRetry: () => void;
  onImageError: () => void;
}) {
  const hasImage = status === "available" && Boolean(imageSource);
  const hasRenderError = status === "error" || (status === "available" && !imageSource);

  return (
    <section
      aria-labelledby="kanji-stroke-order-heading"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100"
    >
      <div className="mb-5">
        <h2
          id="kanji-stroke-order-heading"
          className="text-base font-bold text-slate-900"
        >
          Stroke Order
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          KanjiVG stroke paths are shown separately from the structural component
          decomposition below. The current renderer does not display stroke numbers.
        </p>
      </div>

      {status === "loading" && (
        <p role="status" aria-live="polite" className="text-sm text-slate-500">
          Loading the stroke-order diagram for {character}…
        </p>
      )}

      {hasImage && imageSource && (
        <figure className="flex flex-col items-center gap-2">
          <Image
            unoptimized
            src={imageSource}
            alt={`KanjiVG stroke-order diagram for ${character}`}
            width={109}
            height={109}
            onError={onImageError}
            className="h-40 w-40 object-contain"
          />
          <figcaption className="text-xs text-slate-500">
            Stroke paths for {character}; numeric stroke labels are not available in
            the current renderer.
          </figcaption>
        </figure>
      )}

      {status === "unavailable" && (
        <p role="status" className="text-sm text-slate-600">
          No usable KanjiVG stroke-order asset is available for {character}.
        </p>
      )}

      {hasRenderError && (
        <div role="alert" className="space-y-3">
          <p className="text-sm text-amber-800">
            The stroke-order diagram for {character} could not be rendered or loaded.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            Retry stroke-order diagram
          </button>
        </div>
      )}
    </section>
  );
}

interface KanjiStrokeOrderLoadResult {
  character: string;
  status: KanjiStrokeOrderStatus;
  imageSource?: string;
}

export function KanjiStrokeOrderPanel({ character }: { character: string }) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [result, setResult] = useState<KanjiStrokeOrderLoadResult>({
    character,
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = `/api/kanji/${encodeURIComponent(character)}/stroke-order`;

    fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;

        const resolved = resolveKanjiStrokeOrderResponse(
          response,
          payload,
          character
        );
        setResult({ character, ...resolved });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ character, status: "error" });
        }
      });

    return () => controller.abort();
  }, [character, requestVersion]);

  const visibleResult: KanjiStrokeOrderLoadResult =
    result.character === character
      ? result
      : { character, status: "loading" };

  const retry = () => {
    setResult({ character, status: "loading" });
    setRequestVersion((current) => current + 1);
  };

  const handleImageError = () => {
    setResult({ character, status: "error" });
  };

  return (
    <KanjiStrokeOrderPanelView
      character={character}
      status={visibleResult.status}
      imageSource={visibleResult.imageSource}
      onRetry={retry}
      onImageError={handleImageError}
    />
  );
}
