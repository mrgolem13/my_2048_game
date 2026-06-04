// ==========================================================================
// 1. 전역 변수 및 게임오버 중복 방지 플래그 선언 (최상단 격리)
// ==========================================================================
if (typeof window.isGameOverProcessing === 'undefined') {
    window.isGameOverProcessing = false;
}

class Game2048 {
    constructor() {
        this.board = Array(4).fill().map(() => Array(4).fill(0));
        this.score = 0;
        this.tileElements = {};
        this.tileIdCounter = 0;
        this.initGame();
        this.setupInput();
    }

    initGame() {
        window.isGameOverProcessing = false;
        const container = document.getElementById('game-container');
        if (container) {
            container.querySelectorAll('.tile').forEach(t => t.remove());
        }
        this.board = Array(4).fill().map(() => Array(4).fill(0));
        this.tileElements = {};
        this.score = 0;
        const scoreDOM = document.getElementById('current-score');
        if (scoreDOM) scoreDOM.innerText = this.score;

        this.generateRandomTile();
        this.generateRandomTile();
    }

    generateRandomTile() {
        let emptyCells = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (this.board[r][c] === 0) emptyCells.push({r, c});
            }
        }
        if (emptyCells.length > 0) {
            let {r, c} = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            let value = Math.random() < 0.9 ? 2 : 4;
            let tileId = `tile-${this.tileIdCounter++}`;
            this.board[r][c] = { value, id: tileId };
            this.createTileDOM(r, c, value, tileId, true);
        }
    }

    // 💡 [여백 대칭 정밀 보정] 우측 및 하단 빈 공간의 균형을 맞추기 위해 시작 오프셋 및 간격 조정
    createTileDOM(r, c, value, tileId, isNew = false) {
        const container = document.getElementById('game-container');
        if (!container) return;

        const tile = document.createElement('div');
        tile.id = tileId;
        tile.className = `tile tile-${value}` + (isNew ? ' tile-new' : '');
        tile.innerText = value;

        // 📐 기존 15px 시작점에서 각각 우측(X)으로 +12px, 하단(Y)으로 +23px만큼 이동 타겟을 밀어주어
        // 겉도는 배경 격자 무늬의 중앙 레이어에 완벽히 포개어지도록 강제 보정합니다.
        tile.style.top = `${38 + r * 86.25}px`;
        tile.style.left = `${27 + c * 86.25}px`;

        container.appendChild(tile);
        this.tileElements[tileId] = tile;
    }

    move(direction) {
        if (window.isGameOverProcessing) return;

        let moved = false;
        let scoreGained = 0;
        const isVertical = direction === 'up' || direction === 'down';
        const isInverted = direction === 'right' || direction === 'down';

        for (let i = 0; i < 4; i++) {
            let line = [];
            for (let j = 0; j < 4; j++) {
                let r = isVertical ? j : i;
                let c = isVertical ? i : j;
                line.push(this.board[r][c]);
            }

            if (isInverted) line.reverse();

            let newLine = Array(4).fill(0);
            let targetIdx = 0;

            for (let j = 0; j < 4; j++) {
                if (line[j] === 0) continue;

                if (targetIdx > 0 && newLine[targetIdx - 1] !== 0 && newLine[targetIdx - 1].value === line[j].value && !newLine[targetIdx - 1].merged) {
                    let k = targetIdx - 1;
                    let mergedTile = line[j];
                    let finalJ = isInverted ? 3 - k : k;
                    let finalR = isVertical ? finalJ : i;
                    let finalC = isVertical ? i : finalJ;

                    let dom = this.tileElements[mergedTile.id];
                    if (dom) {
                        // 📐 이동 및 합성 애니메이션 좌표 정밀 보정 동기화
                        dom.style.top = `${38 + finalR * 86.25}px`;
                        dom.style.left = `${27 + finalC * 86.25}px`;
                        setTimeout(() => dom.remove(), 100);
                    }

                    newLine[k].value *= 2;
                    newLine[k].merged = true;
                    scoreGained += newLine[k].value;
                    moved = true;
                } else {
                    newLine[targetIdx] = { ...line[j], merged: false };
                    let finalJ = isInverted ? 3 - targetIdx : targetIdx;
                    let finalR = isVertical ? finalJ : i;
                    let finalC = isVertical ? i : finalJ;

                    if (finalJ !== j) moved = true;

                    let dom = this.tileElements[line[j].id];
                    if (dom) {
                        // 📐 이동 및 슬라이딩 애니메이션 좌표 정밀 보정 동기화
                        dom.style.top = `${38 + finalR * 86.25}px`;
                        dom.style.left = `${27 + finalC * 86.25}px`;
                    }
                    targetIdx++;
                }
            }

            if (isInverted) newLine.reverse();

            for (let j = 0; j < 4; j++) {
                let r = isVertical ? j : i;
                let c = isVertical ? i : j;
                this.board[r][c] = newLine[j];
                if (this.board[r][c] !== 0) {
                    let tileData = this.board[r][c];
                    setTimeout(() => {
                        let dom = this.tileElements[tileData.id];
                        if (dom) {
                            dom.className = `tile tile-${tileData.value}`;
                            dom.innerText = tileData.value;
                        }
                    }, 100);
                    delete tileData.merged;
                }
            }
        }

        if (moved) {
            this.score += scoreGained;
            const scoreDOM = document.getElementById('current-score');
            if (scoreDOM) scoreDOM.innerText = this.score;

            setTimeout(() => {
                this.generateRandomTile();
                if (this.isGameOver()) {
                    this.handleGameOver();
                }
            }, 100);
        }
    }

    setupInput() {
        if (this.keydownBinder) {
            window.removeEventListener('keydown', this.keydownBinder);
        }
        this.keydownBinder = (e) => {
            if (window.isGameOverProcessing) return;
            if (e.key === 'ArrowLeft') this.move('left');
            if (e.key === 'ArrowRight') this.move('right');
            if (e.key === 'ArrowUp') this.move('up');
            if (e.key === 'ArrowDown') this.move('down');
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
        };
        window.addEventListener('keydown', this.keydownBinder);
    }

    isGameOver() {
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (this.board[r][c] === 0) return false;
                let val = this.board[r][c].value;
                if (r < 3 && this.board[r+1][c] !== 0 && val === this.board[r+1][c].value) return false;
                if (c < 3 && this.board[r][c+1] !== 0 && val === this.board[r][c+1].value) return false;
            }
        }
        return true;
    }

    handleGameOver() {
        if (window.isGameOverProcessing) return;
        window.isGameOverProcessing = true;

        let max = 0;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (this.board[r][c] && this.board[r][c].value > max) {
                    max = this.board[r][c].value;
                }
            }
        }

        alert(`게임 오버! 최종 점수: ${this.score}점`);

        fetch('/save_score/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: this.score, max_tile: max })
        })
        .then(res => res.json())
        .then(data => {
            if (data.result === 'success') {
                window.location.href = '/ranking/';
            }
        })
        .catch(err => {
            console.error("점수 전송 중 오류 발생:", err);
            window.isGameOverProcessing = false;
        });
    }
}

window.onload = () => {
    window.game = new Game2048();
};