# VoiceShield Makefile (cross-platform-ish)

.PHONY: help install backend frontend up down test bench weights clean demo

help:
	@echo "VoiceShield targets:"
	@echo "  make install   - install backend + frontend deps"
	@echo "  make backend   - run backend on :8000"
	@echo "  make frontend  - run frontend on :5173"
	@echo "  make up        - docker compose up"
	@echo "  make down      - docker compose down"
	@echo "  make test      - run pytest"
	@echo "  make bench     - latency + first-flag benchmark"
	@echo "  make weights   - download HF model weights"
	@echo "  make demo      - prepare bundled demo samples"

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

backend:
	cd backend && python -m app.main

frontend:
	cd frontend && npm run dev

up:
	docker compose up --build

down:
	docker compose down

test:
	cd backend && pytest -q

bench:
	cd backend && python -m scripts.bench

weights:
	cd backend && python -m scripts.download_weights

demo:
	cd backend && python -m scripts.generate_samples

clean:
	rm -rf backend/__pycache__ backend/.pytest_cache frontend/dist
