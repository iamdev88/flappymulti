const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static frontend files from the root directory
app.use(express.static(path.join(__dirname, '.')));

const PORT = process.env.PORT || 3000;

// STATE MANAGEMENT
const rooms = new Map(); // roomCode -> RoomObj
const socketToPlayerMap = new Map(); // socket.id -> { roomCode, playerId }
const reconnectMap = new Map(); // playerId -> { roomCode, timeoutId, playerObj }

// Helper: Generates unique 6-character room codes
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));
    return code;
}

// Helper: Safely cleans up rooms
function cleanupRoom(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.players.length === 0) {
        rooms.delete(roomCode);
        console.log(`[Room ${roomCode}] Cleaned up empty room.`);
    }
}

// Helper: Promotes new host if previous left
function migrateHost(room) {
    if (room.players.length > 0) {
        const oldHostId = room.hostId;
        const newHost = room.players[0];
        room.hostId = newHost.id;
        console.log(`[Room ${room.roomCode}] Host migrated from ${oldHostId} to ${newHost.id} (${newHost.name})`);
    }
}

io.on('connection', (socket) => {
    console.log(`[Socket Connected] ID: ${socket.id}`);

    // CREATE ROOM
    socket.on('create_room', ({ playerName, skin, playerId }) => {
        const code = generateRoomCode();
        const playerObj = {
            id: socket.id,
            playerId: playerId, // persistent client GUID
            name: playerName,
            skin: skin,
            ready: false,
            score: 0,
            isDead: false,
            y: 300,
            rotation: 0,
            lastScoreTime: 0
        };

        const roomObj = {
            roomCode: code,
            hostId: socket.id,
            isPlaying: false,
            seed: Math.floor(Math.random() * 1000000),
            players: [playerObj]
        };

        rooms.set(code, roomObj);
        socketToPlayerMap.set(socket.id, { roomCode: code, playerId });
        
        socket.join(code);
        socket.emit('room_created', { roomCode: code, players: roomObj.players, hostId: roomObj.hostId });
        console.log(`[Room Created] ${code} by ${playerName} (socket: ${socket.id})`);
    });

    // JOIN ROOM
    socket.on('join_room', ({ roomCode, playerName, skin, playerId }) => {
        const code = roomCode.toUpperCase().trim();
        const room = rooms.get(code);

        if (!room) {
            return socket.emit('join_error', { message: 'Room not found.' });
        }
        if (room.isPlaying) {
            return socket.emit('join_error', { message: 'Match is already in progress.' });
        }
        if (room.players.length >= 4) {
            return socket.emit('join_error', { message: 'Room is full (max 4 players).' });
        }

        // Add player
        const playerObj = {
            id: socket.id,
            playerId: playerId,
            name: playerName,
            skin: skin,
            ready: false,
            score: 0,
            isDead: false,
            y: 300,
            rotation: 0,
            lastScoreTime: 0
        };

        room.players.push(playerObj);
        socketToPlayerMap.set(socket.id, { roomCode: code, playerId });
        
        socket.join(code);
        
        socket.emit('room_joined', { roomCode: code, players: room.players, hostId: room.hostId });
        socket.to(code).emit('room_update', { players: room.players, hostId: room.hostId });
        
        console.log(`[Player Joined] ${playerName} joined ${code} (players: ${room.players.length})`);
    });

    // TOGGLE READY STATUS
    socket.on('toggle_ready', () => {
        const mapping = socketToPlayerMap.get(socket.id);
        if (!mapping) return;

        const room = rooms.get(mapping.roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        player.ready = !player.ready;
        io.to(mapping.roomCode).emit('room_update', { players: room.players, hostId: room.hostId });
    });

    // RECONNECT TO EXISTING MATCH
    socket.on('reconnect_player', ({ playerId, roomCode }) => {
        const code = roomCode.toUpperCase().trim();
        const recondata = reconnectMap.get(playerId);

        if (recondata && recondata.roomCode === code) {
            // Cancel timeout
            clearTimeout(recondata.timeoutId);
            reconnectMap.delete(playerId);

            const room = rooms.get(code);
            if (room) {
                // Update player socket reference
                const player = room.players.find(p => p.playerId === playerId);
                if (player) {
                    player.id = socket.id;
                    socketToPlayerMap.set(socket.id, { roomCode: code, playerId });
                    socket.join(code);

                    console.log(`[Reconnected] Player ${player.name} reconnected (new ID: ${socket.id})`);
                    
                    // Reply current room status
                    socket.emit('reconnect_success', {
                        roomCode: code,
                        players: room.players,
                        hostId: room.hostId,
                        isPlaying: room.isPlaying,
                        seed: room.seed
                    });

                    // Update others
                    socket.to(code).emit('room_update', { players: room.players, hostId: room.hostId });
                    return;
                }
            }
        }
        socket.emit('reconnect_failed');
    });

    // START MATCH
    socket.on('start_match', () => {
        const mapping = socketToPlayerMap.get(socket.id);
        if (!mapping) return;

        const room = rooms.get(mapping.roomCode);
        if (!room) return;

        // Verify host
        if (room.hostId !== socket.id) return;

        // Verify everyone is ready
        const allReady = room.players.every(p => p.ready || p.id === room.hostId);
        if (!allReady) return;

        // Mark match active
        room.isPlaying = true;
        room.seed = Math.floor(Math.random() * 1000000); // fresh seed for this match
        
        // Reset player in-game statistics
        room.players.forEach(p => {
            p.score = 0;
            p.isDead = false;
            p.y = 300;
            p.rotation = 0;
            p.lastScoreTime = Date.now();
        });

        io.to(mapping.roomCode).emit('match_started', { seed: room.seed, players: room.players });
        console.log(`[Match Started] Room ${mapping.roomCode} initialized with seed ${room.seed}`);
    });

    // LEAVE ROOM EXPLICITLY
    socket.on('leave_room', () => {
        handleDisconnectOrLeave(socket);
    });

    // GAME STATE BROADCAST CLIENT TO SERVER
    socket.on('player_update', ({ y, rotation, score, isDead }) => {
        const mapping = socketToPlayerMap.get(socket.id);
        if (!mapping) return;

        const room = rooms.get(mapping.roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (player.isDead) return;

        // Update basic physics parameters
        player.y = y;
        player.rotation = rotation;
        player.isDead = isDead;

        // Anti-Cheat: Validate score progression
        if (score > player.score) {
            const timeDelta = Date.now() - player.lastScoreTime;
            const scoreJump = score - player.score;

            // 1. Check for impossible score jumps (e.g. hack adding +10 at once)
            // 2. Check for impossible frequencies (e.g. scoring multiple times within 1 second)
            if (scoreJump > 1 || timeDelta < 900) {
                console.warn(`[ANTI-CHEAT] Rejecting score anomaly for ${player.name}: Jump: +${scoreJump}, Delta: ${timeDelta}ms`);
                // Force sync actual valid score back to player to reset their display
                socket.emit('sync_score_rollback', { score: player.score });
            } else {
                player.score = score;
                player.lastScoreTime = Date.now();
            }
        }
    });

    // EXPLICIT COLLISION elimination
    socket.on('player_die', ({ score }) => {
        const mapping = socketToPlayerMap.get(socket.id);
        if (!mapping) return;

        const room = rooms.get(mapping.roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.isDead = true;
            player.score = score;
            console.log(`[Player Eliminated] ${player.name} in Room ${mapping.roomCode} (Score: ${score})`);

            // Check if everyone is dead
            const allDead = room.players.every(p => p.isDead);
            if (allDead) {
                room.isPlaying = false;
                // Gather results ranking
                const results = [...room.players]
                    .sort((a, b) => b.score - a.score)
                    .map((p, idx) => ({ rank: idx + 1, name: p.name, score: p.score, skin: p.skin }));
                
                io.to(mapping.roomCode).emit('match_over', { results });
                console.log(`[Match Over] Room ${mapping.roomCode} finished. Rankings sent.`);
            }
        }
    });

    // DISCONNECT HANDLING
    socket.on('disconnect', () => {
        console.log(`[Socket Disconnected] ID: ${socket.id}`);
        
        const mapping = socketToPlayerMap.get(socket.id);
        if (!mapping) return;

        const room = rooms.get(mapping.roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        console.log(`[Disconnect Buffer] Player ${player.name} (ID: ${player.playerId}) disconnected. Waiting 10s reconnect window...`);

        // Setup 10-second grace window for player reconnect
        const timeoutId = setTimeout(() => {
            // Remove player if not reconnected within limit
            console.log(`[Disconnect Timeout] Player ${player.name} failed to reconnect. Removing.`);
            removePlayer(socket.id, mapping.roomCode, player.playerId);
            reconnectMap.delete(player.playerId);
        }, 10000);

        reconnectMap.set(player.playerId, {
            roomCode: mapping.roomCode,
            timeoutId,
            playerObj: player
        });

        // Clean mapping references
        socketToPlayerMap.delete(socket.id);
    });
});

function handleDisconnectOrLeave(socket) {
    const mapping = socketToPlayerMap.get(socket.id);
    if (!mapping) return;

    removePlayer(socket.id, mapping.roomCode, mapping.playerId);
    socketToPlayerMap.delete(socket.id);
    socket.leave(mapping.roomCode);
}

function removePlayer(socketId, roomCode, playerId) {
    const room = rooms.get(roomCode);
    if (!room) return;

    // Filter player out
    const idx = room.players.findIndex(p => p.id === socketId || p.playerId === playerId);
    if (idx !== -1) {
        const removedPlayer = room.players.splice(idx, 1)[0];
        console.log(`[Room ${roomCode}] Removed player ${removedPlayer.name}`);

        if (room.players.length === 0) {
            cleanupRoom(roomCode);
        } else {
            // If host left, assign new host
            if (room.hostId === socketId) {
                migrateHost(room);
            }
            io.to(roomCode).emit('room_update', { players: room.players, hostId: room.hostId });
        }
    }
}

// 15HZ (66MS) MULTIPLAYER SYNC TIMELINE BROADCASTER
setInterval(() => {
    rooms.forEach((room, roomCode) => {
        if (room.isPlaying) {
            // Broadcast client states to all room members
            const syncPayload = {};
            room.players.forEach(p => {
                syncPayload[p.id] = {
                    name: p.name,
                    y: p.y,
                    rotation: p.rotation,
                    score: p.score,
                    isDead: p.isDead,
                    skin: p.skin
                };
            });
            io.to(roomCode).emit('match_sync', { states: syncPayload });
        }
    });
}, 66);

server.listen(PORT, () => {
    console.log(`[Server Running] Hosting on http://localhost:${PORT}`);
});
