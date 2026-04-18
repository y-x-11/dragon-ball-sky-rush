const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score-val');
const livesContainer = document.getElementById('lives-container');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const finalScoreEl = document.getElementById('final-score');

// Load Assets
const assets = {
    bg: new Image(),
    goku: new Image(),
    lightning: new Image(),
    heart: new Image(),
    dragonBalls: []
};

assets.bg.src = 'assets/game_background.png';
assets.goku.src = 'assets/goku_sprite.png';
assets.lightning.src = 'assets/lightning_strike.png';
assets.heart.src = 'assets/heart_icon.png';

for (let i = 1; i <= 7; i++) {
    const img = new Image();
    img.src = `assets/dragon_ball_${i}.png`;
    assets.dragonBalls.push(img);
}

// Game State
let isGameRunning = false;
let score = 0;
let lives = 5;
let animationId;
let gameSpeedMultiplier = 1;
let items = [];
let frames = 0;

// Audio System
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const sfx = {
    playCoin: () => {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const mainGain = audioCtx.createGain();
        osc.connect(mainGain);
        mainGain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, audioCtx.currentTime); 
        osc.frequency.setValueAtTime(1318.51, audioCtx.currentTime + 0.1); 
        mainGain.gain.setValueAtTime(0.6, audioCtx.currentTime);
        mainGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    },
    playThunder: () => {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const t = audioCtx.currentTime;
        const dur = 1.2;
        
        // 16-bit crush noise explosion
        const bufferSize = audioCtx.sampleRate * dur;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            // Apply discrete stepping to noise for retro crunch
            data[i] = Math.round((Math.random() * 2 - 1) * 8) / 8;
        }
        
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(600, t);
        filter.frequency.exponentialRampToValueAtTime(50, t + dur);
        
        const mainGain = audioCtx.createGain();
        mainGain.gain.setValueAtTime(2.0, t);
        mainGain.gain.exponentialRampToValueAtTime(0.01, t + dur);
        
        noise.connect(filter);
        filter.connect(mainGain);
        mainGain.connect(audioCtx.destination);
        noise.start(t);

        // Sub bass square wave for impact rumble
        const subOsc = audioCtx.createOscillator();
        subOsc.type = 'square';
        subOsc.frequency.setValueAtTime(100, t);
        subOsc.frequency.exponentialRampToValueAtTime(20, t + 0.6);
        
        const subGain = audioCtx.createGain();
        subGain.gain.setValueAtTime(1.5, t);
        subGain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
        
        subOsc.connect(subGain);
        subGain.connect(audioCtx.destination);
        
        subOsc.start(t);
        subOsc.stop(t + 0.6);
    },
    playCelebration: () => {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const notes = [
            { freq: 523.25, time: 0, dur: 0.15 },
            { freq: 659.25, time: 0.15, dur: 0.15 },
            { freq: 783.99, time: 0.3, dur: 0.15 },
            { freq: 1046.50, time: 0.45, dur: 0.4 }
        ];
        notes.forEach(note => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'square';
            osc.frequency.value = note.freq;
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime + note.time);
            gain.gain.setTargetAtTime(0, audioCtx.currentTime + note.time + 0.1, 0.1);
            osc.start(audioCtx.currentTime + note.time);
            osc.stop(audioCtx.currentTime + note.time + note.dur);
        });
    }
};

// Player Defaults
const player = {
    x: 355,
    y: 430,
    width: 90,
    height: 150,
    speed: 7,
    dx: 0
};

// Controls
const keys = {
    A: false,
    D: false,
    ArrowLeft: false,
    ArrowRight: false
};

window.addEventListener('keydown', (e) => {
    if(e.code === 'KeyA' || e.key === 'a' || e.key === 'A') keys.A = true;
    if(e.code === 'KeyD' || e.key === 'd' || e.key === 'D') keys.D = true;
    if(e.code === 'ArrowLeft') keys.ArrowLeft = true;
    if(e.code === 'ArrowRight') keys.ArrowRight = true;
});

window.addEventListener('keyup', (e) => {
    if(e.code === 'KeyA' || e.key === 'a' || e.key === 'A') keys.A = false;
    if(e.code === 'KeyD' || e.key === 'd' || e.key === 'D') keys.D = false;
    if(e.code === 'ArrowLeft') keys.ArrowLeft = false;
    if(e.code === 'ArrowRight') keys.ArrowRight = false;
});

// Mobile Touch Controls
const handleTouch = (e) => {
    if(e.target === canvas || e.target.closest('.overlay')) {
        // Prevent default only on game canvas so buttons still work
        if(e.target === canvas) e.preventDefault();
    }
    
    // Only move if we are actively playing
    if(!isGameRunning) return;
    
    // Use the first touch point
    const touch = e.touches[0];
    if(!touch) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    
    // Split screen in half for left/right tapping
    if (x < rect.width / 2) {
        keys.A = true;
        keys.D = false;
    } else {
        keys.D = true;
        keys.A = false;
    }
};

window.addEventListener('touchstart', handleTouch, { passive: false });
window.addEventListener('touchmove', handleTouch, { passive: false });
window.addEventListener('touchend', (e) => {
    keys.A = false;
    keys.D = false;
});

function drawPlayer() {
    const acceleration = 1.2;
    const maxSpeed = 16;
    const friction = 0.7; // makes him slide to a stop smoothly

    if(keys.ArrowLeft || keys.A) {
        player.dx -= acceleration;
    } else if(keys.ArrowRight || keys.D) {
        player.dx += acceleration;
    } else {
        // apply friction when no key is held
        player.dx *= friction;
    }

    // Cap the maximum speed
    if(player.dx > maxSpeed) player.dx = maxSpeed;
    if(player.dx < -maxSpeed) player.dx = -maxSpeed;

    player.x += player.dx;

    // Boundaries
    if(player.x < 0) {
        player.x = 0;
        player.dx = 0; // stop momentum if hit edge
    }
    if(player.x + player.width > canvas.width) {
        player.x = canvas.width - player.width;
        player.dx = 0; // stop momentum if hit edge
    }

    ctx.drawImage(assets.goku, player.x, player.y, player.width, player.height);
}

function spawnItem() {
    const isLightning = Math.random() < 0.3; // 30% chance for lightning
    
    let type, img, itemWidth, itemHeight;
    if (isLightning) {
        type = 'lightning';
        img = assets.lightning;
        itemWidth = 45;
        itemHeight = 80;
    } else {
        type = 'dragonball';
        const ballIndex = Math.floor(Math.random() * 7);
        img = assets.dragonBalls[ballIndex];
        itemWidth = 50;
        itemHeight = 50;
    }
    
    const x = Math.random() * (canvas.width - itemWidth);
    
    items.push({
        x,
        y: -itemHeight,
        width: itemWidth,
        height: itemHeight,
        type,
        img
    });
}

function handleItems() {
    const currentSpeed = 5 * gameSpeedMultiplier;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        item.y += currentSpeed;
        
        ctx.drawImage(item.img, item.x, item.y, item.width, item.height);

        // AABB Collision logic (with slight padding to feel better)
        const hitBoxPadding = 12;
        if (
            player.x + hitBoxPadding < item.x + item.width &&
            player.x + player.width - hitBoxPadding > item.x &&
            player.y + hitBoxPadding < item.y + item.height &&
            player.y + player.height - hitBoxPadding > item.y
        ) {
            if (item.type === 'dragonball') {
                score += 100;
                scoreEl.innerText = score;
                sfx.playCoin();
                // Update speed every 1000 points
                gameSpeedMultiplier = 1 + Math.floor(score / 1000) * 0.3;
            } else if (item.type === 'lightning') {
                lives--;
                updateLivesUI();
                sfx.playThunder();
                if (lives <= 0) {
                    gameOver();
                }
            }
            items.splice(i, 1);
            i--;
            continue;
        }

        // Remove if out of screen bounds
        if (item.y > canvas.height) {
            items.splice(i, 1);
            i--;
        }
    }
}

function updateLivesUI() {
    livesContainer.innerHTML = '';
    for(let i=0; i<Math.max(0, lives); i++) {
        const heart = document.createElement('div');
        heart.className = 'heart';
        heart.style.backgroundImage = `url('assets/heart_icon.png')`;
        livesContainer.appendChild(heart);
    }
}

function init() {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    score = 0;
    lives = 5;
    items = [];
    gameSpeedMultiplier = 1;
    frames = 0;
    player.x = (canvas.width / 2) - (player.width / 2);
    scoreEl.innerText = score;
    updateLivesUI();
    isGameRunning = true;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    animate();
}

function gameOver() {
    isGameRunning = false;
    cancelAnimationFrame(animationId);
    finalScoreEl.innerText = score;
    gameOverScreen.classList.remove('hidden');
    sfx.playCelebration();
}

function animate() {
    if (!isGameRunning) return;
    
    // Draw background
    ctx.drawImage(assets.bg, 0, 0, canvas.width, canvas.height);
    
    drawPlayer();

    // Spawn items based on frame interval, getting slightly faster 
    let spawnRate = Math.max(20, 60 - Math.floor(score / 1000) * 5);
    if(frames % spawnRate === 0) {
        spawnItem();
    }
    
    handleItems();
    
    frames++;
    animationId = requestAnimationFrame(animate);
}

startBtn.addEventListener('click', init);
restartBtn.addEventListener('click', init);

// Initial draw behind the start screen just to look nice
let bgLoaded = false;
assets.bg.onload = () => {
    if(!isGameRunning) {
        ctx.fillStyle = "#111"; // fallback
        ctx.fillRect(0,0,canvas.width, canvas.height);
        ctx.drawImage(assets.bg, 0, 0, canvas.width, canvas.height);
    }
};
