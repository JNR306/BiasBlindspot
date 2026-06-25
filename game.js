const CELL_SIZE = 60; 
const DEBUG_MODE = false;

// ── Tutorial-Flags ───────────────────────────────────────────────────────────
// FORCE_TUTORIAL: true = Tutorial immer zeigen (überschreibt localStorage).
//                 false = nur beim ersten Besuch.
const FORCE_TUTORIAL = false;

// Einzelne Tutorial-Schritte ein-/ausblenden (true = sichtbar, false = überspringen):
const TUTORIAL_SHOW = {
    welcome:       true,   // Schritt 1: Willkommen
    world:         true,   // Schritt 2: Die Welt
    controls:      true,   // Schritt 3: Steuerung
    gems:          true,   // Schritt 4: Gems & Highscore
    scanner:       true,   // Schritt 5: Scanner
    safeBooster:   true,   // Schritt 6: Safe-Booster
    luckBooster:   true,   // Schritt 7: Glücks-Booster
    charts:        false,   // Schritt 8: Wahrscheinlichkeits-Diagramme
    tip:           true,   // Schritt 9: Letzter Tipp
};
// ─────────────────────────────────────────────────────────────────────────────

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

let isGameOver = false;
let highscore = 0;

const stage = document.getElementById('grid-stage');
const scanBtn = document.getElementById('scan-btn');

// Spieler-Element initialisieren
const playerElement = document.createElement('div');
playerElement.className = 'cell player';
playerElement.innerText = '🤖';
stage.appendChild(playerElement);

let activeMineModifier = 1.0; // 1.0 = Normal, sinkt durch Tool 1
let activeGemModifier = 1.0;  // 1.0 = Normal, steigt durch Tool 2
let collectedGemsLocations = new Set(); // Speichert, welche Felder schon leergeräumt wurden

// Kosten für die Tools
const TOOL_COSTS = { scan: 15, safety: 50, luck: 80 };

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
        
        if (pseudoRandom < 0.55 * activeMineModifier) {
            let noise = Math.pow(Math.random(), 3); 
            realMines[key] = (0.05 + noise * 0.95) * activeMineModifier;
        } else {
            realMines[key] = 0.0;
        }
    }
    return realMines[key];
}

let realGems = {};
function getGemYield(x, y) {
    if (Math.abs(x) <= 2 && Math.abs(y) <= 2) return 0;
    const key = `${x},${y}`;
    
    if (!(key in realGems)) {
        const noise = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + mapSeed * 0.5) * 43758.5453) % 1;
        const gemChance = 0.04;
        
        if (noise < gemChance) {
            const maxGem = Math.floor(5 + (15 * activeGemModifier));
            realGems[key] = Math.floor(1 + Math.random() * maxGem);
        } else {
            realGems[key] = 0;
        }
    }
    return realGems[key];
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

function updateScoreUI() {
    document.getElementById('score-val').innerText = gemsCollected;
}

function checkAndSaveHighscore() {
    if (gemsCollected > highscore) {
        highscore = gemsCollected;
        localStorage.setItem('mineGameHighscore', highscore.toString());
        document.getElementById('highscore-val').innerText = highscore;
    }
}

/**
 * Aktualisiert die Anzeige des Spielfelds im Browser-Fenster.
 */
function updateViewport() {
    updateScoreUI();
    
    const debugElement = document.getElementById('debug-coords');
    if (debugElement) {
        debugElement.innerText = `Koord: (${playerX}, ${playerY})`;
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

            const gemYield = getGemYield(absX, absY);
            if (gemYield > 0 && !visitedFields.has(key) && !(absX === playerX && absY === playerY)) {
                cell.innerText = '💎';
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
    
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    const isTutorialVisible = tutorialOverlay && !tutorialOverlay.classList.contains('hidden');
    
    const screenCenterX = window.innerWidth / 2 - (CELL_SIZE / 2);
    const screenCenterY = isTutorialVisible 
        ? (window.innerHeight * 0.32) - (CELL_SIZE / 2)
        : (window.innerHeight * 0.50) - (CELL_SIZE / 2);
    
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
        isGameOver = true;
        triggerDeathSequence(targetX, targetY, pMine);
        return;
    } else {
        const gemYield = getGemYield(targetX, targetY);
        if (gemYield > 0 && !collectedGemsLocations.has(key)) {
            collectedGemsLocations.add(key);
            gemsCollected += gemYield;
            triggerFloatingText(gemYield);
        }
        
        playerX = targetX;
        playerY = targetY;
        gemsCollected++;
        visitedFields.add(key);
        updateViewport(); 
    }
}

window.onload = () => {
    // Highscore aus dem Browser-Speicher laden
    const savedHighscore = localStorage.getItem('mineGameHighscore');
    if (savedHighscore) {
        highscore = parseInt(savedHighscore, 10);
        const highscoreDisplay = document.getElementById('highscore-val');
        if (highscoreDisplay) {
            highscoreDisplay.innerText = highscore;
        }
    }

    setTimeout(() => {
        document.getElementById('loader').classList.add('loader-hidden');
    }, 1200);

    updateButtonPrices();
};

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && isGameOver) {
        hideGameOver();
    }
});

async function triggerDeathSequence(targetX, targetY, pMine) {
    triggerBlockWarning(targetX, targetY);

    // Während des Tutorials: sofort soft-resetten, kein Game-Over-Screen, kein Highscore
    if (tutorialActive) {
        await new Promise(r => setTimeout(r, 500));
        tutorialSoftReset();
        return;
    }

    await new Promise(r => setTimeout(r, 600));
    
    document.getElementById('mine-chance-val').innerText = (pMine * 100).toFixed(0);
    document.getElementById('final-score').innerHTML = `Gems: <strong>${gemsCollected}</strong>`;
    
    if (gemsCollected > highscore) {
        document.getElementById('final-score').innerHTML += '<br><span style="color:#ffcc00;">🏆 NEUER HIGHSCORE!</span>';
        highscore = gemsCollected;
        
        localStorage.setItem('mineGameHighscore', highscore.toString());
        
        const highscoreDisplay = document.getElementById('highscore-val');
        if (highscoreDisplay) {
            highscoreDisplay.innerText = highscore;
        }
    }
    
    document.getElementById('game-over-screen').classList.remove('hidden');
}

function hideGameOver() {
    const stage = document.getElementById('grid-stage');
    
    stage.classList.remove('death-mode');
    stage.style.transform = ""; 
    
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('loader').classList.remove('loader-hidden');
    
    resetGame();
    isGameOver = false;
    
    setTimeout(() => {
        document.getElementById('loader').classList.add('loader-hidden');
    }, 1000);
}

/**
 * Setzt das Spiel komplett zurück, inklusive Generierung eines neuen Map-Seeds.
 */
function resetGame() {
    gemsCollected = 0;
    activeMineModifier = 1.0;
    activeGemModifier = 1.0;
    
    upgradeCounts = { safety: 0, luck: 0 };
    updateButtonPrices(); 

    collectedGemsLocations.clear();
    realGems = {};
    document.getElementById('score-val').innerText = "0";

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

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (isGameOver) {
        if (key === 'enter') {
            hideGameOver();
        }
        return;
    }

    if (tutorialActive && key === 'enter') {
        e.preventDefault();
        advanceTutorial();
        return;
    }

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

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (!getDirectionFromKey(key)) return;

    activeKeys.delete(key);

    if (isGameOver) return;
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
        showToast("Zu wenig Gems! (10 nötig)");
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

window.addEventListener('resize', () => {
    updateViewport();
    updateButtonPrices();
});
updateViewport();

document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
        e.preventDefault();
    }
}, { passive: false });

function showToast(message) {
    const toast = document.getElementById('toast-message');
    toast.innerText = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2000);
}

let upgradeCounts = { safety: 0, luck: 0 };

function buyTool(type) {
    const basePrice = (type === 'safety') ? 50 : 60;
    const currentPrice = Math.floor(basePrice * Math.pow(1.5, upgradeCounts[type] || 0));

    if (upgradeCounts[type] >= 5) {
        showToast("Maximale Stufe erreicht!");
        return;
    }

    if (gemsCollected < currentPrice) {
        showToast(`Nicht genug Gems! (${currentPrice} benötigt)`);
        return;
    }

    gemsCollected -= currentPrice;
    upgradeCounts[type]++;
    updateScoreUI();

    if (type === 'safety') {
        activeMineModifier *= 0.8;
        realMines = {};
        showToast(`Sicherheit Stufe ${upgradeCounts.safety}/5`);
    } else if (type === 'luck') {
        activeGemModifier *= 1.2;
        realGems = {};
        showToast(`Glück Stufe ${upgradeCounts.luck}/5`);
    } else if (type === 'scan') {
        triggerScan();
        showToast("🔍 Scan durchgeführt.");
        return; 
    }

    updateButtonPrices(); 
    updateDynamicGraphs();
    updateViewport();
}

function isMobileScreen() {
    return window.innerWidth < 600 || (window.innerHeight < 450 && window.innerWidth < 900);
}

function updateButtonPrices() {
    const safetyBtn = document.getElementById('safety-btn');
    const luckBtn   = document.getElementById('luck-btn');
    const mobile    = isMobileScreen();

    if (safetyBtn) {
        if (upgradeCounts['safety'] >= 5) {
            safetyBtn.innerText = mobile ? `🛡️ Safe (MAX)` : `🛡️ Safe-Booster (MAX)`;
        } else {
            const nextSafety = Math.floor(50 * Math.pow(1.5, upgradeCounts['safety'] || 0));
            safetyBtn.innerText = mobile ? `🛡️ Safe (${nextSafety}G)` : `🛡️ Safe-Booster (${nextSafety}G)`;
        }
    }

    if (luckBtn) {
        if (upgradeCounts['luck'] >= 5) {
            luckBtn.innerText = mobile ? `🍀 Glück (MAX)` : `🍀 Glücks-Booster (MAX)`;
        } else {
            const nextLuck = Math.floor(60 * Math.pow(1.5, upgradeCounts['luck'] || 0));
            luckBtn.innerText = mobile ? `🍀 Glück (${nextLuck}G)` : `🍀 Glücks-Booster (${nextLuck}G)`;
        }
    }
}

function showInfo() {
    document.getElementById('info-screen').classList.remove('hidden');
    updateDynamicGraphs();
}

function updateDynamicGraphs() {
    // MINEN
    const mineCurve = document.getElementById('mine-curve');
    const mineMinLabel = document.getElementById('mine-min-label');
    const mineMaxLabel = document.getElementById('mine-max-label');
    
    const minMinePercent = (5 * activeMineModifier).toFixed(1);
    const maxMinePercent = (100 * activeMineModifier).toFixed(0);
    
    const endX = 20 + (260 * activeMineModifier); 
    mineCurve.setAttribute('d', `M 20 10 Q 30 78, ${endX} 79`);
    
    mineMinLabel.innerText = `${minMinePercent}%`;
    mineMaxLabel.innerText = `${maxMinePercent}%`;

    const gemRect = document.getElementById('gem-rect');
    const gemMaxLabel = document.getElementById('gem-max-label');
    
    const currentMax = 10 + (upgradeCounts.luck * 18);
    
    const baseWidth = 200;
    const scaleFactor = currentMax / 10;
    const newWidth = Math.min(baseWidth * scaleFactor, 300); // Max-Begrenzung damit es nicht aus dem SVG fliegt
    
    gemRect.setAttribute('width', newWidth);
    
    gemMaxLabel.setAttribute('x', 40 + newWidth - 25);
    gemMaxLabel.innerText = `${currentMax}G`;
}

function triggerFloatingText(amount) {
    const playerEl = document.querySelector('.player');
    if (!playerEl) return;

    const popup = document.createElement('div');
    popup.className = 'floating-gem-text';
    popup.innerText = `+${amount} 💎`;
    
    playerEl.appendChild(popup);
    setTimeout(() => popup.remove(), 1000);
}

function hideInfo() {
    document.getElementById('info-screen').classList.add('hidden');
}

// ════════════════════════════════════════════════════════════════════════════
//  TUTORIAL SYSTEM
// ════════════════════════════════════════════════════════════════════════════

const TUTORIAL_STORAGE_KEY = 'biasBlindspot_tutorialDone';

/**
 * Jeder Schritt definiert:
 *   targetId   – ID des UI-Elements, das beleuchtet wird (null = kein Spotlight)
 *   title      – Überschrift im Tooltip
 *   text       – Erklärungstext (HTML erlaubt)
 *   position   – wo der Tooltip erscheint: 'top' | 'bottom' | 'center'
 */
const TUTORIAL_STEPS_ALL = [
    {
        flag: 'welcome',
        targetId: null,
        title: '🤖 Willkommen bei Bias Blindspot',
        text: 'Du steuerst einen KI-Agenten durch eine prozedural generierte Welt voller Gefahren.<br><br>Jeder Schritt ist ein Risiko — aber auch eine Chance auf Edelsteine. Dieses Tutorial erklärt dir die Grundlagen.',
        position: 'center',
    },
    {
        flag: 'world',
        targetId: 'grid-stage',
        title: '🗺️ Die Welt',
        text: 'Die Welt wird unendlich um dich herum generiert. <strong>Leuchtende Felder</strong> sind betretbar. <strong>Graue Blöcke</strong> sind Wände — die musst du umgehen.<br><br>💎-Felder enthalten Edelsteine, die du beim Betreten einsammelst.',
        position: 'center',
    },
    {
        flag: 'controls',
        targetId: null,
        title: '🎮 Steuerung',
        text: '<strong>Maus / Touch:</strong> Klicke auf ein angrenzendes Feld um dorthin zu gehen.<br><br><strong>Tastatur:</strong> Pfeiltasten oder <kbd>W A S D</kbd> — auch Diagonalbewegung mit zwei Tasten gleichzeitig.<br><br>Im Tutorial kannst du auch <kbd>Enter</kbd> drücken, um weiterzugehen.',
        position: 'center',
    },
    {
        flag: 'gems',
        targetId: 'ui-top-capsule',
        title: '💎 Gems & Highscore',
        text: '<strong>Gems</strong> ist dein aktuelles Guthaben — damit kaufst du Tools.<br><br><strong>Best</strong> ist dein Allzeit-Highscore, der im Browser gespeichert wird.',
        position: 'bottom',
    },
    {
        flag: 'scanner',
        targetId: 'scan-btn',
        title: '🔍 Scanner (10 Gems)',
        text: 'Startet eine <strong>Monte-Carlo-Simulation</strong>: 150 virtuelle Klone laufen je 10 Schritte durch die Welt. Felder mit vielen Toden werden rot markiert — so siehst du gefährliche Bereiche, <em>bevor</em> du sie betrittst.',
        position: 'top',
    },
    {
        flag: 'safeBooster',
        targetId: 'safety-btn',
        title: '🛡️ Safe-Booster (50 Gems)',
        text: 'Reduziert das Explosionsrisiko aller Minen um <strong>20 %</strong>. Bis zu 5-mal kaufbar — das Maximum schrumpft den Risiko-Erwartungswert auf etwa 33 % des Originalwerts.',
        position: 'top',
    },
    {
        flag: 'luckBooster',
        targetId: 'luck-btn',
        title: '🍀 Glücks-Booster (60 Gems)',
        text: 'Erhöht den maximalen Gem-Ertrag von Edelsteinfeldern um <strong>20 %</strong>. Bis zu 5-mal kaufbar. Auf Stufe 5 kannst du bis zu <strong>~100 Gems</strong> aus einem einzigen Feld holen.',
        position: 'top',
    },
    {
        flag: 'charts',
        targetId: 'info-btn',
        title: '📊 Wahrscheinlichkeits-Diagramme',
        text: 'Hier siehst du die mathematischen Verteilungen hinter dem Spiel: die Dichtefunktion des Minen-Risikos (rechtsschief — die meisten Minen sind schwach) und die Gleichverteilung des Gem-Ertrags.<br><br>Die Graphen passen sich an deine Upgrades an.',
        position: 'bottom',
    },
    {
        flag: 'tip',
        targetId: null,
        title: '💡 Ein letzter Tipp',
        text: 'Das Risiko steigt, je länger du überlebst — aber die Booster können das abfedern. Nutze den Scanner, wenn du unsicher bist, welche Richtung sicherer ist.<br><br><strong>Viel Erfolg — und vorsichtig sein! 💥</strong>',
        position: 'center',
    },
];

// Nur Schritte einschließen, deren Flag auf true gesetzt ist
const TUTORIAL_STEPS = TUTORIAL_STEPS_ALL.filter(s => TUTORIAL_SHOW[s.flag] !== false);

let tutorialStep = 0;
let tutorialActive = false;
let tutorialOverlay = null;

function shouldShowTutorial() {
    if (FORCE_TUTORIAL) return true;
    return !localStorage.getItem(TUTORIAL_STORAGE_KEY);
}

function markTutorialDone() {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
}

function startTutorial() {
    if (tutorialActive) return;
    tutorialActive = true;
    tutorialStep = 0;
    buildTutorialOverlay();
    showTutorialStep(0);
}

function buildTutorialOverlay() {
    // Backdrop
    tutorialOverlay = document.createElement('div');
    tutorialOverlay.id = 'tutorial-overlay';
    tutorialOverlay.innerHTML = `
        <div id="tutorial-spotlight"></div>
        <div id="tutorial-box">
            <div id="tutorial-header">
                <span id="tutorial-title"></span>
                <span id="tutorial-counter"></span>
            </div>
            <div id="tutorial-text"></div>
            <div id="tutorial-footer">
                <button id="tutorial-skip-btn" onclick="endTutorial()">Überspringen</button>
                <button id="tutorial-next-btn" onclick="advanceTutorial()">Weiter →</button>
            </div>
            <div id="tutorial-dots"></div>
        </div>`;
    document.body.appendChild(tutorialOverlay);
}

function showTutorialStep(index) {
    const step = TUTORIAL_STEPS[index];
    const isLast = index === TUTORIAL_STEPS.length - 1;

    document.getElementById('tutorial-title').innerHTML   = step.title;
    document.getElementById('tutorial-text').innerHTML    = step.text;
    document.getElementById('tutorial-counter').innerText = `${index + 1} / ${TUTORIAL_STEPS.length}`;
    document.getElementById('tutorial-next-btn').innerText = isLast ? 'Los geht\'s! 🚀' : 'Weiter →';

    // Dot-Navigation
    const dotsEl = document.getElementById('tutorial-dots');
    dotsEl.innerHTML = '';
    TUTORIAL_STEPS.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'tutorial-dot' + (i === index ? ' active' : '');
        dot.onclick = () => { tutorialStep = i; showTutorialStep(i); };
        dotsEl.appendChild(dot);
    });

    // Spotlight
    positionTutorialBox(step);
}

function positionTutorialBox(step) {
    const spotlight = document.getElementById('tutorial-spotlight');
    const box       = document.getElementById('tutorial-box');
    const vw        = window.innerWidth;
    const vh        = window.innerHeight;

    const isPortraitMobile  = vw  < 768;
    const isLandscapeMobile = vh  < 450 && vw < 900;
    const mobile            = isPortraitMobile || isLandscapeMobile;

    const safeMargin = mobile ? 14 : 20;

    const bottomBarEl   = document.getElementById('ui-bottom-bar');
    const bottomBarRect = bottomBarEl ? bottomBarEl.getBoundingClientRect() : null;
    const aboveBar      = bottomBarRect
        ? vh - bottomBarRect.top + 14
        : (mobile ? 80 : 70);

    box.style.top       = '';
    box.style.bottom    = '';
    box.style.left      = '';
    box.style.right     = '';
    box.style.transform = '';

    box.style.animation = 'none';
    void box.offsetWidth;
    box.style.animation = '';

    box.style.left      = '50%';
    box.style.transform = 'translateX(-50%)';

    const el = (step.targetId && step.targetId !== 'grid-stage')
        ? document.getElementById(step.targetId)
        : null;

    if (el) {
        const r   = el.getBoundingClientRect();
        const pad = mobile ? 6 : 10;

        spotlight.style.cssText = `
            display: block; position: fixed;
            left: ${r.left - pad}px; top: ${r.top - pad}px;
            width: ${r.width + pad * 2}px; height: ${r.height + pad * 2}px;
            border-radius: 16px;
            box-shadow: 0 0 0 9999px rgba(0,0,0,0.75);
            border: 2px solid rgba(0,255,204,0.7);
            pointer-events: none; z-index: 10001; transition: all 0.35s ease;`;

        if (mobile) {
            box.style.bottom = `${aboveBar}px`;
        } else {
            if (r.top > vh / 2) {
                box.style.bottom = `${vh - r.top + pad + 12}px`;
            } else {
                box.style.top = `${r.bottom + pad + 12}px`;
            }
        }
    } else {
        spotlight.style.display = 'none';

        if (mobile) {
            box.style.bottom = `${aboveBar}px`;
        } else {
            box.style.top = `${vh / 2 + CELL_SIZE * 2}px`;
        }
    }

    requestAnimationFrame(() => {
        const r = box.getBoundingClientRect();
        if (!r.width) return;

        if (r.top < safeMargin) {
            box.style.bottom = '';
            box.style.top    = `${safeMargin}px`;
        } else if (r.bottom > vh - safeMargin) {
            box.style.top    = '';
            box.style.bottom = `${safeMargin}px`;
        }
    });
}

function advanceTutorial() {
    tutorialStep++;
    if (tutorialStep >= TUTORIAL_STEPS.length) {
        endTutorial();
    } else {
        showTutorialStep(tutorialStep);
    }
}

/**
 * Setzt den Spieler zurück ohne neue Karte oder Highscore-Speicherung.
 * Wird beim Tod während des Tutorials aufgerufen.
 */
function tutorialSoftReset() {
    gemsCollected       = 0;
    playerX             = 0;
    playerY             = 0;
    isGameOver          = false;
    activeKeys.clear();
    isControlLocked     = false;
    queuedDx            = 0;
    queuedDy            = 0;

    visitedFields.clear();
    visitedFields.add("0,0");
    collectedGemsLocations.clear();
    realMines  = {};   // Minen neu würfeln
    scanDeaths = {};

    updateScoreUI();
    updateViewport();
}

function endTutorial() {
    tutorialActive = false;
    markTutorialDone();
    if (tutorialOverlay) {
        tutorialOverlay.style.opacity = '0';
        setTimeout(() => {
            if (tutorialOverlay && tutorialOverlay.parentNode) {
                tutorialOverlay.parentNode.removeChild(tutorialOverlay);
            }
            tutorialOverlay = null;
        }, 350);
    }
}

// Tutorial nach dem Loader starten
window.addEventListener('load', () => {
    if (shouldShowTutorial()) {
        // Warten bis der Loader weg ist
        setTimeout(startTutorial, 1400);
    }
});