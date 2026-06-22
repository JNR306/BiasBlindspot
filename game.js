const CELL_SIZE = 60; 
const DEBUG_MODE = false; 

let playerX = 0;
let playerY = 0;
let stepsTaken = 0;

const realMines = {};
let scanDeaths = {};
const renderedCells = {}; 
const visitedFields = new Set();

const stage = document.getElementById('grid-stage');
const scanBtn = document.getElementById('scan-btn');

const playerElement = document.createElement('div');
playerElement.className = 'cell player';
playerElement.innerText = '🤖';
stage.appendChild(playerElement);

visitedFields.add("0,0");

/**
 * Procedural generation using exponential scale distribution
 * Higher mine density with bias towards lower trigger probabilities
 */
function getMineProbability(x, y) {
    if (Math.abs(x) <= 2 && Math.abs(y) <= 2) return 0.0;

    const key = `${x},${y}`;
    if (!(key in realMines)) {
        if (Math.random() < 0.55) {
            let noise = Math.pow(Math.random(), 3); 
            realMines[key] = 0.05 + noise * 0.95;
        } else {
            realMines[key] = 0.0;
        }
    }
    return realMines[key];
}

/**
 * Updates Viewport DOM and handles lag-damping translation vector
 */
function updateViewport() {
    document.getElementById('score-val').innerText = stepsTaken;
    
    const debugElement = document.getElementById('debug-coords');
    debugElement.innerText = `Koord: (${playerX}, ${playerY})`;
    if (DEBUG_MODE) debugElement.classList.add('debug-active');

    const viewCols = Math.ceil(window.innerWidth / CELL_SIZE) + 6;
    const viewRows = Math.ceil(window.innerHeight / CELL_SIZE) + 6;

    const startX = playerX - Math.floor(viewCols / 2);
    const endX = playerX + Math.floor(viewCols / 2);
    const startY = playerY - Math.floor(viewRows / 2);
    const endY = playerY + Math.floor(viewRows / 2);

    for (let absX = startX; absX <= endX; absX++) {
        for (let absY = startY; absY <= endY; absY++) {
            const key = `${absX},${absY}`;
            let cell = renderedCells[key];
            
            if (!cell) {
                cell = document.createElement('div');
                cell.className = 'cell';
                cell.style.left = `${absX * CELL_SIZE}px`;
                cell.style.top = `${absY * CELL_SIZE}px`;
                stage.appendChild(cell);
                renderedCells[key] = cell;
            }

            cell.className = 'cell';
            cell.innerText = '';
            cell.style.backgroundColor = '';

            if (visitedFields.has(key) && !(absX === playerX && absY === playerY)) {
                cell.classList.add('visited');
                cell.onclick = null;
                continue;
            }

            if (scanDeaths[key] > 0) {
                let d = scanDeaths[key];
                let opacity = Math.min(d / 30, 1.0); 
                cell.style.backgroundColor = `rgba(255, 75, 75, ${opacity})`;
                cell.innerText = `💥 ${d}`;
            }

            const dx = Math.abs(absX - playerX);
            const dy = Math.abs(absY - playerY);
            if ((dx <= 1 && dy <= 1) && !(dx === 0 && dy === 0) && !visitedFields.has(key)) {
                cell.classList.add('clickable');
                cell.onclick = () => movePlayer(absX, absY);
            } else {
                cell.onclick = null;
            }
        }
    }

    playerElement.style.left = `${playerX * CELL_SIZE}px`;
    playerElement.style.top = `${playerY * CELL_SIZE}px`;

    const screenCenterX = window.innerWidth / 2 - (CELL_SIZE / 2);
    const screenCenterY = window.innerHeight / 2 - (CELL_SIZE / 2);
    const offsetX = -(playerX * CELL_SIZE) + screenCenterX;
    const offsetY = -(playerY * CELL_SIZE) + screenCenterY;
    
    stage.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
}

function movePlayer(targetX, targetY) {
    const key = `${targetX},${targetY}`;
    if (visitedFields.has(key)) return;

    const pMine = getMineProbability(targetX, targetY);
    if (Math.random() < pMine) {
        alert(`BOOM! Eine Mine hat dich erwischt!\nScore: ${stepsTaken}`);
        resetGame();
    } else {
        playerX = targetX;
        playerY = targetY;
        stepsTaken++;
        visitedFields.add(key);
    }
    updateViewport();
}

function resetGame() {
    playerX = 0;
    playerY = 0;
    stepsTaken = 0;
    scanDeaths = {};
    visitedFields.clear();
    visitedFields.add("0,0");
    updateViewport();
}

/**
 * Input Axis Handling (Release-to-Move Engine)
 */
const activeKeys = new Set();
let queuedDx = 0;
let queuedDy = 0;

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    activeKeys.add(key);

    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        e.preventDefault();
    }

    if (activeKeys.has('arrowup') || activeKeys.has('w')) queuedDy = -1;
    if (activeKeys.has('arrowdown') || activeKeys.has('s')) queuedDy = 1;
    if (activeKeys.has('arrowleft') || activeKeys.has('a')) queuedDx = -1;
    if (activeKeys.has('arrowright') || activeKeys.has('d')) queuedDx = 1;
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    activeKeys.delete(key);

    const movementKeyStillHeld = 
        activeKeys.has('arrowup') || activeKeys.has('w') ||
        activeKeys.has('arrowdown') || activeKeys.has('s') ||
        activeKeys.has('arrowleft') || activeKeys.has('a') ||
        activeKeys.has('arrowright') || activeKeys.has('d');

    if (!movementKeyStillHeld) {
        if (queuedDx !== 0 || queuedDy !== 0) {
            let targetX = playerX + queuedDx;
            let targetY = playerY + queuedDy;

            movePlayer(targetX, targetY);
            queuedDx = 0;
            queuedDy = 0;
        }
    }
});

/**
 * Monte Carlo Path Simulation Engine
 */
scanBtn.onclick = function triggerScan() {
    scanDeaths = {}; 
    const TOTAL_PATHS = 150; 
    
    for (let i = 0; i < TOTAL_PATHS; i++) {
        let curX = playerX;
        let curY = playerY;
        
        for (let step = 0; step < 10; step++) {
            let r = Math.random();
            if (r < 0.25) curX++;
            else if (r < 0.50) curX--;
            else if (r < 0.75) curY++;
            else curY--;
            
            let pMine = getMineProbability(curX, curY);
            if (Math.random() < pMine) {
                const key = `${curX},${curY}`;
                scanDeaths[key] = (scanDeaths[key] || 0) + 1;
                break; 
            }
        }
    }
    updateViewport();
};

window.addEventListener('resize', updateViewport);
updateViewport();