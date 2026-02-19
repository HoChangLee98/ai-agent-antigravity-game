/**
 * Rock Paper Scissors - Multiplayer Only with Nicknames and Host Sync
 */

// --- Game Constants & Utils ---
const choices = ['rock', 'paper', 'scissors'];
const icons = {
    rock: '✊',
    paper: '✋',
    scissors: '✌️'
};

function getWinningPick(pick1, pick2) {
    if ((pick1 === 'rock' && pick2 === 'scissors') || (pick1 === 'scissors' && pick2 === 'rock')) return 'rock';
    if ((pick1 === 'scissors' && pick2 === 'paper') || (pick1 === 'paper' && pick2 === 'scissors')) return 'scissors';
    if ((pick1 === 'paper' && pick2 === 'rock') || (pick1 === 'rock' && pick2 === 'paper')) return 'paper';
    return null;
}

// --- Storage ---
const STORAGE_KEY_HISTORY = 'rpsHistory';

function loadHistory() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
}

function saveHistory(historyData) {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(historyData));
}

function clearAllStorage() {
    localStorage.removeItem(STORAGE_KEY_HISTORY);
}


// --- Global State ---
let history = loadHistory();
let currentFilter = 'all';

let gameState = {
    roomId: null,
    isHost: false,
    isActive: false,
    round: 1,
    score: { user: 0, opponent: 0 },
    waitingForOpponent: false,
    lastPlayers: [],
    survivorIds: [],
    escapedIds: [],
    survivalType: 'lastLosing'
};

// --- Socket.io ---
let socket;
try {
    socket = io();
} catch(e) {
    console.error("Socket.io not found");
}

// --- UI Elements ---
const ui = {
    lobby: document.getElementById('multiplayer-lobby'),
    nicknameInput: document.getElementById('nickname-input'),
    btnCreateRoom: document.getElementById('create-room-btn'),
    btnJoinRoom: document.getElementById('join-room-btn'),
    inputRoomCode: document.getElementById('room-code-input'),
    roomInfo: document.getElementById('room-info'),
    txtRoomCode: document.getElementById('current-room-code'),
    txtConnectionStatus: document.getElementById('connection-status'),
    btnCopyLink: document.getElementById('copy-link-btn'),
    playerList: document.getElementById('player-list'),
    txtPlayerCount: document.getElementById('player-count'),
    
    choices: document.getElementById('choices'),
    resultArea: document.getElementById('result-area'),
    resultGrid: document.getElementById('result-grid'),
    resultMessage: document.getElementById('result-message'),
    playAgainBtn: document.getElementById('play-again-btn'),
    
    roundStatus: document.getElementById('round-status'),
    roundCurrent: document.getElementById('current-round'),
    roundTotal: document.getElementById('total-rounds'),
    
    historyList: document.getElementById('history-list'),
    gameModeSelect: document.getElementById('game-mode'),
    survivalTypeSelect: document.getElementById('survival-type'),
    survivalTypeGroup: document.getElementById('survival-type-group'),
    opponentCountGroup: document.getElementById('opponent-count').parentElement.parentElement,
    opponentCount: document.getElementById('opponent-count'),
};

// --- Initialization ---
init();

function init() {
    renderHistoryUI(history, currentFilter);
    setupEventListeners();
    setupSocketListeners();
    
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        ui.inputRoomCode.value = roomParam;
    }
    
    ui.gameModeSelect.disabled = true;
    ui.survivalTypeSelect.disabled = true;
}

function setupEventListeners() {
    ui.btnCreateRoom.addEventListener('click', () => {
        const nickname = ui.nicknameInput.value.trim();
        socket.emit('create_room', { nickname });
    });

    ui.btnJoinRoom.addEventListener('click', () => {
        const code = ui.inputRoomCode.value.trim().toUpperCase();
        const nickname = ui.nicknameInput.value.trim();
        if (code) {
            socket.emit('join_room', { roomId: code, nickname });
        } else {
            alert('방 코드를 입력해주세요.');
        }
    });

    ui.btnCopyLink.addEventListener('click', () => {
        const url = `${window.location.origin}${window.location.pathname}?room=${gameState.roomId}`;
        navigator.clipboard.writeText(url).then(() => alert('초대 링크가 복사되었습니다!'));
    });

    document.querySelectorAll('.choice-btn').forEach(btn => {
        btn.addEventListener('click', () => handleTurn(btn.dataset.choice));
    });

    ui.playAgainBtn.addEventListener('click', () => {
        if (gameState.isHost) {
            socket.emit('reset_game', gameState.roomId);
        } else {
            alert("방장이 다음 게임을 시작할 때까지 기다려주세요.");
        }
    });
    
    ui.gameModeSelect.addEventListener('change', () => {
        if (gameState.roomId) {
            socket.emit('update_game_mode', { roomId: gameState.roomId, mode: ui.gameModeSelect.value });
        }
        resetMatch();
    });

    ui.survivalTypeSelect.addEventListener('change', () => {
        if (gameState.roomId) {
            socket.emit('update_survival_type', { roomId: gameState.roomId, type: ui.survivalTypeSelect.value });
        }
        resetMatch();
    });

    document.getElementById('clear-history-btn').addEventListener('click', () => {
        if(confirm('모든 기록을 삭제하시겠습니까?')) {
            clearAllStorage();
            history = [];
            renderHistoryUI(history, currentFilter);
        }
    });
    
    document.getElementById('toggle-history-btn').addEventListener('click', () => ui.historyList.classList.toggle('hidden'));
}

function setupSocketListeners() {
    if(!socket) return;
    
    socket.on('room_created', (roomId) => {
        gameState.roomId = roomId;
        gameState.isHost = true;
        ui.roomInfo.classList.remove('hidden');
        ui.txtRoomCode.textContent = roomId;
        ui.txtConnectionStatus.textContent = '참가자를 기다리는 중...';
        ui.lobby.querySelector('.lobby-controls').classList.add('hidden');
        ui.gameModeSelect.disabled = false;
    });
    
    socket.on('player_count_updated', (count) => {
        ui.txtPlayerCount.textContent = count;
        ui.opponentCount.value = count;
        
        // Force Normal mode for 3+ players
        if (count >= 3) {
            ui.gameModeSelect.value = 'normal';
            ui.gameModeSelect.disabled = true;
            ui.survivalTypeGroup.classList.remove('hidden');
        } else {
            if (gameState.isHost) ui.gameModeSelect.disabled = false;
            ui.survivalTypeGroup.classList.add('hidden');
        }

        if (count > 1) {
            ui.txtConnectionStatus.textContent = `🟢 ${count}명의 플레이어가 접속 중!`;
        }
    });
    
    socket.on('player_list_update', (players) => renderPlayerListUI(players));
    
    socket.on('game_mode_sync', (mode) => {
        ui.gameModeSelect.value = mode;
        resetMatch();
    });

    socket.on('survival_type_sync', (type) => {
        gameState.survivalType = type;
        ui.survivalTypeSelect.value = type;
        resetMatch();
    });

    socket.on('game_reset', () => {
        gameState.survivorIds = [];
        resetViewUI();
        if (gameState.isActive) {
            gameState.round++;
            const mode = ui.gameModeSelect.value;
            const totalRounds = mode === 'bestOf3' ? 3 : (mode === 'bestOf5' ? 5 : 0);
            updateRoundStatusUI(Math.min(gameState.round, totalRounds), totalRounds, mode !== 'normal');
        } else {
            resetMatch();
        }
    });
    
    socket.on('you_are_host', () => {
        gameState.isHost = true;
        ui.gameModeSelect.disabled = false;
        ui.survivalTypeSelect.disabled = false;
        ui.txtConnectionStatus.textContent += ' (👑 방장 위임됨)';
        if (gameState.lastPlayers) renderPlayerListUI(gameState.lastPlayers);
    });
    
    socket.on('game_start', (data) => {
        gameState.roomId = gameState.roomId || ui.inputRoomCode.value.trim().toUpperCase();
        ui.roomInfo.classList.remove('hidden');
        ui.lobby.querySelector('.lobby-controls').classList.add('hidden');
        ui.txtRoomCode.textContent = gameState.roomId;
        ui.txtConnectionStatus.style.color = 'var(--accent-color)';
        resetMatch();
    });
    
    socket.on('opponent_moved', () => {
        if (gameState.survivorIds.length > 0 && !gameState.survivorIds.includes(socket.id)) {
            ui.txtConnectionStatus.textContent = '👀 서바이벌 진행 중... 다른 플레이어들이 선택 중입니다.';
        } else {
            ui.txtConnectionStatus.textContent = '🤔 누군가 선택을 완료했습니다...';
        }
    });
    
    socket.on('round_result', (data) => {
        gameState.waitingForOpponent = false;
        gameState.survivorIds = data.survivorIds;
        gameState.escapedIds = data.escapedIds;
        
        const myId = socket.id;
        const myMove = data.moves[myId];
        const opponentIds = Object.keys(data.moves).filter(id => id !== myId);
        
        const opponents = opponentIds.map(id => {
            const p = gameState.lastPlayers.find(pl => pl.id === id);
            return {
                id: id,
                nickname: p ? p.nickname : `Player_${id.substring(0,4)}`,
                pick: data.moves[id]
            };
        });
        
        // Result logic for me
        let result = 'draw';
        if (data.result === 'win') {
            result = data.winners.includes(myId) ? 'win' : 'lose';
        }
        
        finishTurn(myMove, opponents, result, data.winningPick, data.isFinalMatchResult, data.escapedIds);
    });
    
    socket.on('error', (msg) => alert(msg));
}

function handleTurn(userChoice) {
    if (gameState.waitingForOpponent) return;
    if (!gameState.roomId) return alert("방에 먼저 입장해주세요.");
    
    gameState.waitingForOpponent = true;
    socket.emit('player_move', { roomId: gameState.roomId, move: userChoice });
    
    ui.choices.classList.add('hidden');
    ui.resultArea.classList.remove('hidden');
    ui.resultMessage.textContent = '다른 플레이어의 선택을 대기 중...';
    ui.resultMessage.style.color = 'var(--text-secondary)';
    ui.resultGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; opacity: 0.5;">상대방들이 어떤 선택을 할지 고민하고 있습니다... 🤔</div>';
    ui.playAgainBtn.classList.add('hidden');
}

function finishTurn(userChoice, opponents, result, winningPick = null, isFinalMatchResult = true, escapedIds = []) {
    const mode = ui.gameModeSelect.value;
    
    if (mode !== 'normal' && isFinalMatchResult) {
        if (!gameState.isActive) startMatch(); 
        if (result === 'win') gameState.score.user++;
        else if (result === 'lose') gameState.score.opponent++;
    }
    
    addToHistory(userChoice, opponents, result);

    let matchOverMsg = null;
    if (mode !== 'normal' && isFinalMatchResult) {
        const targetWins = mode === 'bestOf3' ? 2 : 3;
        if (gameState.score.user >= targetWins || gameState.score.opponent >= targetWins) {
            const finalWin = gameState.score.user > gameState.score.opponent;
            matchOverMsg = {
                text: finalWin ? `🏆 최종 승리! (${gameState.score.user} : ${gameState.score.opponent})` : `💀 최종 패배... (${gameState.score.user} : ${gameState.score.opponent})`,
                success: finalWin
            };
            ui.playAgainBtn.textContent = "새로운 게임 시작";
        } else {
            ui.playAgainBtn.textContent = "다음 라운드";
        }
    } else if (!isFinalMatchResult) {
        ui.playAgainBtn.textContent = gameState.isHost ? "패배자들 다음 대결 시작 ➔" : "다음 대결 대기 중...";
    } else {
        ui.playAgainBtn.textContent = gameState.isHost ? "다시 하기 ↺" : "방장 대기 중...";
    }
    
    showResultUI(userChoice, opponents, result, matchOverMsg, winningPick, isFinalMatchResult, escapedIds);
}

function startMatch() {
    gameState.isActive = true;
    gameState.round = 1;
    gameState.score = { user: 0, opponent: 0 };
    const mode = ui.gameModeSelect.value;
    const totalRounds = mode === 'bestOf3' ? 3 : (mode === 'bestOf5' ? 5 : 0);
    updateRoundStatusUI(1, totalRounds, mode !== 'normal');
}

function resetMatch() {
    gameState.isActive = false;
    gameState.round = 1;
    gameState.score = { user: 0, opponent: 0 };
    gameState.waitingForOpponent = false;
    updateRoundStatusUI(1, 0, false);
    resetViewUI();
}

function addToHistory(user, opponents, result) {
    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    const cpuPicks = opponents.map(o => o.pick);
    const record = { time: timeStr, user, computers: cpuPicks, result };
    history.unshift(record);
    if(history.length > 50) history.pop();
    saveHistory(history);
    renderHistoryUI(history);
}

function renderHistoryUI(h) {
    ui.historyList.innerHTML = '';
    if(h.length === 0) {
        ui.historyList.innerHTML = '<li style="padding:1rem; opacity:0.5; text-align:center;">표시할 기록이 없습니다.</li>';
        return;
    }
    h.forEach(item => {
        const li = document.createElement('li');
        li.className = 'history-item';
        const resultClass = item.result === 'win' ? 'win-text' : (item.result === 'lose' ? 'lose-text' : 'draw-text');
        const cpuIcons = item.computers.map(c => icons[c]).join(' ');
        li.innerHTML = `<span class="history-time">${item.time}</span><span class="history-result ${resultClass}">${item.result.toUpperCase()}</span><div class="history-detail"><span>나: ${icons[item.user]}</span><span style="opacity:0.3">vs</span><span style="font-size:0.9rem">${cpuIcons}</span></div>`;
        ui.historyList.appendChild(li);
    });
}

function showResultUI(userChoice, opponents, result, matchMsg, serverWinningPick = null, isFinalMatchResult = true, escapedIds = []) {
    ui.choices.classList.add('hidden');
    ui.resultArea.classList.remove('hidden');
    ui.playAgainBtn.classList.remove('hidden');
    ui.resultGrid.innerHTML = '';
    
    if (matchMsg) {
        ui.resultMessage.textContent = matchMsg.text;
        ui.resultMessage.style.color = matchMsg.success ? 'var(--accent-color)' : 'var(--danger-color)';
    } else {
        if (!isFinalMatchResult) {
            const isSurvivor = gameState.survivorIds.includes(socket.id);
            const isLosingMode = gameState.survivalType === 'lastLosing';

            if (!isSurvivor) {
                const msg = isLosingMode ? '먼저 탈출! 🟢 (관전 중)' : '탈락... 🔴 (관전 중)';
                ui.resultMessage.textContent = msg;
                ui.resultMessage.style.color = isLosingMode ? 'var(--accent-color)' : 'var(--danger-color)';
            } else if (result === 'draw') {
                ui.resultMessage.textContent = '무승부! 다시 대결해야 합니다.';
                ui.resultMessage.style.color = '#94a3b8';
            } else {
                const msg = isLosingMode ? '패배... 🔴 계속 대결!' : '승리! 🟢 계속 대결!';
                ui.resultMessage.textContent = msg;
                ui.resultMessage.style.color = isLosingMode ? 'var(--danger-color)' : 'var(--accent-color)';
            }
        } else {
            const isWinner = result === 'win';
            const isLosingMode = gameState.survivalType === 'lastLosing';
            
            if (isLosingMode) {
                ui.resultMessage.textContent = result === 'win' ? '최종 생존! 🏆' : (result === 'lose' ? '최종 꼴찌... 💀' : '비겼습니다');
            } else {
                ui.resultMessage.textContent = result === 'win' ? '최종 우승! 🏅' : (result === 'lose' ? '최종 탈락... 💀' : '비겼습니다');
            }
            ui.resultMessage.style.color = isWinner ? 'var(--accent-color)' : (result === 'lose' ? 'var(--danger-color)' : '#94a3b8');
        }
    }

    let winningPick = serverWinningPick;
    // Current players' cards
    const me = gameState.lastPlayers.find(p => p.id === socket.id);
    const myNickname = me ? me.nickname : "나";

    if (userChoice && (gameState.survivorIds.length === 0 || gameState.survivorIds.concat(escapedIds).includes(socket.id))) {
        ui.resultGrid.appendChild(createCard(myNickname, userChoice, userChoice === winningPick, false));
    }
    
    opponents.forEach(o => {
        ui.resultGrid.appendChild(createCard(o.nickname, o.pick, o.pick === winningPick, false));
    });

    // Escaped players status (already safe, didn't play this sub-turn)
    escapedIds.forEach(id => {
        if (id !== socket.id) {
            const p = gameState.lastPlayers.find(pl => pl.id === id);
            const name = p ? p.nickname : `Player_${id.substring(0,4)}`;
            ui.resultGrid.appendChild(createCard(name, null, false, true)); // true means SAFE status
        }
    });
}

function resetViewUI() {
    ui.resultArea.classList.add('hidden');
    ui.playAgainBtn.classList.add('hidden');
    
    // In survival mode, if I'm not a survivor, I stay hidden from choices
    const isPlayer = gameState.lastPlayers.some(p => p.id === socket.id);
    const isSurvivor = gameState.survivorIds.length === 0 || gameState.survivorIds.includes(socket.id);
    
    if (isPlayer && isSurvivor) {
        ui.choices.classList.remove('hidden');
        ui.resultMessage.textContent = '';
    } else {
        ui.resultArea.classList.remove('hidden');
        ui.resultMessage.textContent = '다른 플레이어들의 대결을 관전 중입니다...';
        ui.resultMessage.style.color = 'var(--text-secondary)';
        ui.resultGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; opacity: 0.5;">승리하셨습니다! 나머지 분들의 대결이 끝날 때까지 기다려주세요. 👀</div>';
    }
}

function updateRoundStatusUI(current, total, isVisible) {
    if (isVisible) {
        ui.roundStatus.classList.remove('hidden');
        ui.roundCurrent.textContent = current;
        ui.roundTotal.textContent = total;
    } else {
        ui.roundStatus.classList.add('hidden');
    }
}

function createCard(name, pick, isWinner, isSafe = false) {
    const div = document.createElement('div');
    div.className = `player-pick ${isWinner ? 'winner-glow' : ''} ${isSafe ? 'safe-status' : ''}`;
    
    if (isSafe) {
        div.innerHTML = `<span class="pick-label">${name}</span><div class="icon">✅</div><span style="font-size:0.7rem; color:var(--accent-color)">SAFE</span>`;
    } else {
        div.innerHTML = `<span class="pick-label">${name}</span><div class="icon">${icons[pick]}</div>`;
    }
    return div;
}

function renderPlayerListUI(players) {
    gameState.lastPlayers = players;
    ui.playerList.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.className = `player-item ${p.id === socket.id ? 'is-me' : ''} ${p.isHost ? 'is-host' : ''}`;
        li.textContent = p.nickname;
        ui.playerList.appendChild(li);
    });
}
