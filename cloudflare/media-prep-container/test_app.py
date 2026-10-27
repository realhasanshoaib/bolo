import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import app


class MediaUploadTests(unittest.TestCase):
    def prepare(self, upload):
        workdirs = []

        def download(workdir: Path, youtube_url: str) -> Path:
            workdirs.append(workdir)
            source = workdir / "source.mp3"
            source.write_bytes(b"audio")
            return source

        def chunks(source: Path, directory: Path, chunk_seconds: int) -> list[Path]:
            directory.mkdir()
            paths = [directory / f"{index:05d}.mp3" for index in range(8)]
            for path in paths:
                path.write_bytes(b"chunk audio")
            return paths

        with (
            patch.object(app, "read_youtube_duration", return_value=360),
            patch.object(app, "download_audio", side_effect=download),
            patch.object(app, "ffprobe_duration", return_value=360),
            patch.object(app, "chunk_audio", side_effect=chunks),
            patch.object(app, "upload_chunk", side_effect=upload),
        ):
            try:
                return app.prepare_media({"entryId": "test", "jobId": "job", "youtubeUrl": "https://youtu.be/test", "chunkSeconds": 45})
            finally:
                self.assertTrue(workdirs)
                self.assertFalse(workdirs[0].exists(), "temporary audio must be cleaned up")

    def test_uploads_four_chunks_concurrently_and_preserves_timeline_order(self):
        barrier = threading.Barrier(4)
        uploaded = []
        lock = threading.Lock()

        def upload(source: Path, key: str, prefix: Path) -> None:
            # A serial implementation cannot pass this barrier. All eight tasks
            # complete in two bounded groups without relying on timing thresholds.
            barrier.wait(timeout=3)
            with lock:
                uploaded.append(key)

        result = self.prepare(upload)
        self.assertEqual(len(uploaded), 8)
        self.assertEqual([chunk["index"] for chunk in result["chunks"]], list(range(8)))
        self.assertEqual([chunk["startMs"] for chunk in result["chunks"]], [index * 45_000 for index in range(8)])
        self.assertGreaterEqual(result["uploadSec"], 0)

    def test_upload_failure_propagates_instead_of_returning_missing_audio(self):
        def upload(source: Path, key: str, prefix: Path) -> None:
            if key.endswith("00001.mp3"):
                raise RuntimeError("R2 unavailable")

        with self.assertRaisesRegex(RuntimeError, "R2 unavailable"):
            self.prepare(upload)


if __name__ == "__main__":
    unittest.main()
