// script.js

// 1. SKIN DEFINITIONS
const SKINS = {
    default: { id: 'default', name: 'Classic Yellow', price: 0, filter: 'none' },
    aqua: { id: 'aqua', name: 'Blue Splash', price: 50, filter: 'hue-rotate(180deg)' },
    emerald: { id: 'emerald', name: 'Emerald Green', price: 100, filter: 'hue-rotate(90deg)' },
    purple: { id: 'purple', name: 'Royal Purple', price: 150, filter: 'hue-rotate(240deg)' },
    crimson: { id: 'crimson', name: 'Crimson Fire', price: 200, filter: 'hue-rotate(300deg)' },
    gold: { id: 'gold', name: 'Shiny Gold', price: 350, filter: 'hue-rotate(20deg) brightness(1.3) contrast(1.5) saturate(2)' }
};

// 2. STORAGE MANAGER FOR DATA PERSISTENCE
class StorageManager {
    static getHighScore() {
        return parseInt(localStorage.getItem('flappy_high_score')) || 0;
    }
    static setHighScore(val) {
        localStorage.setItem('flappy_high_score', val);
    }
    static getCoins() {
        const c = localStorage.getItem('flappy_coins');
        return c === null ? 100 : parseInt(c); // Start with 100 coins
    }
    static setCoins(val) {
        localStorage.setItem('flappy_coins', val);
    }
    static getOwnedSkins() {
        const s = localStorage.getItem('flappy_owned_skins');
        return s ? JSON.parse(s) : ['default'];
    }
    static setOwnedSkins(arr) {
        localStorage.setItem('flappy_owned_skins', JSON.stringify(arr));
    }
    static getActiveSkin() {
        return localStorage.getItem('flappy_active_skin') || 'default';
    }
    static setActiveSkin(val) {
        localStorage.setItem('flappy_active_skin', val);
    }
    static getMusicEnabled() {
        const val = localStorage.getItem('flappy_music_enabled');
        return val === null ? true : val === 'true';
    }
    static setMusicEnabled(val) {
        localStorage.setItem('flappy_music_enabled', val);
    }
    static getSoundEnabled() {
        const val = localStorage.getItem('flappy_sound_enabled');
        return val === null ? true : val === 'true';
    }
    static setSoundEnabled(val) {
        localStorage.setItem('flappy_sound_enabled', val);
    }
    static getPlayerName() {
        return localStorage.getItem('flappy_player_name') || '';
    }
    static setPlayerName(val) {
        localStorage.setItem('flappy_player_name', val);
    }
    static getPlayerUuid() {
        let uuid = localStorage.getItem('flappy_player_uuid');
        if (!uuid) {
            uuid = 'player_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('flappy_player_uuid', uuid);
        }
        return uuid;
    }
}

// Seeded Pseudo-Random Number Generator for identical pipe spawning
class SeededRandom {
    constructor(seed) {
        this.seed = seed;
    }
    next() {
        const x = Math.sin(this.seed++) * 10000;
        return x - Math.floor(x);
    }
    nextRange(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

// 3. AUDIO CONTROLLER (Web Audio API Synthesizer)
class AudioController {
    constructor() {
        this.ctx = null;
        this.musicEnabled = StorageManager.getMusicEnabled();
        this.soundEnabled = StorageManager.getSoundEnabled();
        this.musicInterval = null;
        
        this.notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
        this.melody = [
            0, 2, 4, 3, 5, 4, 2, 1,
            0, 2, 3, 4, 3, 2, 1, 0,
            2, 4, 5, 4, 3, 2, 1, 2,
            3, 4, 3, 2, 1, 0, 1, 2
        ];
    }

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.startMusic();
    }

    setMusic(enabled) {
        this.musicEnabled = enabled;
        StorageManager.setMusicEnabled(enabled);
        if (enabled) {
            this.startMusic();
        } else {
            this.stopMusic();
        }
    }

    setSound(enabled) {
        this.soundEnabled = enabled;
        StorageManager.setSoundEnabled(enabled);
    }

    playFlap() {
        if (!this.soundEnabled || !this.ctx) return;
        this.playTone(180, 450, 0.12, 'triangle', 0.12);
    }

    playScore() {
        if (!this.soundEnabled || !this.ctx) return;
        this.playTone(987.77, 1318.51, 0.08, 'sine', 0.08); 
    }

    playHit() {
        if (!this.soundEnabled || !this.ctx) return;
        this.playTone(180, 40, 0.4, 'sawtooth', 0.15);
    }

    playTone(startFreq, endFreq, duration, type = 'sine', volume = 0.1) {
        try {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
            if (endFreq !== startFreq) {
                osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
            }
            
            gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            
            osc.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.error("Tone playback failed:", e);
        }
    }

    startMusic() {
        if (!this.musicEnabled) return;
        this.stopMusic();
        
        let beat = 0;
        this.musicInterval = setInterval(() => {
            if (!this.musicEnabled || !this.ctx) return;
            try {
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
                
                const noteVal = this.melody[beat % this.melody.length];
                const freq = this.notes[noteVal % this.notes.length];
                
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                
                gain.gain.setValueAtTime(0.015, this.ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.22);
                
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.25);
                
                beat++;
            } catch (e) {
                console.error("Music synthesis error:", e);
            }
        }, 220); 
    }

    stopMusic() {
        if (this.musicInterval) {
            clearInterval(this.musicInterval);
            this.musicInterval = null;
        }
    }
}

// 4. GAME OBJECTS
class Bird {
    constructor(game) {
        this.game = game;
        this.x = this.game.width * 0.2;
        this.y = this.game.height / 2;
        this.velocity = 0;
        this.gravity = 0.5;
        this.jumpForce = -8;
        
        this.width = 60;
        this.height = 60;
        this.rotation = 0;
        
        // Preloaded DOM Images
        this.imgIdle = document.getElementById('img-bird-idle');
        this.imgFly1 = document.getElementById('img-bird-fly-1');
        this.imgFly2 = document.getElementById('img-bird-fly-2');
        this.imgDead = document.getElementById('img-bird-dead');
        
        this.state = 'idle'; // idle, flying, dead
        this.frameCounter = 0;
    }

    flap() {
        if (this.state !== 'dead') {
            this.velocity = this.jumpForce;
            this.state = 'flying';
            this.frameCounter = 0;
            this.game.audio.playFlap();
            this.game.particleManager.spawnParticles(this.x, this.y + this.height/2);
        }
    }

    update() {
        this.velocity += this.gravity;
        this.y += this.velocity;
        
        // Rotation based on velocity
        if (this.velocity < 0) {
            this.rotation = Math.max(-0.4, this.velocity * 0.1);
        } else {
            this.rotation = Math.min(Math.PI / 2, this.velocity * 0.05);
        }

        // Floor collision
        if (this.y + this.height/2 >= this.game.height - this.game.groundHeight) {
            this.y = this.game.height - this.game.groundHeight - this.height/2;
            if (this.state !== 'dead') {
                this.die();
            }
        }
        
        // Ceiling collision
        if (this.y - this.height/2 <= 0) {
            this.y = this.height/2;
            this.velocity = 0;
        }

        this.frameCounter++;
        if (this.state === 'flying' && this.frameCounter > 15 && this.velocity > 0) {
            this.state = 'idle';
        }
    }

    die() {
        this.state = 'dead';
        this.game.audio.playHit();
        this.game.gameOver();
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Apply skin-specific CSS filter tint
        const activeSkinId = StorageManager.getActiveSkin();
        const skin = SKINS[activeSkinId] || SKINS.default;
        ctx.filter = skin.filter;

        let img = this.imgIdle;
        if (this.state === 'dead') {
            img = this.imgDead;
        } else if (this.state === 'flying') {
            if (Math.floor(this.frameCounter / 5) % 2 === 0) {
                img = this.imgFly1;
            } else {
                img = this.imgFly2;
            }
        }
        
        ctx.drawImage(img, -this.width/2, -this.height/2, this.width, this.height);
        ctx.restore();
    }
}

class PipeManager {
    constructor(game) {
        this.game = game;
        this.pipes = [];
        this.pipeWidth = 70;
        this.gap = 180;
        this.speed = 3;
        this.spawnTimer = 0;
        this.spawnInterval = 100;
    }

    reset() {
        this.pipes = [];
        this.spawnTimer = 0;
    }

    update() {
        // Multiplayers continue updates even if local player is dead (to allow spectating)
        if (this.game.state !== 'playing' && this.game.state !== 'spectating_mp') return;

        this.spawnTimer++;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            this.spawnPipe();
        }

        for (let i = this.pipes.length - 1; i >= 0; i--) {
            let p = this.pipes[i];
            p.x -= this.speed;
            
            // Check collision (only if client is alive)
            if (this.game.state === 'playing') {
                if (this.checkCollision(p)) {
                    this.game.bird.die();
                }
            }

            // Check score (only if client is alive)
            if (this.game.state === 'playing') {
                if (!p.passed && p.x + this.pipeWidth < this.game.bird.x) {
                    p.passed = true;
                    this.game.addScore();
                }
            }

            // Remove offscreen
            if (p.x + this.pipeWidth < 0) {
                this.pipes.splice(i, 1);
            }
        }
    }

    spawnPipe() {
        const minHeight = 50;
        const maxHeight = this.game.height - this.game.groundHeight - minHeight - this.gap;
        
        let topHeight;
        if (this.game.mode === 'multiplayer') {
            // Seeded deterministic logic
            topHeight = this.game.seededRandom.nextRange(minHeight, maxHeight);
        } else {
            // Solo legacy math
            topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1) + minHeight);
        }
        
        this.pipes.push({
            x: this.game.width,
            topHeight: topHeight,
            passed: false
        });
    }

    checkCollision(pipe) {
        const bird = this.game.bird;
        const bx = bird.x - bird.width/2 + 10;
        const by = bird.y - bird.height/2 + 10;
        const bw = bird.width - 20;
        const bh = bird.height - 20;
        
        if (bx < pipe.x + this.pipeWidth &&
            bx + bw > pipe.x &&
            by < pipe.topHeight) {
            return true;
        }
        
        if (bx < pipe.x + this.pipeWidth &&
            bx + bw > pipe.x &&
            by + bh > pipe.topHeight + this.gap) {
            return true;
        }
        
        return false;
    }

    draw(ctx) {
        ctx.fillStyle = '#73BF2E';
        ctx.strokeStyle = '#548C22';
        ctx.lineWidth = 4;
        
        for (let p of this.pipes) {
            ctx.fillRect(p.x, 0, this.pipeWidth, p.topHeight);
            ctx.strokeRect(p.x, 0, this.pipeWidth, p.topHeight);
            ctx.fillRect(p.x - 4, p.topHeight - 20, this.pipeWidth + 8, 20);
            ctx.strokeRect(p.x - 4, p.topHeight - 20, this.pipeWidth + 8, 20);
            
            const bottomY = p.topHeight + this.gap;
            const bottomHeight = this.game.height - this.game.groundHeight - bottomY;
            
            ctx.fillRect(p.x, bottomY, this.pipeWidth, bottomHeight);
            ctx.strokeRect(p.x, bottomY, this.pipeWidth, bottomHeight);
            ctx.fillRect(p.x - 4, bottomY, this.pipeWidth + 8, 20);
            ctx.strokeRect(p.x - 4, bottomY, this.pipeWidth + 8, 20);
        }
    }
}

class Environment {
    constructor(game) {
        this.game = game;
        this.bgX = 0;
        this.groundX = 0;
        this.bgSpeed = 0.5;
        this.groundSpeed = 3;
    }

    update() {
        if (this.game.state !== 'playing' && this.game.state !== 'spectating_mp') return;
        
        this.bgX -= this.bgSpeed;
        if (this.bgX <= -this.game.width) {
            this.bgX += this.game.width;
        }
        
        this.groundX -= this.groundSpeed;
        if (this.groundX <= -this.game.width) {
            this.groundX += this.game.width;
        }
    }

    drawBackground(ctx) {
        ctx.fillStyle = '#71C5CF';
        ctx.fillRect(0, 0, this.game.width, this.game.height);
        
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.5;
        this.drawCloud(ctx, this.bgX + 100, 150, 40);
        this.drawCloud(ctx, this.bgX + this.game.width + 100, 150, 40);
        this.drawCloud(ctx, this.bgX + 300, 100, 30);
        this.drawCloud(ctx, this.bgX + this.game.width + 300, 100, 30);
        ctx.globalAlpha = 1;
    }

    drawCloud(ctx, x, y, size) {
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.arc(x + size, y - size/2, size, 0, Math.PI * 2);
        ctx.arc(x + size*2, y, size, 0, Math.PI * 2);
        ctx.fill();
    }

    drawGround(ctx) {
        ctx.fillStyle = '#DED895';
        const gy = this.game.height - this.game.groundHeight;
        
        ctx.fillRect(this.groundX, gy, this.game.width, this.game.groundHeight);
        ctx.fillRect(this.groundX + this.game.width, gy, this.game.width, this.game.groundHeight);
        
        ctx.fillStyle = '#73BF2E';
        ctx.fillRect(this.groundX, gy, this.game.width, 15);
        ctx.fillRect(this.groundX + this.game.width, gy, this.game.width, 15);
        
        ctx.strokeStyle = '#C9C27D';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < this.game.width * 2; i += 40) {
            let x = this.groundX + i;
            ctx.moveTo(x + 20, gy + 15);
            ctx.lineTo(x, this.game.height);
        }
        ctx.stroke();
    }
}

class ParticleManager {
    constructor(game) {
        this.game = game;
        this.particles = [];
    }

    spawnParticles(x, y) {
        for (let i = 0; i < 5; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 1.0
            });
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.05;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let p of this.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.life * 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// 5. MAIN GAME LOOP AND UI COORDINATOR
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.groundHeight = 100;
        this.state = 'start'; // start, playing, gameover, spectating_mp
        this.mode = 'solo'; // solo, multiplayer
        this.score = 0;
        this.seededRandom = null;

        // Multiplayer state structures
        this.socket = null;
        this.playerId = null;
        this.hostId = null;
        this.activeRoomCode = null;
        this.playersList = [];
        this.remotePlayers = new Map(); // socket.id -> RemotePlayerObj
        this.lastNetworkSyncTime = 0;

        // Subsystems
        this.audio = new AudioController();
        this.bird = new Bird(this);
        this.pipeManager = new PipeManager(this);
        this.environment = new Environment(this);
        this.particleManager = new ParticleManager(this);

        // Fetch UI Elements
        this.hud = document.getElementById('hud');
        this.scoreEl = document.getElementById('score');
        this.lobbyScreen = document.getElementById('lobby-screen');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.finalScoreEl = document.getElementById('final-score');
        this.bestScoreDisplay = document.getElementById('best-score-val');
        this.coinCountEl = document.getElementById('coin-count');
        this.topBar = document.getElementById('top-bar');

        // Multiplayer UI Panels
        this.joinDialog = document.getElementById('join-dialog');
        this.joinDialogTitle = document.getElementById('join-dialog-title');
        this.joinDialogActionBtn = document.getElementById('join-dialog-action-btn');
        this.playerNameInput = document.getElementById('player-name-input');
        this.roomCodeInput = document.getElementById('room-code-input');
        this.codeInputGroup = document.getElementById('code-input-group');
        this.mpLobbyOverlay = document.getElementById('mp-lobby-overlay');
        this.lobbyRoomCodeVal = document.getElementById('lobby-room-code');
        this.lobbyPlayersList = document.getElementById('lobby-players-list');
        this.toggleReadyBtn = document.getElementById('toggle-ready-btn');
        this.startMatchBtn = document.getElementById('start-match-btn');
        this.mpHud = document.getElementById('mp-hud');
        this.mpScoreboard = document.getElementById('mp-scoreboard');
        this.mpGameOverScreen = document.getElementById('mp-game-over-screen');
        this.mpRankingsList = document.getElementById('mp-rankings-list');

        // Overlay Screens
        this.shopOverlay = document.getElementById('shop-overlay');
        this.customizeOverlay = document.getElementById('customize-overlay');
        this.settingsOverlay = document.getElementById('settings-overlay');

        // Settings inputs
        this.musicToggle = document.getElementById('music-toggle');
        this.soundToggle = document.getElementById('sound-toggle');

        this.initUI();
        this.initInputs();
        this.initMultiplayer();
        this.refreshLobbyData();

        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    resize() {
        const container = document.getElementById('game-container');
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    initUI() {
        this.musicToggle.checked = StorageManager.getMusicEnabled();
        this.soundToggle.checked = StorageManager.getSoundEnabled();
        this.playerNameInput.value = StorageManager.getPlayerName();
        this.playerId = StorageManager.getPlayerUuid();
    }

    refreshLobbyData() {
        this.coinCountEl.innerText = StorageManager.getCoins();
        this.bestScoreDisplay.innerText = StorageManager.getHighScore();
    }

    animateCoins() {
        const el = document.getElementById('coin-container');
        el.classList.remove('bounce');
        void el.offsetWidth; // Force CSS repaint
        el.classList.add('bounce');
    }

    // Connects to Socket.IO and binds listeners
    initMultiplayer() {
        // Set dynamic URL mapping based on where site is hosted
        const BACKEND_URL = 'https://flappy-arcade-backend-production.up.railway.app'; // Replace with Railway URL
        const socketUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:3000'
            : (window.location.href.includes('vercel.app') ? BACKEND_URL : window.location.origin);

        this.socket = io(socketUrl, { autoConnect: false });

        // CONNECTION HANDLERS
        this.socket.on('connect', () => {
            console.log("Connected to Socket.IO backend.");
            // Handle automatic rejoining if socket disconnected temporarily
            if (this.activeRoomCode) {
                this.socket.emit('reconnect_player', {
                    playerId: this.playerId,
                    roomCode: this.activeRoomCode
                });
            }
        });

        this.socket.on('reconnect_success', ({ roomCode, players, hostId, isPlaying, seed }) => {
            console.log("Successfully reconnected to match.");
            this.hostId = hostId;
            this.playersList = players;
            this.activeRoomCode = roomCode;
            this.lobbyRoomCodeVal.innerText = roomCode;

            // Reconstruct lobby and game status
            this.updatePlayersLobbyView();

            if (isPlaying) {
                // If they reconnected while playing, transition straight back to spectate/playing mode
                this.mode = 'multiplayer';
                this.seededRandom = new SeededRandom(seed);
                this.state = this.bird.state === 'dead' ? 'spectating_mp' : 'playing';
                
                // Hide lobbies
                this.mpLobbyOverlay.classList.add('hidden');
                this.topBar.style.opacity = '0';
                this.topBar.style.pointerEvents = 'none';
                this.mpHud.classList.remove('hidden');
            } else {
                this.openOverlay(this.mpLobbyOverlay);
            }
        });

        this.socket.on('reconnect_failed', () => {
            console.log("Reconnection window expired.");
            this.activeRoomCode = null;
            this.showLobby();
        });

        // ROOM CREATED
        this.socket.on('room_created', ({ roomCode, players, hostId }) => {
            this.activeRoomCode = roomCode;
            this.hostId = hostId;
            this.playersList = players;
            this.lobbyRoomCodeVal.innerText = roomCode;
            
            this.closeOverlay(this.joinDialog);
            this.openOverlay(this.mpLobbyOverlay);
            this.updatePlayersLobbyView();
        });

        // ROOM JOINED SUCCESS
        this.socket.on('room_joined', ({ roomCode, players, hostId }) => {
            this.activeRoomCode = roomCode;
            this.hostId = hostId;
            this.playersList = players;
            this.lobbyRoomCodeVal.innerText = roomCode;
            
            this.closeOverlay(this.joinDialog);
            this.openOverlay(this.mpLobbyOverlay);
            this.updatePlayersLobbyView();
        });

        // JOIN ERROR
        this.socket.on('join_error', ({ message }) => {
            alert(`Failed to Join: ${message}`);
        });

        // ROOM UPDATE EVENTS (Sync lobbies when members change/toggle ready states)
        this.socket.on('room_update', ({ players, hostId }) => {
            this.playersList = players;
            this.hostId = hostId;
            this.updatePlayersLobbyView();
        });

        // ROLLBACK HACKED/DESYNCED SCORES
        this.socket.on('sync_score_rollback', ({ score }) => {
            this.score = score;
            this.scoreEl.innerText = score;
        });

        // MATCH LAUNCH TRANSITIONS
        this.socket.on('match_started', ({ seed, players }) => {
            this.playersList = players;
            this.mode = 'multiplayer';
            this.seededRandom = new SeededRandom(seed);
            
            // Build Remote Player Maps
            this.remotePlayers.clear();
            players.forEach(p => {
                if (p.id !== this.socket.id) {
                    this.remotePlayers.set(p.id, {
                        name: p.name,
                        y: 300,
                        rotation: 0,
                        targetY: 300,
                        targetRotation: 0,
                        currentY: 300,
                        currentRotation: 0,
                        score: 0,
                        isDead: false,
                        skin: p.skin
                    });
                }
            });

            this.state = 'playing';
            this.score = 0;
            
            this.bird = new Bird(this);
            this.bird.flap();
            this.pipeManager.reset();
            this.pipeManager.speed = 3;

            // Hide Lobbies
            this.mpLobbyOverlay.classList.add('hidden');
            this.topBar.style.opacity = '0';
            this.topBar.style.pointerEvents = 'none';
            this.mpHud.classList.remove('hidden');

            this.updateScoreboardHUD();
        });

        // 15HZ POSITION & SCORE SYNC PACKETS
        this.socket.on('match_sync', ({ states }) => {
            if (this.state !== 'playing' && this.state !== 'spectating_mp') return;

            Object.keys(states).forEach(id => {
                if (id !== this.socket.id) {
                    const remote = this.remotePlayers.get(id);
                    if (remote) {
                        const state = states[id];
                        remote.targetY = state.y;
                        remote.targetRotation = state.rotation;
                        remote.score = state.score;
                        remote.isDead = state.isDead;
                        remote.skin = state.skin;
                    }
                }
            });

            this.updateScoreboardHUD();
        });

        // MATCH OVER - DISPLAY LEADERBOARD
        this.socket.on('match_over', ({ results }) => {
            this.state = 'start';
            this.mpHud.classList.add('hidden');

            // Render rank rows
            this.mpRankingsList.innerHTML = '';
            results.forEach(res => {
                const row = document.createElement('div');
                row.className = `rank-row rank-${res.rank}`;

                const left = document.createElement('div');
                left.className = 'rank-left';

                const badge = document.createElement('div');
                badge.className = 'rank-badge';
                badge.innerText = res.rank;

                const name = document.createElement('div');
                name.className = 'rank-player-name';
                name.innerText = res.name;

                // Add crown symbol to winner
                if (res.rank === 1) {
                    name.innerHTML += ' 👑';
                }

                left.appendChild(badge);
                left.appendChild(name);

                const score = document.createElement('div');
                score.className = 'rank-score';
                score.innerText = `${res.score} pts`;

                row.appendChild(left);
                row.appendChild(score);
                this.mpRankingsList.appendChild(row);
            });

            this.mpGameOverScreen.classList.remove('hidden');
        });
    }

    // Dynamic Lobby Listings Builder
    updatePlayersLobbyView() {
        this.lobbyPlayersList.innerHTML = '';
        
        let allReadyExceptHost = true;
        const localIsHost = this.hostId === this.socket.id;

        this.playersList.forEach(p => {
            const isHost = p.id === this.hostId;
            const isSelf = p.id === this.socket.id;

            const row = document.createElement('div');
            row.className = 'lobby-player-row';

            const info = document.createElement('div');
            info.className = 'player-info-block';

            const preview = document.createElement('canvas');
            preview.className = 'lobby-player-preview';
            preview.width = 32;
            preview.height = 32;
            
            // Draw skin image in lobby
            this.drawSkinPreview(preview, SKINS[p.skin]);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'lobby-player-name';
            nameSpan.innerText = p.name;
            if (isSelf) nameSpan.innerText += ' (YOU)';

            if (isHost) {
                const badge = document.createElement('span');
                badge.className = 'host-badge';
                badge.innerText = 'HOST';
                nameSpan.appendChild(badge);
            }

            info.appendChild(preview);
            info.appendChild(nameSpan);

            const badge = document.createElement('span');
            if (isHost) {
                badge.className = 'status-badge ready';
                badge.innerText = 'HOST';
            } else {
                badge.className = `status-badge ${p.ready ? 'ready' : 'not-ready'}`;
                badge.innerText = p.ready ? 'READY' : 'NOT READY';
                if (!p.ready) allReadyExceptHost = false;
            }

            row.appendChild(info);
            row.appendChild(badge);
            this.lobbyPlayersList.appendChild(row);

            // Update local toggle ready text styling
            if (isSelf) {
                this.toggleReadyBtn.innerText = p.ready ? 'UNREADY' : 'READY';
                this.toggleReadyBtn.style.background = p.ready 
                    ? 'linear-gradient(180deg, #FF5A5F 0%, #C62828 100%)'
                    : '';
            }
        });

        // Control Start button availability
        if (localIsHost) {
            this.startMatchBtn.classList.remove('hidden');
            const canStart = this.playersList.length > 1 && allReadyExceptHost;
            if (canStart) {
                this.startMatchBtn.disabled = false;
                this.startMatchBtn.style.opacity = '1';
                this.startMatchBtn.style.cursor = 'pointer';
            } else {
                this.startMatchBtn.disabled = true;
                this.startMatchBtn.style.opacity = '0.5';
                this.startMatchBtn.style.cursor = 'not-allowed';
            }
        } else {
            this.startMatchBtn.classList.add('hidden');
        }
    }

    // Dynamic Live Scoreboard HUD Updater
    updateScoreboardHUD() {
        this.mpScoreboard.innerHTML = '';

        // Add local player first
        const myRow = document.createElement('div');
        myRow.className = `mp-score-row local-player ${this.bird.state === 'dead' ? 'dead' : ''}`;
        myRow.innerHTML = `
            <span>${this.playerNameInput.value || 'You'}</span>
            <span class="${this.bird.state === 'dead' ? 'mp-score-val dead-status' : 'mp-score-val'}">
                ${this.bird.state === 'dead' ? 'DEAD' : this.score}
            </span>
        `;
        this.mpScoreboard.appendChild(myRow);

        // Add remote players sorted by score
        const sortedRemotes = [...this.remotePlayers.values()].sort((a, b) => b.score - a.score);
        sortedRemotes.forEach(p => {
            const row = document.createElement('div');
            row.className = `mp-score-row ${p.isDead ? 'dead' : ''}`;
            row.innerHTML = `
                <span>${p.name}</span>
                <span class="${p.isDead ? 'mp-score-val dead-status' : 'mp-score-val'}">
                    ${p.isDead ? 'DEAD' : p.score}
                </span>
            `;
            this.mpScoreboard.appendChild(row);
        });
    }

    initInputs() {
        // Solo launcher
        document.getElementById('start-btn').addEventListener('click', () => {
            this.mode = 'solo';
            this.audio.init();
            this.start();
        });

        // Restart buttons
        document.getElementById('restart-btn').addEventListener('click', () => {
            this.audio.init();
            this.start();
        });

        document.getElementById('lobby-back-btn').addEventListener('click', () => {
            this.showLobby();
        });

        // Settings Buttons & Switches
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.audio.init();
            this.openOverlay(this.settingsOverlay);
        });
        document.getElementById('settings-close').addEventListener('click', () => {
            this.closeOverlay(this.settingsOverlay);
        });
        this.musicToggle.addEventListener('change', (e) => {
            this.audio.setMusic(e.target.checked);
        });
        this.soundToggle.addEventListener('change', (e) => {
            this.audio.setSound(e.target.checked);
        });

        // Shop Overlay triggers
        document.getElementById('shop-btn').addEventListener('click', () => {
            this.audio.init();
            this.renderShop();
            this.openOverlay(this.shopOverlay);
        });
        document.getElementById('shop-close').addEventListener('click', () => {
            this.closeOverlay(this.shopOverlay);
        });

        // Customize Screen triggers
        document.getElementById('customize-btn').addEventListener('click', () => {
            this.audio.init();
            this.renderCustomizer();
            this.openOverlay(this.customizeOverlay);
        });
        document.getElementById('customize-close').addEventListener('click', () => {
            this.closeOverlay(this.customizeOverlay);
        });

        // MULTIPLAYER TRIGGER MODALS
        document.getElementById('create-room-btn').addEventListener('click', () => {
            this.openJoinDialog(false); // False = Create Room Mode
        });
        document.getElementById('join-room-btn').addEventListener('click', () => {
            this.openJoinDialog(true); // True = Join Room Mode
        });
        document.getElementById('join-close').addEventListener('click', () => {
            this.closeOverlay(this.joinDialog);
        });

        // Join action verification logic
        this.joinDialogActionBtn.addEventListener('click', () => {
            const name = this.playerNameInput.value.trim() || 'Flyer';
            StorageManager.setPlayerName(name);

            // Connect socket first
            if (!this.socket.connected) {
                this.socket.connect();
            }

            const activeSkin = StorageManager.getActiveSkin();

            if (this.codeInputGroup.classList.contains('hidden')) {
                // Create room flow
                this.socket.emit('create_room', {
                    playerName: name,
                    skin: activeSkin,
                    playerId: this.playerId
                });
            } else {
                // Join room flow
                const code = this.roomCodeInput.value.toUpperCase().trim();
                if (code.length !== 6) {
                    return alert("Please enter a valid 6-character room code!");
                }
                this.socket.emit('join_room', {
                    roomCode: code,
                    playerName: name,
                    skin: activeSkin,
                    playerId: this.playerId
                });
            }
        });

        // MULTIPLAYER LOBBY TRIGGERS
        this.toggleReadyBtn.addEventListener('click', () => {
            this.socket.emit('toggle_ready');
        });

        this.startMatchBtn.addEventListener('click', () => {
            this.socket.emit('start_match');
        });

        document.getElementById('mp-lobby-close').addEventListener('click', () => {
            this.socket.emit('leave_room');
            this.activeRoomCode = null;
            this.closeOverlay(this.mpLobbyOverlay);
            this.showLobby();
        });

        // MP rankings screen exit back to Lobby
        document.getElementById('mp-return-lobby-btn').addEventListener('click', () => {
            this.closeOverlay(this.mpGameOverScreen);
            this.openOverlay(this.mpLobbyOverlay);
        });

        // Keyboard & canvas click jump action
        const jumpAction = (e) => {
            if (e.type === 'keydown' && e.code !== 'Space') return;
            
            // Only jump if player is alive
            if (this.state === 'playing') {
                e.preventDefault();
                this.bird.flap();
            }
        };

        window.addEventListener('keydown', jumpAction);
        this.canvas.addEventListener('mousedown', jumpAction);
        this.canvas.addEventListener('touchstart', jumpAction, { passive: false });
    }

    openJoinDialog(isJoinMode) {
        this.openOverlay(this.joinDialog);
        if (isJoinMode) {
            this.joinDialogTitle.innerText = "JOIN ROOM";
            this.codeInputGroup.classList.remove('hidden');
            this.joinDialogActionBtn.innerText = "JOIN MATCH";
        } else {
            this.joinDialogTitle.innerText = "CREATE ROOM";
            this.codeInputGroup.classList.add('hidden');
            this.joinDialogActionBtn.innerText = "CREATE MATCH";
        }
    }

    openOverlay(overlay) {
        overlay.classList.remove('hidden');
        this.topBar.style.opacity = '0';
        this.topBar.style.pointerEvents = 'none';
    }

    closeOverlay(overlay) {
        overlay.classList.add('hidden');
        this.topBar.style.opacity = '1';
        this.topBar.style.pointerEvents = 'auto';
        this.refreshLobbyData();
    }

    showLobby() {
        this.state = 'start';
        this.mode = 'solo';
        this.gameOverScreen.classList.add('hidden');
        this.mpGameOverScreen.classList.add('hidden');
        this.lobbyScreen.classList.remove('hidden');
        this.topBar.style.opacity = '1';
        this.topBar.style.pointerEvents = 'auto';
        this.refreshLobbyData();
    }

    start() {
        this.state = 'playing';
        this.score = 0;
        this.scoreEl.innerText = this.score;
        
        this.bird = new Bird(this);
        this.bird.flap(); 
        this.pipeManager.reset();
        
        this.pipeManager.speed = 3;

        this.lobbyScreen.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.hud.classList.remove('hidden');
        this.topBar.style.opacity = '0';
        this.topBar.style.pointerEvents = 'none';
    }

    addScore() {
        this.score++;
        this.scoreEl.innerText = this.score;
        this.audio.playScore();

        // Earn 1 Coin per score increment
        const newCoins = StorageManager.getCoins() + 1;
        StorageManager.setCoins(newCoins);
        this.coinCountEl.innerText = newCoins;
        this.animateCoins();

        if (this.score % 5 === 0) {
            this.pipeManager.speed += 0.5;
            this.environment.groundSpeed = this.pipeManager.speed;
        }
    }

    gameOver() {
        if (this.state === 'gameover' || this.state === 'spectating_mp') return;
        
        if (this.mode === 'multiplayer') {
            // In MP, transition to spectate mode and tell the server we're eliminated
            this.state = 'spectating_mp';
            this.socket.emit('player_die', { score: this.score });
            this.updateScoreboardHUD();
        } else {
            // Solo game over
            this.state = 'gameover';
            this.hud.classList.add('hidden');
            this.finalScoreEl.innerText = this.score;

            const currentHigh = StorageManager.getHighScore();
            if (this.score > currentHigh) {
                StorageManager.setHighScore(this.score);
            }
            this.gameOverScreen.classList.remove('hidden');
        }
    }

    // Dynamic Shop Grid Generator
    renderShop() {
        const container = document.getElementById('shop-items-grid');
        container.innerHTML = '';

        const coins = StorageManager.getCoins();
        const owned = StorageManager.getOwnedSkins();

        Object.values(SKINS).forEach(skin => {
            const card = document.createElement('div');
            card.className = `skin-card`;

            const canvas = document.createElement('canvas');
            canvas.className = 'skin-preview-canvas';
            canvas.width = 60;
            canvas.height = 60;

            const name = document.createElement('div');
            name.className = 'skin-name';
            name.innerText = skin.name;

            const button = document.createElement('button');
            button.className = 'skin-action-btn';

            const isOwned = owned.includes(skin.id);

            if (isOwned) {
                button.className += ' select-style';
                button.innerText = 'OWNED';
                button.disabled = true;
            } else {
                button.className += ' buy-style';
                button.innerHTML = `<div class="coin-icon mini"></div> ${skin.price}`;
                
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (coins >= skin.price) {
                        const updatedCoins = coins - skin.price;
                        StorageManager.setCoins(updatedCoins);
                        
                        owned.push(skin.id);
                        StorageManager.setOwnedSkins(owned);
                        StorageManager.setActiveSkin(skin.id);
                        
                        this.refreshLobbyData();
                        this.renderShop();
                        this.audio.playScore(); 
                    } else {
                        button.style.backgroundColor = '#FF5A5F';
                        setTimeout(() => {
                            button.style.backgroundColor = '';
                        }, 500);
                        this.audio.playTone(100, 80, 0.25, 'sawtooth', 0.2); 
                    }
                });
            }

            card.appendChild(canvas);
            card.appendChild(name);
            card.appendChild(button);
            container.appendChild(card);

            this.drawSkinPreview(canvas, skin);
        });
    }

    // Dynamic Customiser Grid Generator
    renderCustomizer() {
        const container = document.getElementById('skins-select-grid');
        container.innerHTML = '';

        const owned = StorageManager.getOwnedSkins();
        const active = StorageManager.getActiveSkin();

        Object.values(SKINS).forEach(skin => {
            if (!owned.includes(skin.id)) return;

            const card = document.createElement('div');
            const isActive = active === skin.id;
            card.className = `skin-card ${isActive ? 'selected' : ''}`;

            const canvas = document.createElement('canvas');
            canvas.className = 'skin-preview-canvas';
            canvas.width = 60;
            canvas.height = 60;

            const name = document.createElement('div');
            name.className = 'skin-name';
            name.innerText = skin.name;

            const button = document.createElement('button');
            button.className = 'skin-action-btn select-style';
            button.innerText = isActive ? 'ACTIVE' : 'EQUIP';
            
            if (isActive) {
                button.disabled = true;
            } else {
                button.addEventListener('click', () => {
                    StorageManager.setActiveSkin(skin.id);
                    this.renderCustomizer();
                    this.audio.playScore(); 
                });
            }

            card.appendChild(canvas);
            card.appendChild(name);
            card.appendChild(button);
            container.appendChild(card);

            this.drawSkinPreview(canvas, skin);
        });
    }

    drawSkinPreview(canvas, skin) {
        const ctx = canvas.getContext('2d');
        const img = document.getElementById('img-bird-idle');

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.filter = skin.filter;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.restore();
        };

        if (img.complete) {
            draw();
        } else {
            img.onload = draw;
        }
    }

    update() {
        this.environment.update();
        if (this.state === 'playing' || this.state === 'gameover' || this.state === 'spectating_mp') {
            this.bird.update();
        }
        if (this.state === 'playing' || this.state === 'spectating_mp') {
            this.pipeManager.update();
        }
        this.particleManager.update();

        // CLIENT INTERPOLATION FOR REMOTE GHOST BIRDS
        if (this.mode === 'multiplayer' && (this.state === 'playing' || this.state === 'spectating_mp')) {
            this.remotePlayers.forEach(p => {
                if (!p.isDead) {
                    // Linear interpolation (lerp) over 20% step size per tick
                    p.currentY += (p.targetY - p.currentY) * 0.2;
                    p.currentRotation += (p.targetRotation - p.currentRotation) * 0.2;
                }
            });

            // 15HZ STATE BROADCASTS (CLIENT TO SERVER)
            if (this.state === 'playing' && Date.now() - this.lastNetworkSyncTime > 66) {
                this.lastNetworkSyncTime = Date.now();
                this.socket.emit('player_update', {
                    y: this.bird.y,
                    rotation: this.bird.rotation,
                    score: this.score,
                    isDead: this.bird.state === 'dead'
                });
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        this.environment.drawBackground(this.ctx);
        this.pipeManager.draw(this.ctx);
        this.environment.drawGround(this.ctx);
        this.particleManager.draw(this.ctx);
        
        // Render Remote Ghost Birds
        if (this.mode === 'multiplayer' && (this.state === 'playing' || this.state === 'spectating_mp')) {
            const img = document.getElementById('img-bird-idle');
            this.remotePlayers.forEach(p => {
                if (!p.isDead) {
                    this.ctx.save();
                    this.ctx.globalAlpha = 0.5; // 50% opacity ghosts
                    this.ctx.translate(this.bird.x, p.currentY); // Keep them synced on our scroll line
                    this.ctx.rotate(p.currentRotation);
                    this.ctx.filter = SKINS[p.skin].filter;
                    this.ctx.drawImage(img, -this.bird.width/2, -this.bird.height/2, this.bird.width, this.bird.height);
                    this.ctx.restore();
                }
            });
        }

        // Render Local Bird
        if (this.state === 'playing' || this.state === 'gameover' || this.state === 'spectating_mp') {
            // If in MP spectate mode, draw local bird as dead
            this.bird.draw(this.ctx);
        }
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(this.loop);
    }
}

// Initialise the game once content has loaded
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
