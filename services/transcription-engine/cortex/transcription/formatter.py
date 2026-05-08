from __future__ import annotations

from typing import List

from cortex.transcription.models import OutputFormat, Segment, Transcript


class TranscriptFormatter:
    """Format Transcript into various output formats."""

    def format(self, transcript: Transcript, fmt: OutputFormat = OutputFormat.MARKDOWN) -> str:
        formatters = {
            OutputFormat.MARKDOWN: self._to_markdown,
            OutputFormat.JSON: lambda t: t.to_json(),
            OutputFormat.SRT: self._to_srt,
            OutputFormat.VTT: self._to_vtt,
            OutputFormat.PLAIN: self._to_plain,
        }
        return formatters[fmt](transcript)

    def _to_markdown(self, transcript: Transcript) -> str:
        meta = transcript.metadata
        lines = [
            "# Transcript",
            "",
            "## Metadata",
            "",
            f"- **Source:** {meta.source_file}",
            f"- **Duration:** {self._fmt_duration(meta.duration_seconds)}",
            f"- **Language:** {meta.language} ({meta.language_probability:.0%})",
            f"- **Model:** faster-whisper ({meta.model_size})",
            f"- **Segments:** {meta.num_segments}",
            "",
            "---",
            "",
            "## Content",
            "",
        ]

        paragraphs = self._group_paragraphs(transcript.segments)
        for para in paragraphs:
            ts = self._fmt_timestamp(para[0].start)
            lines.append(f"**{ts}**")
            lines.append("")
            text = " ".join(s.text for s in para)
            lines.append(text)
            lines.append("")

        return "\n".join(lines)

    def _to_srt(self, transcript: Transcript) -> str:
        lines = []
        for i, seg in enumerate(transcript.segments, 1):
            lines.append(str(i))
            lines.append(f"{self._srt_ts(seg.start)} --> {self._srt_ts(seg.end)}")
            lines.append(seg.text)
            lines.append("")
        return "\n".join(lines)

    def _to_vtt(self, transcript: Transcript) -> str:
        lines = ["WEBVTT", ""]
        for seg in transcript.segments:
            lines.append(f"{self._vtt_ts(seg.start)} --> {self._vtt_ts(seg.end)}")
            lines.append(seg.text)
            lines.append("")
        return "\n".join(lines)

    def _to_plain(self, transcript: Transcript) -> str:
        return transcript.text

    def _group_paragraphs(
        self, segments: List[Segment], gap_threshold: float = 2.0
    ) -> List[List[Segment]]:
        if not segments:
            return []
        paragraphs: List[List[Segment]] = [[segments[0]]]
        for i in range(1, len(segments)):
            gap = segments[i].start - segments[i - 1].end
            if gap > gap_threshold:
                paragraphs.append([])
            paragraphs[-1].append(segments[i])
        return paragraphs

    @staticmethod
    def _fmt_timestamp(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        if h > 0:
            return f"[{h:02d}:{m:02d}:{s:02d}]"
        return f"[{m:02d}:{s:02d}]"

    @staticmethod
    def _fmt_duration(seconds: float) -> str:
        m, s = divmod(int(seconds), 60)
        h, m = divmod(m, 60)
        if h > 0:
            return f"{h}h {m}m {s}s"
        return f"{m}m {s}s"

    @staticmethod
    def _srt_ts(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int((seconds % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    @staticmethod
    def _vtt_ts(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int((seconds % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"
