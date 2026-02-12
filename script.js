/**
 * ONE SCRIPT TO RULE THEM ALL
 * 모듈화 문제를 해결하기 위해 다시 하나의 파일로 통합합니다.
 */

// --- Game Logic ---
const choices = ['rock', 'paper', 'scissors'];
const icons = {
    rock: '✊',
    paper: '✋',
    scissors: '✌️'
};

function getComputerChoice() {
    return choices[Math.floor(Math.random() * choices.length)];
}

function determineTurnResult(user, computers) {
    const allPicks = [user, ...computers];
    const uniquePicks = [...new Set(allPicks)];

    if (uniquePicks.length === 1 || uniquePicks.length === 3) return 'draw';

    const [a, b] = uniquePicks;
    const winningPick = getWinningPick(a, b);

    return user === winningPick ? 'win' : 'lose';
}

function getWinningPick(pick1, pick2) {
    if ((pick1 === 'rock' && pick2 === 'scissors') || (pick1 === 'scissors' && pick2 === 'rock')) return 'rock';
    if ((pick1 === 'scissors' && pick2 === 'paper') || (pick1 === 'paper' && pick2 === 'scissors')) return 'scissors';
    if ((pick1 === 'paper' && pick2 === 'rock') || (pick1 === 'rock' && pick2 === 'paper')) return 'paper';
    return null;
}

// --- Storage ---
const STORAGE_KEY_STATS = 'rpsStats';
const STORAGE_KEY_HISTORY = 'rpsHistory';

function loadStats() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_STATS)) || { wins: 0, losses: 0, draws: 0 };
}

function saveStats(statsData) {
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(statsData));
}

function loadHistory() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
}

function saveHistory(historyData) {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(historyData));
}

function clearAllStorage() {
    localStorage.removeItem(STORAGE_KEY_STATS);
    localStorage.removeItem(STORAGE_KEY_HISTORY);
}

// --- UI & Application State ---
let stats = loadStats();
let history = loadHistory();
let currentFilter = 'all';

let matchState = {
    isActive: false,
    round: 1,
    score: { user: 0, computer: 0 }
};

// DOM Elements
const ui = {
    wins: document.getElementById('win-count'),
    losses: document.getElementById('lose-count'),
    draws: document.getElementById('draw-count'),
    rate: document.getElementById('win-rate'),
    
    btnAll: document.getElementById('filter-all'),
    btnWin: document.getElementById('filter-win'),
    btnLose: document.getElementById('filter-lose'),
    btnDraw: document.getElementById('filter-draw'),
    historyTitle: document.getElementById('history-title'),

    choices: document.getElementById('choices'),
    resultArea: document.getElementById('result-area'),
    resultGrid: document.getElementById('result-grid'),
    resultMessage: document.getElementById('result-message'),
    playAgainBtn: document.getElementById('play-again-btn'),
    
    roundStatus: document.getElementById('round-status'),
    roundCurrent: document.getElementById('current-round'),
    roundTotal: document.getElementById('total-rounds'),
    
    historyList: document.getElementById('history-list'),

    gameMode: document.getElementById('game-mode'),
    opponentCount: document.getElementById('opponent-count'),
};

// Initialize
updateStatsUI(stats);
renderHistoryUI(history, currentFilter);
setupEventListeners();

function setupEventListeners() {
    document.querySelectorAll('.choice-btn').forEach(btn => {
        btn.addEventListener('click', () => handleTurn(btn.dataset.choice));
    });

    ui.playAgainBtn.addEventListener('click', handleNext);
    
    ui.gameMode.addEventListener('change', resetMatch);
    ui.opponentCount.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (val < 1) { e.target.value = 1; }
        if (val > 10) { e.target.value = 10; }
        resetMatch(); 
    });

    document.getElementById('clear-history-btn').addEventListener('click', () => {
        if(confirm('모든 기록을 삭제하시겠습니까?')) {
            clearAllStorage();
            stats = { wins: 0, losses: 0, draws: 0 };
            history = [];
            updateStatsUI(stats);
            renderHistoryUI(history, currentFilter);
        }
    });

    document.getElementById('toggle-history-btn').addEventListener('click', () => {
        ui.historyList.classList.toggle('hidden');
    });

    ui.btnAll.addEventListener('click', () => setFilter('all'));
    ui.btnWin.addEventListener('click', () => setFilter('win'));
    ui.btnLose.addEventListener('click', () => setFilter('lose'));
    ui.btnDraw.addEventListener('click', () => setFilter('draw'));
}

function handleTurn(userChoice) {
    if (!matchState.isActive) startMatch();

    const opponentCount = parseInt(ui.opponentCount.value) || 1;
    const computers = Array.from({length: opponentCount}, () => getComputerChoice());
    
    const turnResult = determineTurnResult(userChoice, computers);
    
    if(turnResult === 'win') stats.wins++;
    else if(turnResult === 'lose') stats.losses++;
    else stats.draws++;
    
    saveStats(stats);
    updateStatsUI(stats);

    if (ui.gameMode.value !== 'normal') {
        if (turnResult === 'win') matchState.score.user++;
        else if (turnResult === 'lose') matchState.score.computer++;
    }

    addToHistory(userChoice, computers, turnResult);

    let matchOverMsg = null;
    if (ui.gameMode.value !== 'normal') {
        const targetWins = ui.gameMode.value === 'bestOf3' ? 2 : 3;
        if (matchState.score.user >= targetWins || matchState.score.computer >= targetWins) {
            const finalWin = matchState.score.user > matchState.score.computer;
            matchOverMsg = {
                text: finalWin ? `🏆 최종 승리! (${matchState.score.user} : ${matchState.score.computer})` : `💀 최종 패배... (${matchState.score.user} : ${matchState.score.computer})`,
                success: finalWin
            };
            ui.playAgainBtn.textContent = "새로운 게임 시작";
        } else {
            ui.playAgainBtn.textContent = "다음 라운드";
        }
    } else {
        ui.playAgainBtn.textContent = "다시 하기";
    }

    showResultUI(userChoice, computers, turnResult, matchOverMsg);
    
    if (currentFilter !== 'all') setFilter('all');
}

function handleNext() {
    const mode = ui.gameMode.value;
    const targetWins = mode === 'bestOf3' ? 2 : (mode === 'bestOf5' ? 3 : Infinity);
    
    if (matchState.score.user >= targetWins || matchState.score.computer >= targetWins) {
        resetMatch();
    } else {
        nextTurn();
    }
}

function startMatch() {
    matchState = {
        isActive: true,
        round: 1,
        score: { user: 0, computer: 0 }
    };
    
    const mode = ui.gameMode.value;
    const totalRounds = mode === 'bestOf3' ? 3 : (mode === 'bestOf5' ? 5 : 0);
    updateRoundStatusUI(1, totalRounds, mode !== 'normal');
}

function nextTurn() {
    resetViewUI();
    if (matchState.isActive) {
        matchState.round++;
        const mode = ui.gameMode.value;
        const totalRounds = mode === 'bestOf3' ? 3 : (mode === 'bestOf5' ? 5 : 0);
        updateRoundStatusUI(matchState.round, totalRounds, mode !== 'normal');
    }
}

function resetMatch() {
    matchState = {
        isActive: false,
        round: 1,
        score: { user: 0, computer: 0 }
    };
    updateRoundStatusUI(1, 0, false);
    resetViewUI();
}

function addToHistory(user, computers, result) {
    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const record = {
        time: timeStr,
        user,
        computers,
        result
    };
    
    history.unshift(record);
    if(history.length > 50) history.pop();
    saveHistory(history);
    renderHistoryUI(history, currentFilter);
}

function setFilter(type) {
    currentFilter = type;
    updateFilterUI(type);
    renderHistoryUI(history, type);
}

// UI Functions
function updateStatsUI(s) {
    const total = s.wins + s.losses + s.draws;
    const rate = total === 0 ? 0 : Math.round((s.wins / total) * 100);
    
    ui.wins.textContent = s.wins;
    ui.losses.textContent = s.losses;
    ui.draws.textContent = s.draws;
    ui.rate.textContent = `${rate}%`;
}

function updateFilterUI(activeFilter) {
    [ui.btnAll, ui.btnWin, ui.btnLose, ui.btnDraw].forEach(btn => btn.classList.remove('active'));
    
    let titleText = '전체 히스토리';
    if (activeFilter === 'all') ui.btnAll.classList.add('active');
    else if (activeFilter === 'win') { ui.btnWin.classList.add('active'); titleText = '승리 히스토리'; }
    else if (activeFilter === 'lose') { ui.btnLose.classList.add('active'); titleText = '패배 히스토리'; }
    else if (activeFilter === 'draw') { ui.btnDraw.classList.add('active'); titleText = '무승부 히스토리'; }
    
    ui.historyTitle.textContent = `📜 ${titleText}`;
}

function showResultUI(user, computers, result, matchMsg) {
    ui.choices.classList.add('hidden');
    ui.resultArea.classList.remove('hidden');
    ui.playAgainBtn.classList.remove('hidden');

    ui.resultGrid.innerHTML = '';
    
    if (matchMsg) {
        ui.resultMessage.textContent = matchMsg.text;
        ui.resultMessage.style.color = matchMsg.success ? 'var(--accent-color)' : 'var(--danger-color)';
    } else {
        if (result === 'win') {
            ui.resultMessage.textContent = '이겼습니다!';
            ui.resultMessage.style.color = 'var(--accent-color)';
        } else if (result === 'lose') {
            ui.resultMessage.textContent = '졌습니다...';
            ui.resultMessage.style.color = 'var(--danger-color)';
        } else {
            ui.resultMessage.textContent = '비겼습니다';
            ui.resultMessage.style.color = '#94a3b8';
        }
    }

    const allPicks = [user, ...computers];
    const uniquePicks = [...new Set(allPicks)];
    let winningPick = null;
    if (uniquePicks.length === 2) {
        winningPick = getWinningPick(uniquePicks[0], uniquePicks[1]);
    }

    ui.resultGrid.appendChild(createCard('나', user, user === winningPick));
    computers.forEach((cpu, idx) => {
        ui.resultGrid.appendChild(createCard(`CPU ${idx+1}`, cpu, cpu === winningPick));
    });
}

function resetViewUI() {
    ui.resultArea.classList.add('hidden');
    ui.playAgainBtn.classList.add('hidden');
    ui.choices.classList.remove('hidden');
    
    ui.choices.animate([
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 300 });
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

function renderHistoryUI(h, filter) {
    ui.historyList.innerHTML = '';
    
    const filtered = h.filter(item => filter === 'all' || item.result === filter);

    if(filtered.length === 0) {
        ui.historyList.innerHTML = '<li style="padding:1rem; opacity:0.5; text-align:center;">표시할 기록이 없습니다.</li>';
        return;
    }
    
    filtered.forEach(item => {
        const li = document.createElement('li');
        li.className = 'history-item';
        
        const resultClass = item.result === 'win' ? 'win-text' : (item.result === 'lose' ? 'lose-text' : 'draw-text');
        const resultLabel = item.result === 'win' ? 'WIN' : (item.result === 'lose' ? 'LOSE' : 'DRAW');
        const cpuIcons = item.computers.map(c => icons[c]).join(' ');
        
        li.innerHTML = `
            <span class="history-time">${item.time}</span>
            <span class="history-result ${resultClass}">${resultLabel}</span>
            <div class="history-detail">
                <span>나: ${icons[item.user]}</span>
                <span style="opacity:0.3">vs</span>
                <span style="font-size:0.9rem">${cpuIcons}</span>
            </div>
        `;
        ui.historyList.appendChild(li);
    });
    
    ui.historyList.classList.remove('hidden');
}

function createCard(name, pick, isWinner) {
    const div = document.createElement('div');
    div.className = `player-pick ${isWinner ? 'winner-glow' : ''}`;
    div.innerHTML = `
        <span class="pick-label">${name}</span>
        <div class="icon">${icons[pick]}</div>
    `;
    return div;
}
