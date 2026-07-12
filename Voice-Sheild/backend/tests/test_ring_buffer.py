import asyncio

import numpy as np
import pytest

from app.streaming import RingBuffer, Session, update_decision


@pytest.mark.asyncio
async def test_ring_buffer_wrap():
    rb = RingBuffer(seconds=1.0, sr=1000)  # capacity 1000
    await rb.push(np.arange(800, dtype=np.float32))
    await rb.push(np.arange(400, dtype=np.float32) + 1000)  # 1200 total → wrap
    last = rb.latest(500)
    assert last is not None
    assert last.size == 500
    # the latest 500 samples should end with 1399
    assert last[-1] == 1399.0


@pytest.mark.asyncio
async def test_decision_high_oneshot():
    s = Session(session_id="t", sr=16000)
    newly, lvl = update_decision(s, 0.9)
    assert newly is True and lvl == "high" and s.risk == "high"


@pytest.mark.asyncio
async def test_decision_consecutive_medium():
    s = Session(session_id="t", sr=16000)
    update_decision(s, 0.7); s.window_index += 1
    newly, lvl = update_decision(s, 0.7); s.window_index += 1
    # second medium triggers high under default consecutive_required=2
    assert lvl == "high" and newly is True
