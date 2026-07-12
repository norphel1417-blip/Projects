import numpy as np

from app.forensics.features import extract_features, forensic_probability


def _real(seconds=4.0, sr=16000):
    rng = np.random.default_rng(0)
    t = np.arange(int(seconds * sr)) / sr
    f0 = 130 + 6 * np.sin(2 * np.pi * 0.4 * t) + rng.normal(0, 4, t.size)
    phase = np.cumsum(2 * np.pi * f0 / sr)
    sig = sum((1.0 / k) * (1 + 0.05 * rng.standard_normal(t.size)) * np.sin(k * phase)
              for k in range(1, 20))
    sig += 0.03 * rng.standard_normal(t.size)
    return sig.astype(np.float32), sr


def _fake(seconds=4.0, sr=16000):
    t = np.arange(int(seconds * sr)) / sr
    phase = 2 * np.pi * 145 * t
    sig = sum((1.0 / k**0.9) * np.sin(k * phase) for k in range(1, 20))
    # bandlimit
    from scipy.signal import butter, sosfilt
    sos = butter(8, 6000, btype="low", fs=sr, output="sos")
    sig = sosfilt(sos, sig)
    return sig.astype(np.float32), sr


def test_features_shape():
    wav, sr = _real()
    feats = extract_features(wav, sr)
    for k in ("pitch_jitter", "pitch_shimmer", "spectral_kurtosis",
              "spectral_flatness", "phase_coherence", "hf_energy_ratio",
              "spectral_tilt", "voiced_ratio"):
        assert hasattr(feats, k)


def test_fake_scores_higher_than_real():
    real_wav, sr = _real()
    fake_wav, _ = _fake()
    p_real, _ = forensic_probability(extract_features(real_wav, sr))
    p_fake, _ = forensic_probability(extract_features(fake_wav, sr))
    assert p_fake > p_real, f"expected p_fake > p_real, got {p_fake} vs {p_real}"
