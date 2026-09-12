import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * TTS placeholder endpoint.
 *
 * In production, this would:
 *   1. Check if a pre-generated audio file exists for this text
 *   2. If not, call a TTS API (Google Cloud TTS, Amazon Polly, etc.)
 *   3. Cache the result and return the audio stream
 *
 * For now, returns a JSON response indicating TTS is not yet connected.
 * The client should fall back to the Web Speech API.
 */
export async function GET(request: NextRequest) {
  const text = request.nextUrl.searchParams.get("text") ?? "";
  const lang = request.nextUrl.searchParams.get("lang") ?? "ja";
  const speed = Number(request.nextUrl.searchParams.get("speed") ?? "1.0");

  return NextResponse.json({
    success: true,
    data: {
      text,
      lang,
      speed,
      status: "tts_not_configured",
      fallback: "web_speech_api",
      message: "TTS endpoint placeholder. Client should use Web Speech API: speechSynthesis.speak(new SpeechSynthesisUtterance(text))",
    },
  });
}
