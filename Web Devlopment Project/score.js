// score.js - Score Tracking Functionality

class ScoreManager {
    constructor() {
        this.scores = {
            total: 0,
            current: 0,
            highScore: 0
        };
        this.loadScores();
    }

    loadScores() {
        const savedScores = localStorage.getItem('scores');
        if (savedScores) {
            this.scores = JSON.parse(savedScores);
        }
    }

    saveScores() {
        localStorage.setItem('scores', JSON.stringify(this.scores));
    }

    updateScore(points) {
        this.scores.current += points;
        this.scores.total += points;

        if (this.scores.current > this.scores.highScore) {
            this.scores.highScore = this.scores.current;
        }

        this.saveScores();
        this.displayScores();
    }

    resetCurrentScore() {
        this.scores.current = 0;
        this.saveScores();
        this.displayScores();
    }

    displayScores() {
        const currentEl = document.getElementById('current-score');
        const totalEl = document.getElementById('total-score');
        const highEl = document.getElementById('high-score');

        if (currentEl) currentEl.textContent = this.scores.current;
        if (totalEl) totalEl.textContent = this.scores.total;
        if (highEl) highEl.textContent = this.scores.highScore;
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScoreManager;
}