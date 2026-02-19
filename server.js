const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('.'));

const rooms = {};

// Helper to determine the winner among multiple picks
function determineMultiplayerResult(moves) {
    const pickers = Object.keys(moves);
    const allPicks = pickers.map(id => moves[id]);
    const uniquePicks = [...new Set(allPicks)];

    // Draw conditions: 3 types present or only 1 type present
    if (uniquePicks.length === 1 || uniquePicks.length === 3) {
        return { type: 'draw', winners: [] };
    }

    // Exactly 2 types present
    const [a, b] = uniquePicks;
    let winningPick;
    
    if ((a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'rock')) winningPick = 'rock';
    else if ((a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'scissors')) winningPick = 'scissors';
    else winningPick = 'paper';

    const winners = pickers.filter(id => moves[id] === winningPick);
    return { type: 'win', winningPick, winners };
}

// Helper to ensure unique nicknames in a room
function getUniqueNickname(room, requestedName) {
    let name = requestedName || "Player";
    let finalName = name;
    let counter = 1;
    
    while (room.players.some(p => p.nickname === finalName)) {
        finalName = `${name} (${counter})`;
        counter++;
    }
    return finalName;
}

io.on('connection', (socket) => {
    console.log('a user connected', socket.id);

    socket.on('create_room', ({ nickname }) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const baseName = nickname || "Player";
        
        rooms[roomId] = {
            players: [],
            moves: {},
            gameMode: 'normal',
            survivalType: 'lastLosing', // 'lastLosing' or 'lastWinning'
            host: socket.id,
            survivorIds: [],
            matchFinishedIds: []
        };
        
        const uniqueName = getUniqueNickname(rooms[roomId], baseName);
        rooms[roomId].players.push({ id: socket.id, nickname: uniqueName, isHost: true });
        
        socket.join(roomId);
        socket.emit('room_created', roomId);
        socket.emit('player_count_updated', 1);
        socket.emit('player_list_update', rooms[roomId].players);
    });

    socket.on('join_room', ({ roomId, nickname }) => {
        const room = rooms[roomId];
        if (room && room.players.length < 10) {
            if (!room.players.find(p => p.id === socket.id)) {
                const baseName = nickname || "Player";
                const uniqueName = getUniqueNickname(room, baseName);
                
                room.players.push({ id: socket.id, nickname: uniqueName, isHost: false });
                socket.join(roomId);

                // If 3+ players, force normal mode
                if (room.players.length >= 3) {
                    room.gameMode = 'normal';
                    io.to(roomId).emit('game_mode_sync', 'normal');
                }
            }

            io.to(roomId).emit('player_list_update', room.players);
            socket.emit('game_mode_sync', room.gameMode);
            socket.emit('survival_type_sync', room.survivalType);
            io.to(roomId).emit('game_start', { players: room.players });
        } else {
            socket.emit('error', room ? 'Room is full' : 'Room not found');
        }
    });

    socket.on('reset_game', (roomId) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            // Only clear survivors if the previous match was fully over
            // (If survivors exist, we are in the middle of a survival sequence)
            if (room.survivorIds.length === 0) {
                room.matchFinishedIds = [];
            }
            io.to(roomId).emit('game_reset');
        }
    });

    socket.on('update_game_mode', ({ roomId, mode }) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            if (room.players.length >= 3 && mode !== 'normal') {
                return socket.emit('error', '3명 이상의 플레이어는 기본(단판) 모드만 가능합니다.');
            }
            room.gameMode = mode;
            socket.to(roomId).emit('game_mode_sync', mode);
        }
    });

    socket.on('update_survival_type', ({ roomId, type }) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            room.survivalType = type;
            socket.to(roomId).emit('survival_type_sync', type);
        }
    });

    socket.on('player_move', ({ roomId, move }) => {
        const room = rooms[roomId];
        if (!room) return;
        
        // Initialize survivors if it's the start of a match
        if (room.survivorIds.length === 0 && room.matchFinishedIds.length === 0) {
            room.survivorIds = room.players.map(p => p.id);
        }

        // Only allowed to move if you are an active survivor
        if (!room.survivorIds.includes(socket.id)) return;

        room.moves[socket.id] = move;
        socket.to(roomId).emit('opponent_moved', { playerId: socket.id });

        if (Object.keys(room.moves).length === room.survivorIds.length) {
            const result = determineMultiplayerResult(room.moves);
            
            let losers = [];
            let winners = [];
            let isFinalMatchResult = false;

            if (result.type === 'win') {
                winners = result.winners;
                losers = room.survivorIds.filter(id => !winners.includes(id));
                
                if (room.players.length >= 3) {
                    if (room.survivalType === 'lastLosing') {
                        // 벌칙: 승리자가 탈출, 패배자가 남음
                        room.matchFinishedIds.push(...winners);
                        room.survivorIds = losers;
                    } else {
                        // 우승: 패배자가 탈락, 승리자가 남음
                        room.matchFinishedIds.push(...losers);
                        room.survivorIds = winners;
                    }

                    if (room.survivorIds.length <= 1) {
                        isFinalMatchResult = true;
                    }
                } else {
                    isFinalMatchResult = true;
                }
            } else {
                // Draw: Everyone continues
                if (room.survivorIds.length === 0) isFinalMatchResult = true; // Safety
            }

            io.to(roomId).emit('round_result', {
                moves: room.moves,
                result: result.type,
                winningPick: result.winningPick,
                winners: result.winners,
                survivorIds: room.survivorIds, // Who continues playing
                escapedIds: room.matchFinishedIds, // Who already won
                isFinalMatchResult: isFinalMatchResult
            });

            room.moves = {};
            if (isFinalMatchResult) {
                room.survivorIds = [];
                room.matchFinishedIds = [];
            }
        }
    });


    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const pIdx = room.players.findIndex(p => p.id === socket.id);
            if (pIdx !== -1) {
                room.players.splice(pIdx, 1);
                
                // Also remove from survivors if in a match
                const sIdx = room.survivorIds.indexOf(socket.id);
                if (sIdx !== -1) room.survivorIds.splice(sIdx, 1);
                
                if (room.players.length === 0) {
                    delete rooms[roomId];
                } else {
                    if (room.host === socket.id) {
                        room.host = room.players[0].id;
                        room.players[0].isHost = true;
                        io.to(room.host).emit('you_are_host');
                    }
                    
                    io.to(roomId).emit('player_count_updated', room.players.length);
                    io.to(roomId).emit('player_list_update', room.players);
                    socket.to(roomId).emit('opponent_disconnected', { playerId: socket.id });
                }
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`listening on *:${PORT}`);
});
