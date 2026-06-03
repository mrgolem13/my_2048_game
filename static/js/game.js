// ====== [game.js 파일의 최상단 공간] ======
// 그 어떤 함수에도 속하지 않는 파일 맨 위에 선언해야 안전합니다!
if (typeof window.isGameOverProcessing === 'undefined') {
    window.isGameOverProcessing = false;
}

function gameOver(finalScore, highestTile) {
    // 전역 윈도우 객체에 고정하여 중복 차단 효과를 극대화합니다.
    if (window.isGameOverProcessing) return;
    window.isGameOverProcessing = true;

    alert("게임 오버! 당신의 점수: " + finalScore);

    fetch('/save_score/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: finalScore, max_tile: highestTile })
    })
    .then(response => response.json())
    .then(data => {
        if(data.result === 'success') {
            console.log("DB에 점수가 성공적으로 기록되었습니다.");
            window.location.href = '/ranking/';
        }
    })
    .catch(err => {
        console.error("오류 발생:", err);
        window.isGameOverProcessing = false;
    });
}

// 💡 만약 게임을 리스타트(다시 시작)하는 함수가 있다면, 그 함수 내부에서 아래와 같이 초기화해 주어야 합니다!
function restartGame() {
    isGameOverProcessing = false; // 새 게임 시작 시 다시 플래그를 풀어줌
    // ... 기존 리스타트 로직들
}

class Game2048 {
    constructor() {
        this.board = Array(4).fill().map(() => Array(4).fill(0));
        this.score = 0;
        this.tileElements = {}; // 💡 화면의 타일 DOM 객체들을 관리할 저장소
        this.tileIdCounter = 0; // 타일마다 고유한 주민번호(ID) 부여
        this.initGame();
        this.setupInput();
    }

    initGame() {
        // 화면 청소
        const container = document.getElementById('game-container');
        container.querySelectorAll('.tile').forEach(t => t.remove());

        this.board = Array(4).fill().map(() => Array(4).fill(0));
        this.tileElements = {};
        this.score = 0;
        document.getElementById('current-score').innerText = this.score;

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

    // 화면에 타일 태그를 물리적으로 만드는 함수
    createTileDOM(r, c, value, tileId, isNew = false) {
        const container = document.getElementById('game-container');
        const tile = document.createElement('div');

        tile.id = tileId;
        tile.className = `tile tile-${value}` + (isNew ? ' tile-new' : '');
        tile.innerText = value;

        // 위치 계산 (좌표 배치)
        tile.style.top = `${15 + r * 88}px`;
        tile.style.left = `${15 + c * 88}px`;

        container.appendChild(tile);
        this.tileElements[tileId] = tile;
    }

    // 💡 핵심: 이동 방향에 맞춰 타일의 top, left 값을 부드럽게 이동시키는 로직
    move(direction) {
        let moved = false;
        let scoreGained = 0;

        // 회전 알고리즘 대신, 애니메이션 처리를 위해 각 방향별로 직접 인덱싱 순회
        const isVertical = direction === 'up' || direction === 'down';
        const isInverted = direction === 'right' || direction === 'down';

        for (let i = 0; i < 4; i++) {
            // 한 줄씩 추출
            let line = [];
            for (let j = 0; j < 4; j++) {
                let r = isVertical ? j : i;
                let c = isVertical ? i : j;
                line.push(this.board[r][c]);
            }

            if (isInverted) line.reverse();

            // 슬라이드 및 합치기 처리 (애니메이션용 커스텀 로직)
            let newLine = Array(4).fill(0);
            let targetIdx = 0;

            for (let j = 0; j < 4; j++) {
                if (line[j] === 0) continue;

                if (targetIdx > 0 && newLine[targetIdx - 1] !== 0 && newLine[targetIdx - 1].value === line[j].value && !newLine[targetIdx - 1].merged) {
                    // 합쳐지는 경우
                    let k = targetIdx - 1;
                    let mergedTile = line[j];

                    // 기존 화면의 타일을 합쳐질 대상 위치로 이동 애니메이션 실행!
                    let finalJ = isInverted ? 3 - k : k;
                    let finalR = isVertical ? finalJ : i;
                    let finalC = isVertical ? i : finalJ;

                    let dom = this.tileElements[mergedTile.id];
                    if (dom) {
                        dom.style.top = `${15 + finalR * 88}px`;
                        dom.style.left = `${15 + finalC * 88}px`;
                        // 애니메이션이 끝난 후(0.1초 뒤) 합쳐져서 사라질 타일 삭제
                        setTimeout(() => dom.remove(), 100);
                    }

                    newLine[k].value *= 2;
                    newLine[k].merged = true;
                    scoreGained += newLine[k].value;
                    moved = true;
                } else {
                    // 그냥 빈칸으로 이동하는 경우
                    newLine[targetIdx] = { ...line[j], merged: false };

                    let finalJ = isInverted ? 3 - targetIdx : targetIdx;
                    let finalR = isVertical ? finalJ : i;
                    let finalC = isVertical ? i : finalJ;

                    if (finalJ !== j) moved = true;

                    // 화면의 타일 위치 이동시키기 (CSS transition 발동!)
                    let dom = this.tileElements[line[j].id];
                    if (dom) {
                        dom.style.top = `${15 + finalR * 88}px`;
                        dom.style.left = `${15 + finalC * 88}px`;
                    }
                    targetIdx++;
                }
            }

            if (isInverted) newLine.reverse();

            // 원래 보드에 반영
            for (let j = 0; j < 4; j++) {
                let r = isVertical ? j : i;
                let c = isVertical ? i : j;
                this.board[r][c] = newLine[j];
                if (this.board[r][c] !== 0) {
                    // 합쳐진 타일 숫자로 텍스트 및 디자인 변경 업데이트 (0.1초 뒤 부드럽게 변환)
                    let tileData = this.board[r][c];
                    setTimeout(() => {
                        let dom = this.tileElements[tileData.id];
                        if (dom) {
                            dom.className = `tile tile-${tileData.value}`;
                            dom.innerText = tileData.value;
                        }
                    }, 100);
                    delete tileData.merged; // 임시 플래그 삭제
                }
            }
        }

        if (moved) {
            this.score += scoreGained;
            document.getElementById('current-score').innerText = this.score;

            // 이동 애니메이션이 끝나는 타이밍에 맞춰 새 타일 스폰
            setTimeout(() => {
                this.generateRandomTile();
                if (this.isGameOver()) this.handleGameOver();
            }, 100);
        }
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') this.move('left');
            if (e.key === 'ArrowRight') this.move('right');
            if (e.key === 'ArrowUp') this.move('up');
            if (e.key === 'ArrowDown') this.move('down');
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
        });
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
        let max = 0;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (this.board[r][c] && this.board[r][c].value > max) max = this.board[r][c].value;
            }
        }
        alert(`게임 오버! 최종 점수: ${this.score}점`);
        fetch('/save_score/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: this.score, max_tile: max })
        })
        .then(res => res.json())
        .then(data => { if (data.result === 'success') window.location.href = '/ranking/'; });
    }
}

window.onload = () => { window.game = new Game2048(); };
