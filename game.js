const CELL_SIZE = 60; 
const DEBUG_MODE = false; 

let playerX = 0;
let playerY = 0;
let gemsCollected = 0;
let mapSeed = Math.random() * 10000; 

let realMines = {};
let scanDeaths = {};
let renderedCells = {}; 
let visitedFields = new Set();
let realWalls = {};

let activeKeys = new Set();
let isControlLocked = false; 
let queuedDx = 0;
let queuedDy = 0;

const stage = document.getElementById('grid-stage');
const scanBtn = document.getElementById('scan-btn');

// Spieler-Element initialisieren
const playerElement = document.createElement('div');
playerElement.className = 'cell player';
playerElement.innerText = '🤖';
stage.appendChild(playerElement);

// Startfeld als besucht markieren
visitedFields.add("0,0");

/**
 * Berechnet prozedural die Minenwahrscheinlichkeit basierend auf dem aktuellen Map-Seed.
 */
function getMineProbability(x, y) {
    if (Math.abs(x) <= 2 && Math.abs(y) <= 2) return 0.0;

    const key = `${x},${y}`;
    if (!(key in realMines)) {
        const pseudoRandom = Math.abs(Math.sin(x * 12.98 + y * 78.23 + mapSeed)) % 1;
        
        if (pseudoRandom < 0.55) {
            let noise = Math.pow(Math.random(), 3); 
            realMines[key] = 0.05 + noise * 0.95;
        } else {
            realMines[key] = 0.0;
        }
    }
    return realMines[key];
}

/**
 * Generiert prozedurale Wand-Chunks und verhindert geschlossene Räume oder zu dicke Klumpen.
 */
function isWall(x, y) {
    if (Math.abs(x) <= 2 && Math.abs(y) <= 2) return false;

    const key = `${x},${y}`;
    if (!(key in realWalls)) {
        const segmentSeed = Math.abs(Math.sin(Math.floor(x/4) * 12.98 + Math.floor(y/4) * 78.23 + mapSeed)) % 1;
        const chunkSize = 3 + Math.floor(segmentSeed * 4); 

        const chunkX = Math.floor(x / chunkSize);
        const chunkY = Math.floor(y / chunkSize);
        const chunkHash = Math.abs(Math.sin(chunkX * 45.32 + chunkY * 91.55 + mapSeed) * 43758.5453) % 1;

        let initialWall = false;

        if (chunkHash < 0.26) {
            initialWall = (y % chunkSize === Math.floor(chunkHash * 10) % chunkSize);
        } else if (chunkHash < 0.52) {
            initialWall = (x % chunkSize === Math.floor(chunkHash * 10) % chunkSize);
        } else if (chunkHash < 0.60) {
            initialWall = (y % chunkSize === 1) || (x % chunkSize === 1);
        }

        if (initialWall) {
            const checkKnownWall = (nx, ny) => {
                const nKey = `${nx},${ny}`;
                return realWalls[nKey] === true;
            };

            let existingNeighbors = 0;
            if (checkKnownWall(x - 1, y)) existingNeighbors++;
            if (checkKnownWall(x, y - 1)) existingNeighbors++;
            if (checkKnownWall(x + 1, y - 1)) existingNeighbors++; 
            if (checkKnownWall(x - 1, y - 1)) existingNeighbors++;

            if (existingNeighbors > 2) {
                realWalls[key] = false;
                return false;
            }

            const wallLeft  = checkKnownWall(x - 1, y);
            const wallUp    = checkKnownWall(x, y - 1);
            const wallDiag  = checkKnownWall(x - 1, y - 1);

            if (wallLeft && wallUp && !wallDiag) {
                realWalls[key] = false;
                return false;
            }
        }

        realWalls[key] = initialWall;
    }
    return realWalls[key];
}

/**
 * Aktualisiert die Anzeige des Spielfelds im Browser-Fenster.
 */
function updateViewport() {
    document.getElementById('score-val').innerText = gemsCollected;
    
    const debugElement = document.getElementById('debug-coords');
    if (debugElement) {
        debugElement.innerText = `Koord: (${playerX}, ${playerY})`;
        if (DEBUG_MODE) debugElement.classList.add('debug-active');
    }

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

            if (isWall(absX, absY)) {
                cell.classList.add('wall');
                cell.onclick = null;
                continue;
            }

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
            
            if ((dx <= 1 && dy <= 1) && !(dx === 0 && dy === 0) && !visitedFields.has(key) && !isWall(absX, absY)) {
                cell.classList.add('clickable');
                
                const pseudoRandomDelay = -((Math.abs(Math.sin(absX * 12.98 + absY * 78.23)) * 1.8).toFixed(2));
                cell.style.setProperty('--pulse-delay', `${pseudoRandomDelay}s`);
                
                cell.onclick = () => movePlayer(absX, absY);
            } else {
                cell.onclick = null;
                cell.style.removeProperty('--pulse-delay');
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

/**
 * Bewegt den Spieler auf ein Zielfeld und prüft, ob er explodiert.
 */
function movePlayer(targetX, targetY) {
    const key = `${targetX},${targetY}`;
    if (visitedFields.has(key) || isWall(targetX, targetY)) return;

    const pMine = getMineProbability(targetX, targetY);
    if (Math.random() < pMine) {
        alert(`BOOM! Eine Mine hat dich erwischt!\nGems gesammelt: ${gemsCollected}`);
        gemsCollected = 0; 
        resetGame(); 
    } else {
        playerX = targetX;
        playerY = targetY;
        gemsCollected++;
        visitedFields.add(key);
        updateViewport(); 
    }
}

/**
 * Setzt das Spiel komplett zurück, inklusive Generierung eines neuen Map-Seeds.
 */
function resetGame() {
    mapSeed = Math.random() * 10000;

    Object.values(renderedCells).forEach(cell => {
        if (cell && cell.parentNode) {
            cell.parentNode.removeChild(cell);
        }
    });

    realWalls = {};       
    realMines = {};       
    scanDeaths = {};
    renderedCells = {};   
    visitedFields.clear(); 

    playerX = 0;
    playerY = 0;
    visitedFields.add("0,0"); 

    activeKeys.clear();
    isControlLocked = false;
    queuedDx = 0;
    queuedDy = 0;

    updateViewport();
}

/**
 * Übersetzt Tasten-Strings in Richtungs-Koordinaten.
 */
function getDirectionFromKey(key) {
    if (key === 'arrowup' || key === 'w') return { dx: 0, dy: -1 };
    if (key === 'arrowdown' || key === 's') return { dx: 0, dy: 1 };
    if (key === 'arrowleft' || key === 'a') return { dx: -1, dy: 0 };
    if (key === 'arrowright' || key === 'd') return { dx: 1, dy: 0 };
    return null;
}

/**
 * Löst den Rüttel-Effekt (Screenshake) aus und färbt die Blockade rot.
 */
function triggerBlockWarning(targetX, targetY) {
    const stageElement = document.getElementById('grid-stage'); 
    if (!stageElement) return;

    const targetKey = `${targetX},${targetY}`;
    const targetCell = renderedCells[targetKey];
    
    if (targetCell) {
        targetCell.classList.add('hit-error');
        setTimeout(() => targetCell.classList.remove('hit-error'), 200);
    }

    const currentTransform = window.getComputedStyle(stageElement).transform;
    let matrixValues = { x: 0, y: 0 };
    if (currentTransform && currentTransform !== 'none') {
        const matrix = currentTransform.split('(')[1].split(')')[0].split(',');
        matrixValues.x = parseFloat(matrix[4]);
        matrixValues.y = parseFloat(matrix[5]);
    }

    stageElement.style.setProperty('--offsetX', `${matrixValues.x}px`);
    stageElement.style.setProperty('--offsetY', `${matrixValues.y}px`);
    
    stageElement.classList.remove('shake-effect');
    void stageElement.offsetWidth; 
    stageElement.classList.add('shake-effect');
    setTimeout(() => stageElement.classList.remove('shake-effect'), 150);
}

function isPathBlocked(tx, ty) {
    const key = `${tx},${ty}`;
    return isWall(tx, ty) || visitedFields.has(key);
}

// Tastatur-Event: Keydown (Registriert Eingaben und berechnet Diagonal-Moves)
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const dir = getDirectionFromKey(key);
    
    if (!dir) return;
    e.preventDefault();

    if (isControlLocked) return;
    if (activeKeys.has(key)) return;
    activeKeys.add(key);

    if (activeKeys.size === 1) {
        queuedDx = dir.dx;
        queuedDy = dir.dy;
    } else if (activeKeys.size === 2) {
        let combinedDx = 0;
        let combinedDy = 0;

        activeKeys.forEach(k => {
            const d = getDirectionFromKey(k);
            if (d) {
                combinedDx += d.dx;
                combinedDy += d.dy;
            }
        });

        let targetX = playerX + combinedDx;
        let targetY = playerY + combinedDy;
        
        isControlLocked = true;

        if (!isPathBlocked(targetX, targetY)) {
            movePlayer(targetX, targetY);
        } else {
            triggerBlockWarning(targetX, targetY);
        }

        queuedDx = 0;
        queuedDy = 0;
    }
});

// Tastatur-Event: Keyup (Führt Einzelschritte aus und löst die Bewegungssperre)
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (!getDirectionFromKey(key)) return;

    activeKeys.delete(key);

    if (!isControlLocked && activeKeys.size === 0) {
        if (queuedDx !== 0 || queuedDy !== 0) {
            let targetX = playerX + queuedDx;
            let targetY = playerY + queuedDy;

            if (!isPathBlocked(targetX, targetY)) {
                movePlayer(targetX, targetY);
            } else {
                triggerBlockWarning(targetX, targetY);
                isControlLocked = true; 
            }
        }
    }

    if (activeKeys.size === 0) {
        isControlLocked = false;
        queuedDx = 0;
        queuedDy = 0;
    }
});

/**
 * Monte Carlo Path Simulation Engine (Minen-Scanner)
 */
scanBtn.onclick = function triggerScan() {
    if (gemsCollected < 10) {
        alert("Nicht genug Gems! Ein Scan kostet 10 Gems.");
        return;
    }

    gemsCollected -= 10;
    scanDeaths = {}; 
    const TOTAL_PATHS = 150; 
    
    for (let i = 0; i < TOTAL_PATHS; i++) {
        let curX = playerX;
        let curY = playerY;
        
        for (let step = 0; step < 10; step++) {
            let r = Math.random();
            let nextX = curX;
            let nextY = curY;

            if (r < 0.25) nextX++;
            else if (r < 0.50) nextX--;
            else if (r < 0.75) nextY++;
            else nextY--;
            
            if (isWall(nextX, nextY)) {
                break;
            }

            curX = nextX;
            curY = nextY;

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

document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
        e.preventDefault();
    }
}, { passive: false });