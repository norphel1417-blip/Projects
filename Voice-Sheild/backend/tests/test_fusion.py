from app.forensics.fusion import fuse, build_scores


def test_fuse_monotonic():
    low = fuse(0.1, 0.1, 0.1)
    mid = fuse(0.5, 0.5, 0.5)
    high = fuse(0.9, 0.9, 0.9)
    assert low < mid < high
    assert 0.0 <= low <= 1.0 and 0.0 <= high <= 1.0


def test_build_scores():
    s = build_scores(0.8, 0.7, 0.9)
    assert s.neural_a == 0.8 and s.neural_b == 0.7 and s.forensic == 0.9
    assert 0.0 <= s.fused <= 1.0
    assert s.fused > 0.5
