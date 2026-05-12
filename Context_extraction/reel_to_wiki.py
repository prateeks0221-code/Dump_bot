#!/usr/bin/env python3
"""
Reel → Wiki pipeline
Download reel → transcribe → extract title, wiki, links via Gemini

Output: Context_extraction/wiki/{token}_output.json
Token is mandatory (--token UUID) — ensures per-request file isolation.
"""

import os
import sys
import subprocess
import json
import argparse
from pathlib import Path
import whisper
from datetime import datetime

TEMP_DIR   = Path("./Context_extraction/temp_reels")
OUTPUT_DIR = Path("./Context_extraction/wiki")
WHISPER_MODEL = "base"


def setup_dirs():
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def download_reel(url: str) -> Path:
    print("[1/4] Downloading reel...")
    output_template = str(TEMP_DIR / "reel_%(id)s.%(ext)s")
    cmd = ["yt-dlp", url, "-o", output_template, "--format", "best", "--write-info-json"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Download failed: {result.stderr}")
    video_files = [f for f in TEMP_DIR.glob("reel_*.*") if f.suffix != ".json"]
    if not video_files:
        raise Exception("No video file found after download")
    return video_files[0]


def extract_audio(video_path: Path) -> Path:
    print("[2/4] Extracting audio...")
    audio_path = video_path.with_suffix(".mp3")
    cmd = ["ffmpeg", "-i", str(video_path), "-q:a", "0", "-map", "a", "-y", str(audio_path)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Audio extraction failed: {result.stderr}")
    return audio_path


def transcribe_audio(audio_path: Path) -> str:
    print(f"[3/4] Transcribing (model: {WHISPER_MODEL})...")
    model = whisper.load_model(WHISPER_MODEL)
    result = model.transcribe(str(audio_path))
    return result["text"]


def get_metadata(url: str) -> dict:
    info_files = list(TEMP_DIR.glob("reel_*.info.json"))
    if info_files:
        with open(info_files[0]) as f:
            data = json.load(f)
            return {
                "title":       data.get("title", "Unknown"),
                "uploader":    data.get("uploader", "Unknown"),
                "description": data.get("description", ""),
                "duration":    data.get("duration", 0),
                "thumbnail":   data.get("thumbnail", ""),
            }
    return {"title": "Unknown", "uploader": "Unknown", "thumbnail": ""}


def generate_output(transcript: str, metadata: dict, url: str) -> dict:
    """Single Gemini call → {title, wiki, links}"""
    print("[4/4] Generating title, wiki, and references via Gemini...")

    prompt = f"""You are analyzing a social media reel. Given the transcript and metadata below, return a JSON object with exactly these three keys:

1. "title": A single clear sentence (max 15 words) describing what this reel is about — the core topic or insight, not a YouTube-style title.

2. "wiki": A short paragraph (2-4 sentences) that expands the paradigm — what this concept actually is, why it matters, the key insight or mental model. Write like a dense knowledge note, not a summary.

3. "links": An array of objects with "label" and "url". Extract only real, usable references mentioned in the transcript — GitHub repos, specific tools, platforms, papers, websites. If no real URLs are mentioned, infer the most relevant resource URLs for the tools/frameworks discussed (e.g. if "LangChain" is mentioned, include {{"label": "LangChain", "url": "https://langchain.com"}}). Max 5 links.

Metadata:
- Title: {metadata.get('title', 'Unknown')}
- Creator: {metadata.get('uploader', 'Unknown')}
- Source: {url}

Transcript:
{transcript}

Return only valid JSON, no markdown fences."""

    try:
        from google import genai
        client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
        response = client.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=prompt,
        )
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(text)

    except Exception as e:
        print(f"Warning: Gemini call failed ({e}), using fallback")
        return {
            "title": metadata.get("title", "Unknown reel"),
            "wiki":  transcript[:400] + ("..." if len(transcript) > 400 else ""),
            "links": [],
        }


def save_output(data: dict, metadata: dict, token: str) -> Path:
    """Write output to token-scoped file — guarantees no cross-request contamination."""
    out_file = OUTPUT_DIR / f"{token}_output.json"
    data["thumbnail"] = metadata.get("thumbnail", "")
    with open(out_file, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n✓ Output saved: {out_file}")
    return out_file


def cleanup_temp():
    for f in TEMP_DIR.glob("*"):
        try:
            f.unlink()
        except Exception:
            pass
    print("✓ Cleaned temp files")


def main():
    parser = argparse.ArgumentParser(description="Reel → Wiki pipeline")
    parser.add_argument("url",    help="Reel URL to process")
    parser.add_argument("--token", required=True, help="UUID token for output file isolation")
    args = parser.parse_args()

    print(f"\n{'='*60}\nREEL → WIKI PIPELINE\n{'='*60}\nInput: {args.url}\nToken: {args.token}\n")

    try:
        setup_dirs()
        video_path = download_reel(args.url)
        audio_path = extract_audio(video_path)
        transcript = transcribe_audio(audio_path)
        metadata   = get_metadata(args.url)
        data       = generate_output(transcript, metadata, args.url)
        save_output(data, metadata, args.token)
        cleanup_temp()
        print(f"\n{'='*60}\n✓ PIPELINE COMPLETE\n{'='*60}\n")

    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
