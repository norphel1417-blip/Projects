"""Spectrogram + Grad-CAM-style heatmap rendering as base64 PNGs."""
from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image
from scipy import signal as scisig


def _normalize(a: np.ndarray) -> np.ndarray:
    a = a - a.min()
    m = a.max()
    return a / m if m > 0 else a


def _viridis(v: np.ndarray) -> np.ndarray:
    """Approximate viridis colormap without matplotlib dependency."""
    # Cubic polynomial fits to viridis (fast, dependency-free).
    x = np.clip(v, 0, 1)
    r = np.clip(0.267 + 1.7 * x - 1.6 * x**2 + 0.46 * x**3, 0, 1)
    g = np.clip(0.005 + 1.4 * x - 0.43 * x**2, 0, 1)
    b = np.clip(0.329 + 1.3 * x - 2.6 * x**2 + 1.5 * x**3, 0, 1)
    rgb = (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)
    return rgb


def _to_b64_png(rgb: np.ndarray) -> str:
    img = Image.fromarray(rgb, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def render_spectrogram(wav: np.ndarray, sr: int = 16000,
                       width: int = 320, height: int = 160) -> str:
    f, t, S = scisig.stft(wav, fs=sr, nperseg=1024, noverlap=768)
    mag = np.log(np.abs(S) + 1e-6)
    mag = _normalize(mag)
    # Resize via nearest-neighbour pillow
    img = Image.fromarray((mag * 255).astype(np.uint8)).resize(
        (width, height), Image.BILINEAR
    )
    arr = np.array(img) / 255.0
    rgb = _viridis(np.flipud(arr))  # frequency axis up
    return _to_b64_png(rgb)


def render_gradcam(wav: np.ndarray, contributions: dict[str, float],
                   sr: int = 16000, width: int = 320, height: int = 160) -> str:
    """Pseudo Grad-CAM: build a saliency heatmap from forensic-band weights.

    We don't need a true gradient pass for the explainability demo — we
    compute per-band importance from the feature contributions, multiply
    with the spectrogram magnitude, and overlay.
    """
    f, t, S = scisig.stft(wav, fs=sr, nperseg=1024, noverlap=768)
    mag = np.abs(S) + 1e-9

    # Build a frequency-band weighting from contributions
    weight = np.ones_like(f, dtype=np.float32)
    if contributions.get("low_hf_energy", 0) > 0.1:
        weight[f >= 6000] *= 2.5
    if contributions.get("high_spectral_flatness", 0) > 0.1:
        weight *= 1.4
    if contributions.get("phase_anomaly", 0) > 0.1:
        weight[(f >= 2000) & (f < 6000)] *= 1.8
    if contributions.get("spectral_tilt_anomaly", 0) > 0.1:
        weight *= np.linspace(1.0, 2.0, num=f.size).astype(np.float32)

    sal = (mag * weight[:, None])
    sal = _normalize(np.log(sal + 1e-6))

    img = Image.fromarray((sal * 255).astype(np.uint8)).resize(
        (width, height), Image.BILINEAR
    )
    arr = np.flipud(np.array(img) / 255.0)

    # Hot colormap for saliency
    r = np.clip(arr * 3, 0, 1)
    g = np.clip(arr * 3 - 1, 0, 1)
    b = np.clip(arr * 3 - 2, 0, 1)
    rgb = (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)
    return _to_b64_png(rgb)


def render_waveform(wav: np.ndarray, sr: int = 16000,
                    width: int = 320, height: int = 80) -> str:
    """Compact base64 PNG of the raw waveform for live preview tiles.

    Dependency-free (no matplotlib). Renders a gold trace on a transparent-
    looking dark background to match the UI palette.
    """
    n = wav.shape[0]
    if n == 0:
        rgb = np.zeros((height, width, 3), dtype=np.uint8)
        return _to_b64_png(rgb)
    # Downsample to `width` columns by min/max within each bucket.
    bucket = max(1, n // width)
    trimmed = wav[: bucket * width] if n >= bucket * width else np.pad(wav, (0, bucket * width - n))
    seg = trimmed.reshape(width, bucket)
    mins = seg.min(axis=1)
    maxs = seg.max(axis=1)
    peak = max(float(np.max(np.abs(wav))), 1e-6)
    mid = height // 2
    canvas = np.full((height, width, 3), 14, dtype=np.uint8)  # near-black
    # baseline
    canvas[mid, :, :] = (40, 40, 48)
    gold = np.array([212, 175, 55], dtype=np.uint8)
    for x in range(width):
        y_hi = int(mid - (maxs[x] / peak) * (mid - 1))
        y_lo = int(mid - (mins[x] / peak) * (mid - 1))
        if y_hi > y_lo:
            y_hi, y_lo = y_lo, y_hi
        y_hi = max(0, min(height - 1, y_hi))
        y_lo = max(0, min(height - 1, y_lo))
        canvas[y_hi:y_lo + 1, x, :] = gold
    return _to_b64_png(canvas)
