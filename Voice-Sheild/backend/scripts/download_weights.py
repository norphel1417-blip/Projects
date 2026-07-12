"""Pre-download HF model weights for offline operation."""
from __future__ import annotations

import logging

log = logging.getLogger("voiceshield.weights")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def main() -> None:
    try:
        from transformers import (
            AutoFeatureExtractor,
            AutoModel,
            WhisperFeatureExtractor,
            WhisperModel,
        )
    except ImportError as e:
        log.error("transformers not installed: %s", e)
        return

    targets = [
        ("facebook/wav2vec2-base", AutoFeatureExtractor, AutoModel),
        ("openai/whisper-tiny", WhisperFeatureExtractor, WhisperModel),
    ]
    for repo, fe_cls, m_cls in targets:
        log.info("Downloading %s ...", repo)
        try:
            fe_cls.from_pretrained(repo)
            m_cls.from_pretrained(repo)
            log.info("  OK")
        except Exception as e:
            log.warning("  FAILED: %s", e)


if __name__ == "__main__":
    main()
