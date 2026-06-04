// ==========================================================================
// 1. 전역 변수 및 게임오버 중복 방지 플래그 선언 (최상단 격리)
// ==========================================================================
if (typeof window.isGameOverProcessing === 'undefined') {
    window.isGameOverProcessing = false;
}

// ==========================================================================
// 📐 [수정] 2048 게임판 정대칭 레이아웃을 위한 물리 상수 정의
// ==========================================================================
const GRID_GAP = 15;        // 테두리 및 격자 사이의 여백 (15px)
const TILE_SIZE = 106;      // 숫자 타일 하나의 순수 가로/세로 크기 (106px)
const CELL_STEP = TILE_SIZE + GRID_GAP; // 한 칸 이동할 때의 총 거리 (121px)

class Game2048 {
    constructor() {
        this.board = Array(4).fill().map(() => Array(4).fill(0));
        this.score = 0;
        this.tileElements = {}; // 화면의 타일 DOM 객체들을 관리할 저장소
        this.tileIdCounter = 0; // 타일마다 고유한 고유 ID 부여
        this.initGame();
        this.setupInput();
    }

    initGame() {
        // 게임오버 상태 플래그 초기화
        window.isGameOverProcessing = false;

        // 화면 청소
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

    // 타일을 생성할 때 고유 ID와 함께 객체로 저장
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

            // 보드 배열에 숫자 대신 {값, 아이디} 객체를 저장합니다.
            this.board[r][c] = { value, id: tileId };

            // 실제 화면에 HTML 태그 생성하여 배치
            this.createTileDOM(r, c, value, tileId, true);
        }
    }

    // 💡 [수정] 화면에 타일 태그를 물리적으로 만드는 함수 (정대칭 공식 적용)
    createTileDOM(r, c, value, tileId, isNew = false) {
        const container = document.getElementById('game-container');
        if (!container) return;

        const tile = document.createElement('div');

        tile.id = tileId;
        tile.className = `tile tile-${value}` + (isNew ? ' tile-new' : '');
        tile.innerText = value;

        // 📐 [정밀 보정] 상하좌우 여백을 시작점으로 삼고, 칸 수만큼 수식을 자동화하여 정중앙 안착
        tile.style.top = `${GRID_GAP + r * CELL_STEP}px`;
        tile.style.left = `${GRID_GAP + c * CELL_STEP}px`;

        container.appendChild(tile);
        this.tileElements[tileId] = tile;
    }

    // 핵심: 이동 방향에 맞춰 타일의 top, left 값을 부드럽게 이동시키는 로직
    move(direction) {
        // 만약 게임오버 팝업이 뜨는 중이거나 이미 끝났다면 이동 연산을 원천 차단
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
                        // 📐 [수정] 합쳐지러 들어가는 타일의 애니메이션 좌표 정대칭 동기화
                        dom.style.top = `${GRID_GAP + finalR * CELL_STEP}px`;
                        dom.style.left = `${GRID_GAP + finalC * CELL_STEP}px`;
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
                        // 📐 [수정] 미끄러지는 타일의 애니메이션 좌표 정대칭 동기화
                        dom.style.top = `${GRID_GAP + finalR * CELL_STEP}px`;
                        dom.style.left = `${GRID_GAP + finalC * CELL_STEP}px`;
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

    // 이벤트 리스너 중복 바인딩을 방지하는 안전 메커니즘
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

    // 실질적인 게임오버 핸들러 메서드 내부에 차단 게이트 추가
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
                console.log("DB에 점수가 성공적으로 기록되었습니다.");
                window.location.href = '/ranking/';
            }
        })
        .catch(err => {
            console.error("점수 전송 중 오류 발생:", err);
            window.isGameOverProcessing = false; // 전송 실패 시 다시 수동 조작 허용
        });
    }
}

// 최초 윈도우 로드 시 단 한 번만 인스턴스 실행
window.onload = () => {
    window.game = new Game2048();
};