/**
 * OTTO NINJA PRO Controller
 * Professional JavaScript Module
 * @version 2.0
 */

// State Management
const state = {
    espIP: "",
    connected: false,
    currentMode: "game-controls",
    currentOffsetLeft: 0,
    currentOffsetRight: 0,
    drawerOpen: false,
    selectedAttacks: new Set(),
    maxSelectedAttacks: 4,
    selectedSounds: new Set(),
    maxSelectedSounds: 4,
    joystick: {
        dragging: false,
        maxDist: 100,
        currentX: 0,
        currentY: 0,
        lastUpdate: 0,
        updateInterval: 100, // 100ms = ~10 updates per second (reducido para no saturar)
        pendingUpdate: false,
        dragStartX: 0,
        dragStartY: 0,
        knobStartX: 0,
        knobStartY: 0,
        lastX: 0,
        lastY: 0 // Para evitar comandos duplicados
    },
    // Debounce para comandos (evitar saturación)
    lastCommandTime: {
        joystick: 0,
        arm: 0,
        head: 0,
        walk: 0,
        attack: 0,
        buzzer: 0
    },
    commandCooldown: 400 // ms entre comandos del mismo tipo
};

// Sound data for quick access
const soundData = {
    '0': { icon: '🔌', name: 'Conectar' },
    '1': { icon: '🔓', name: 'Desconectar' },
    '2': { icon: '🔘', name: 'Botón' },
    '3': { icon: '⚔️', name: 'Batalla' },
    '4': { icon: '😡', name: 'Furia' },
    '5': { icon: '🥷', name: 'Ninja' },
    '6': { icon: '😲', name: 'Sorpresa' },
    '7': { icon: '😮', name: '¡Oh!' },
    '8': { icon: '😯', name: '¡Oh! 2' },
    '9': { icon: '🥰', name: 'Tierno' },
    '10': { icon: '😴', name: 'Durmiendo' },
    '11': { icon: '😊', name: 'Feliz' },
    '12': { icon: '😄', name: 'Muy Feliz' },
    '13': { icon: '😃', name: 'Feliz Corto' },
    '14': { icon: '😢', name: 'Triste' },
    '15': { icon: '😕', name: 'Confundido' }
};

// Attack data for quick access
const attackData = {
    'slash': { icon: '⚔️', name: 'Slash' },
    'uppercut': { icon: '👆', name: 'Uppercut' },
    'spin': { icon: '🌀', name: '360°' },
    'stab': { icon: '🎯', name: 'Estocada' },
    'defense': { icon: '🛡️', name: 'Defensa' },
    'combo_fury': { icon: '😡', name: 'Furia' },
    'combo_samurai': { icon: '🏯', name: 'Samurai' },
    'taunt': { icon: '😎', name: 'Victoria' },
    'ultimate': { icon: '💫', name: 'ULTIMATE' }
};

// DOM Elements Cache
const elements = {
    panels: document.querySelectorAll('.content-panel'),
    navDrawer: document.getElementById('navDrawer'),
    menuBtn: document.getElementById('menuBtn'),
    navClose: document.getElementById('navClose'),
    navOverlay: document.getElementById('navOverlay'),
    navItems: document.querySelectorAll('.nav-drawer-item'),
    ipInput: document.getElementById('ipInput'),
    statusIndicator: document.getElementById('statusIndicator'),
    statusText: document.getElementById('statusText'),
    debugLog: document.getElementById('debugLog'),
    joystickKnob: document.getElementById('joystickKnob'),
    xValue: document.getElementById('xValue'),
    yValue: document.getElementById('yValue'),
    offsetLeft: document.getElementById('offsetLeft'),
    offsetRight: document.getElementById('offsetRight'),
    offsetLeftValue: document.getElementById('offsetLeftValue'),
    offsetRightValue: document.getElementById('offsetRightValue'),
    attacksCounter: document.getElementById('attacksCounter'),
    attackCheckboxes: document.querySelectorAll('.attack-checkbox-input'),
    attackCards: document.querySelectorAll('.attack-card'),
    soundsCounter: document.getElementById('soundsCounter'),
    buzzerCheckboxes: document.querySelectorAll('.buzzer-checkbox-input'),
    buzzerCards: document.querySelectorAll('.buzzer-card')
};

// ========== UTILITIES ==========

/**
 * Add entry to debug log
 * @param {string} message - Log message
 */
function addLog(message) {
    if (!elements.debugLog) {
        console.log(message);
        return;
    }

    const timestamp = new Date().toLocaleTimeString('es-ES', { hour12: false });
    const entry = document.createElement('div');
    entry.className = 'debug-entry';
    entry.innerHTML = `<span class="timestamp">[${timestamp}]</span>${message}`;
    elements.debugLog.appendChild(entry);
    elements.debugLog.scrollTop = elements.debugLog.scrollHeight;
}

/**
 * Send HTTP request to ESP32
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 */
async function sendRequest(endpoint, params = {}) {
    if (!state.espIP) {
        addLog("⚠️ Ingresa una IP válida");
        return false;
    }

    if (!state.connected) {
        addLog("❌ No conectado");
        return false;
    }

    const url = `http://${state.espIP}/${endpoint}?${new URLSearchParams(params)}`;

    try {
        // AbortController para timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 segundos timeout

        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            addLog(`✅ ${endpoint.toUpperCase()}: OK`);
        }

        return response.ok;
    } catch (error) {
        if (error.name === 'AbortError') {
            // Mostrar timeout para endpoints críticos (HEAD, ARM)
            if (endpoint === 'head' || endpoint === 'arms' || endpoint === 'walk') {
                addLog(`⏱️ Timeout en ${endpoint.toUpperCase()} (ESP32 ocupado)`);
            }
        } else {
            addLog(`❌ Error en ${endpoint}: ${error.message}`);
        }
        return false;
    }
}

// ========== PANEL NAVIGATION ==========

/**
 * Switch between game modes (rotate/walk)
 * @param {string} mode - 'rotate' or 'walk'
 */
async function switchGameMode(mode) {
    // Update mode buttons
    document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update mode sections
    document.querySelectorAll('.game-mode-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`mode-${mode}`)?.classList.add('active');

    if (elements.debugLog) {
        const modeName = mode === 'rotate' ? 'RODAR' : 'CAMINAR';
        addLog(`🎮 Modo: ${modeName}`);
    }

    // Enviar comando al ESP32
    if (state.connected) {
        const modeCmd = mode === 'rotate' ? 'rodar' : 'caminar';
        await sendRequest('mode', { cmd: modeCmd });
    }
}

/**
 * Open navigation drawer
 */
function openDrawer() {
    state.drawerOpen = true;
    elements.navDrawer?.classList.add('open');
    document.body.style.overflow = 'hidden';
}

/**
 * Close navigation drawer
 */
function closeDrawer() {
    state.drawerOpen = false;
    elements.navDrawer?.classList.remove('open');
    document.body.style.overflow = '';
}

/**
 * Toggle navigation drawer
 */
function toggleDrawer() {
    if (state.drawerOpen) {
        closeDrawer();
    } else {
        openDrawer();
    }
}

/**
 * Show specific panel
 * @param {string} panelId - Panel identifier
 */
function showPanel(panelId) {
    if (!elements.panels || elements.panels.length === 0) {
        console.error("Panels not found");
        return;
    }

    elements.panels.forEach(panel => {
        if (panel) panel.classList.remove('active');
    });

    elements.navItems.forEach(item => {
        if (item) item.classList.remove('active');
    });

    document.getElementById(panelId)?.classList.add('active');
    document.querySelector(`.nav-drawer-item[data-panel="${panelId}"]`)?.classList.add('active');

    state.currentMode = panelId;

    if (elements.debugLog) {
        addLog(`🎮 Panel: ${panelId.toUpperCase()}`);
    }

    // Close drawer after selecting a panel
    closeDrawer();
}

// ========== CONNECTION ==========

/**
 * Connect to ESP32
 */
async function connect() {
    state.espIP = (elements.ipInput?.value || "").trim();

    if (!state.espIP) {
        addLog("⚠️ Ingresa una IP válida");
        return;
    }

    addLog(`🔌 Conectando a: ${state.espIP}`);
    elements.statusText.innerText = "CONECTANDO...";

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`http://${state.espIP}/status`, {
            method: 'GET',
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            state.connected = true;
            elements.statusIndicator.classList.add("connected");
            elements.statusText.innerText = "CONECTADO";
            addLog("✅ Conexión exitosa");
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        state.connected = false;
        elements.statusIndicator.classList.remove("connected");
        elements.statusText.innerText = "ERROR";
        if (error.name === 'AbortError') {
            addLog("❌ Timeout - No se pudo conectar al ESP32");
        } else {
            addLog(`❌ Error de conexión: ${error.message}`);
        }
    }
}

// ========== WALK ==========

/**
 * Send walk command
 * @param {string} cmd - Walk command
 */
async function walk(cmd) {
    const now = Date.now();
    if (now - state.lastCommandTime.walk < state.commandCooldown) {
        addLog(`⏳ Esperar antes de otro comando WALK`);
        return;
    }
    state.lastCommandTime.walk = now;
    addLog(`🚶 WALK: ${cmd}`);
    await sendRequest('walk', { cmd });
}

// ========== ARMS ==========

/**
 * Send arm command
 * @param {string} cmd - Arm command
 */
async function arm(cmd) {
    const now = Date.now();
    if (now - state.lastCommandTime.arm < state.commandCooldown) {
        addLog(`⏳ Esperar antes de otro comando ARM`);
        return;
    }
    state.lastCommandTime.arm = now;
    addLog(`💪 ARM: ${cmd}`);
    const success = await sendRequest('arms', { cmd });
    if (!success) {
        addLog(`⚠️ ARM falló (ESP32 no respondió)`);
    }
}

// ========== HEAD ==========

/**
 * Send head movement command
 * @param {string} cmd - Head command
 */
async function headMove(cmd) {
    const now = Date.now();
    if (now - state.lastCommandTime.head < state.commandCooldown) {
        addLog(`⏳ Esperar antes de otro comando HEAD`);
        return;
    }
    state.lastCommandTime.head = now;
    addLog(`🗣️ HEAD: ${cmd}`);
    const success = await sendRequest('head', { cmd });
    if (!success) {
        addLog(`⚠️ HEAD falló (ESP32 no respondió)`);
    }
}

// ========== ATTACKS ==========

/**
 * Toggle attack selection
 * @param {string} attackId - Attack identifier
 * @param {HTMLInputElement} checkbox - Checkbox element
 */
function toggleAttackSelection(attackId, checkbox) {
    if (checkbox.checked) {
        if (state.selectedAttacks.size >= state.maxSelectedAttacks) {
            // Prevent selection if already at max
            checkbox.checked = false;
            addLog(`⚠️ Máximo 3 ataques permitidos`);
            return;
        }
        state.selectedAttacks.add(attackId);
    } else {
        state.selectedAttacks.delete(attackId);
    }

    // Update UI
    updateAttacksUI();

    const attackNames = {
        'slash': 'Slash',
        'uppercut': 'Uppercut',
        'spin': '360°',
        'stab': 'Estocada',
        'defense': 'Defensa',
        'combo_fury': 'Furia',
        'combo_samurai': 'Samurai',
        'taunt': 'Victoria',
        'ultimate': 'ULTIMATE'
    };

    const action = checkbox.checked ? 'Seleccionado' : 'Deseleccionado';
    addLog(`⚔️ ${action}: ${attackNames[attackId]}`);
}

/**
 * Update attacks UI based on selection
 */
function updateAttacksUI() {
    const count = state.selectedAttacks.size;
    elements.attacksCounter.innerText = count;

    // Update cards
    elements.attackCards.forEach(card => {
        const checkbox = card.querySelector('.attack-checkbox-input');
        if (!checkbox) return;

        const attackId = checkbox.id.replace('attack-', '');

        if (state.selectedAttacks.has(attackId)) {
            card.classList.add('selected');
            card.classList.remove('disabled');
        } else if (count >= state.maxSelectedAttacks) {
            card.classList.remove('selected');
            card.classList.add('disabled');
        } else {
            card.classList.remove('selected');
            card.classList.remove('disabled');
        }
    });

    // Update quick attacks
    updateQuickAttacks();
}

/**
 * Update quick attacks containers with selected attacks
 */
function updateQuickAttacks() {
    const quickAttacksRotate = document.getElementById('quickAttacksRotate');
    const quickAttacksWalk = document.getElementById('quickAttacksWalk');

    if (!quickAttacksRotate || !quickAttacksWalk) return;

    // Clear existing content
    quickAttacksRotate.innerHTML = '';
    quickAttacksWalk.innerHTML = '';

    // If no attacks selected, show message
    if (state.selectedAttacks.size === 0) {
        const message = '<p class="no-attacks-message">Selecciona hasta 4 ataques</p>';
        quickAttacksRotate.innerHTML = message;
        quickAttacksWalk.innerHTML = message;
        return;
    }

    // Create buttons for each selected attack
    state.selectedAttacks.forEach(attackId => {
        const data = attackData[attackId];
        if (!data) return;

        // Create button
        const button = document.createElement('button');
        button.className = 'quick-attack-btn';
        button.innerHTML = `${data.icon}<span class="attack-hint">${data.name}</span>`;
        button.dataset.action = 'attack';
        button.dataset.cmd = attackId;
        button.title = data.name;

        // Clone for both containers
        const buttonForRotate = button.cloneNode(true);
        const buttonForWalk = button.cloneNode(true);

        quickAttacksRotate.appendChild(buttonForRotate);
        quickAttacksWalk.appendChild(buttonForWalk);
    });
}

/**
 * Execute attack move (only if selected)
 * @param {string} cmd - Attack command
 */
async function attack(cmd) {
    // Check if attack is selected
    if (!state.selectedAttacks.has(cmd)) {
        addLog(`⚠️ El ataque no está seleccionado`);
        return;
    }

    const now = Date.now();
    if (now - state.lastCommandTime.attack < state.commandCooldown) {
        addLog(`⏳ Esperar antes de otro ataque`);
        return;
    }
    state.lastCommandTime.attack = now;

    const attackNames = {
        'slash': '⚔️ Slash',
        'uppercut': '⬆️ Uppercut',
        'spin': '🌀 Giro 360°',
        'stab': '🎯 Estocada',
        'defense': '🛡️ Defensa',
        'combo_fury': '😡 Furia Ninja',
        'combo_samurai': '🏯 Samurai',
        'ultimate': '💫 ULTIMATE',
        'taunt': '😎 Taunt'
    };

    addLog(`⚔️ ATTACK: ${attackNames[cmd] || cmd}`);
    await sendRequest('attack', { cmd });
}

// ========== SOUNDS SELECTION ==========

/**
 * Toggle sound selection
 * @param {string} soundId - Sound identifier
 * @param {HTMLInputElement} checkbox - Checkbox element
 */
function toggleSoundSelection(soundId, checkbox) {
    if (checkbox.checked) {
        if (state.selectedSounds.size >= state.maxSelectedSounds) {
            // Prevent selection if already at max
            checkbox.checked = false;
            addLog(`⚠️ Máximo 4 sonidos permitidos`);
            return;
        }
        state.selectedSounds.add(soundId);
    } else {
        state.selectedSounds.delete(soundId);
    }

    // Update UI
    updateSoundsUI();

    const soundNames = [
        'Conectar', 'Desconectar', 'Botón', 'Batalla', 'Furia', 'Ninja',
        'Sorpresa', '¡Oh!', '¡Oh! 2', 'Tierno', 'Durmiendo', 'Feliz',
        'Muy Feliz', 'Feliz Corto', 'Triste', 'Confundido'
    ];

    const action = checkbox.checked ? 'Seleccionado' : 'Deseleccionado';
    addLog(`🔊 ${action}: ${soundNames[soundId]}`);
}

/**
 * Update sounds UI based on selection
 */
function updateSoundsUI() {
    const count = state.selectedSounds.size;
    elements.soundsCounter.innerText = count;

    // Update cards
    elements.buzzerCards.forEach(card => {
        const checkbox = card.querySelector('.buzzer-checkbox-input');
        if (!checkbox) return;

        const soundId = checkbox.id.replace('buzzer-', '');

        if (state.selectedSounds.has(soundId)) {
            card.classList.add('selected');
            card.classList.remove('disabled');
        } else if (count >= state.maxSelectedSounds) {
            card.classList.remove('selected');
            card.classList.add('disabled');
        } else {
            card.classList.remove('selected');
            card.classList.remove('disabled');
        }
    });

    // Update quick sounds
    updateQuickSounds();
}

/**
 * Update quick sounds containers with selected sounds
 */
function updateQuickSounds() {
    const quickSoundsRotate = document.getElementById('quickSoundsRotate');
    const quickSoundsWalk = document.getElementById('quickSoundsWalk');

    if (!quickSoundsRotate || !quickSoundsWalk) return;

    // Clear existing content
    quickSoundsRotate.innerHTML = '';
    quickSoundsWalk.innerHTML = '';

    // If no sounds selected, show message
    if (state.selectedSounds.size === 0) {
        const message = '<p class="no-sounds-message">Selecciona hasta 4 sonidos</p>';
        quickSoundsRotate.innerHTML = message;
        quickSoundsWalk.innerHTML = message;
        return;
    }

    // Create buttons for each selected sound
    state.selectedSounds.forEach(soundId => {
        const data = soundData[soundId];
        if (!data) return;

        // Create button
        const button = document.createElement('button');
        button.className = 'quick-sound-btn';
        button.innerHTML = `${data.icon}<span class="sound-hint">${data.name}</span>`;
        button.dataset.song = soundId;
        button.title = data.name;

        // Clone for both containers
        const buttonForRotate = button.cloneNode(true);
        const buttonForWalk = button.cloneNode(true);

        quickSoundsRotate.appendChild(buttonForRotate);
        quickSoundsWalk.appendChild(buttonForWalk);
    });
}

// ========== BUZZER ==========

/**
 * Play buzzer song (only if selected)
 * @param {number} songNumber - Song index
 */
async function playSong(songNumber) {
    // Check if sound is selected
    if (!state.selectedSounds.has(songNumber.toString())) {
        addLog(`⚠️ El sonido no está seleccionado`);
        return;
    }

    const now = Date.now();
    if (now - state.lastCommandTime.buzzer < state.commandCooldown) {
        addLog(`⏳ Esperar antes de otro sonido`);
        return;
    }
    state.lastCommandTime.buzzer = now;

    const songNames = [
        "Conectar", "Desconectar", "Botón", "Batalla", "Furia", "Ninja",
        "Sorpresa", "¡Oh!", "¡Oh! 2", "Tierno", "Durmiendo", "Feliz",
        "Muy Feliz", "Feliz Corto", "Triste", "Confundido"
    ];

    addLog(`🔊 SOUND: ${songNames[songNumber]} (${songNumber})`);
    await sendRequest('buzzer', { song: songNumber });
}

// ========== CALIBRATION ==========

/**
 * Update offset display
 * @param {string} leg - 'left' or 'right'
 * @param {number} value - Offset value
 */
function updateOffsetDisplay(leg, value) {
    const valueElement = elements[`offset${leg.charAt(0).toUpperCase() + leg.slice(1)}Value`];
    if (valueElement) {
        valueElement.innerText = `${value}°`;
    }

    if (leg === 'left') {
        state.currentOffsetLeft = parseInt(value);
    } else {
        state.currentOffsetRight = parseInt(value);
    }
}

/**
 * Apply single offset
 * @param {string} leg - 'left' or 'right'
 */
async function applyOffset(leg) {
    const value = leg === 'left' ? state.currentOffsetLeft : state.currentOffsetRight;
    addLog(`⚙️ OFFSET ${leg.toUpperCase()}: ${value}°`);
    await sendRequest('offset', { [leg]: value });
}

/**
 * Apply both offsets
 */
async function applyBothOffsets() {
    addLog(`⚙️ OFFSETS: L=${state.currentOffsetLeft}° R=${state.currentOffsetRight}°`);
    await sendRequest('offset', {
        left: state.currentOffsetLeft,
        right: state.currentOffsetRight
    });
}

/**
 * Reset all offsets
 */
function resetOffsets() {
    state.currentOffsetLeft = 0;
    state.currentOffsetRight = 0;

    elements.offsetLeft.value = 0;
    elements.offsetRight.value = 0;

    updateOffsetDisplay('left', 0);
    updateOffsetDisplay('right', 0);

    applyBothOffsets();
}

// ========== JOYSTICK ==========

/**
 * Update joystick visual position immediately (smooth)
 * @param {number} dx - X offset in pixels
 * @param {number} dy - Y offset in pixels
 */
function updateJoystickVisual(dx, dy) {
    elements.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    const x = Math.round(dx / state.joystick.maxDist * 100);
    const y = Math.round(-dy / state.joystick.maxDist * 100);

    elements.xValue.innerText = x;
    elements.yValue.innerText = y;

    state.joystick.currentX = x;
    state.joystick.currentY = y;
}

/**
 * Send joystick update to ESP32 (throttled)
 */
function sendJoystickUpdate() {
    if (!state.connected) return;

    // Verificar si el valor cambió (evitar comandos duplicados)
    if (state.joystick.currentX === state.joystick.lastX &&
        state.joystick.currentY === state.joystick.lastY) {
        return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - state.joystick.lastUpdate;

    if (timeSinceLastUpdate < state.joystick.updateInterval) {
        state.joystick.pendingUpdate = true;
        return;
    }

    // Verificar cooldown global para no saturar ESP32
    if (now - state.lastCommandTime.joystick < state.commandCooldown) {
        return;
    }

    state.joystick.lastUpdate = now;
    state.joystick.pendingUpdate = false;
    state.lastCommandTime.joystick = now;

    // Guardar última posición enviada
    state.joystick.lastX = state.joystick.currentX;
    state.joystick.lastY = state.joystick.currentY;

    // Enviar sin esperar (fire and forget) con timeout
    const url = `http://${state.espIP}/joystick?x=${state.joystick.currentX}&y=${state.joystick.currentY}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 segundo timeout

    fetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        signal: controller.signal
    }).catch(() => {}).finally(() => clearTimeout(timeoutId));
}

/**
 * Handle joystick movement
 * @param {MouseEvent|TouchEvent} event - Input event
 */
function handleJoystick(event) {
    if (!state.joystick.dragging) {
        // Inicio del arrastre - guardar posición inicial
        const rect = elements.joystickKnob.parentElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        state.joystick.dragStartX = event.clientX;
        state.joystick.dragStartY = event.clientY;

        // Posición actual del knob al iniciar
        const currentTransform = elements.joystickKnob.style.transform;
        if (currentTransform.includes('translate')) {
            // Extraer posición actual si existe
            const matches = currentTransform.match(/translate\(calc\(-50% \+ (-?\d+(?:\.\d+)?)px\), calc\(-50% \+ (-?\d+(?:\.\d+)?)px\)\)/);
            if (matches) {
                state.joystick.knobStartX = parseFloat(matches[1]);
                state.joystick.knobStartY = parseFloat(matches[2]);
            } else {
                state.joystick.knobStartX = 0;
                state.joystick.knobStartY = 0;
            }
        } else {
            state.joystick.knobStartX = 0;
            state.joystick.knobStartY = 0;
        }

        // Actualizar posición inicial si es el primer movimiento
        if (state.joystick.currentX === 0 && state.joystick.currentY === 0) {
            let dx = event.clientX - centerX;
            let dy = event.clientY - centerY;

            const dist = Math.min(Math.sqrt(dx * dx + dy * dy), state.joystick.maxDist);
            const ang = Math.atan2(dy, dx);

            dx = dist * Math.cos(ang);
            dy = dist * Math.sin(ang);

            state.joystick.knobStartX = dx;
            state.joystick.knobStartY = dy;

            updateJoystickVisual(dx, dy);
            sendJoystickUpdate();
        }
    } else {
        // Durante el arrastre - calcular desplazamiento relativo
        const deltaX = event.clientX - state.joystick.dragStartX;
        const deltaY = event.clientY - state.joystick.dragStartY;

        let newX = state.joystick.knobStartX + deltaX;
        let newY = state.joystick.knobStartY + deltaY;

        // Limitar al radio máximo
        const dist = Math.min(Math.sqrt(newX * newX + newY * newY), state.joystick.maxDist);
        const ang = Math.atan2(newY, newX);

        const finalX = dist * Math.cos(ang);
        const finalY = dist * Math.sin(ang);

        updateJoystickVisual(finalX, finalY);
        sendJoystickUpdate();
    }
}

/**
 * Stop joystick movement
 */
function stopJoystick() {
    if (!state.joystick.dragging) return;

    state.joystick.dragging = false;
    state.joystick.pendingUpdate = false;

    // Reset visual immediately
    elements.joystickKnob.style.transform = 'translate(-50%, -50%)';
    elements.xValue.innerText = '0';
    elements.yValue.innerText = '0';

    state.joystick.currentX = 0;
    state.joystick.currentY = 0;

    // Reset drag positions
    state.joystick.dragStartX = 0;
    state.joystick.dragStartY = 0;
    state.joystick.knobStartX = 0;
    state.joystick.knobStartY = 0;

    // Send stop command immediately
    if (state.connected) {
        const url = `http://${state.espIP}/joystick?x=0&y=0`;
        fetch(url, { mode: 'cors', cache: 'no-cache', keepalive: true }).catch(() => {});
    }
}

/**
 * Process pending joystick updates
 */
function processJoystickUpdates() {
    if (state.joystick.pendingUpdate && state.joystick.dragging) {
        sendJoystickUpdate();
    }
    requestAnimationFrame(processJoystickUpdates);
}

/**
 * Initialize joystick events
 */
function initJoystick() {
    if (!elements.joystickKnob) {
        console.error("Joystick knob element not found");
        return;
    }

    const base = elements.joystickKnob.parentElement;
    if (!base) {
        console.error("Joystick base element not found");
        return;
    }

    // Use Pointer Events for unified mouse/touch handling
    base.addEventListener('pointerdown', (e) => {
        base.setPointerCapture(e.pointerId);

        // Primero manejar el evento inicial SIN establecer dragging
        // Esto permite detectar si es el primer movimiento o no
        handleJoystick(e);

        // Después de procesar, establecer dragging
        state.joystick.dragging = true;
    });

    base.addEventListener('pointermove', (e) => {
        if (state.joystick.dragging) {
            handleJoystick(e);
        }
    });

    base.addEventListener('pointerup', (e) => {
        stopJoystick();
        base.releasePointerCapture(e.pointerId);
    });

    base.addEventListener('pointercancel', (e) => {
        stopJoystick();
        base.releasePointerCapture(e.pointerId);
    });

    base.addEventListener('pointerleave', (e) => {
        if (state.joystick.dragging) {
            stopJoystick();
            base.releasePointerCapture(e.pointerId);
        }
    });
}

// ========== EVENT LISTENERS ==========

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Drawer controls
    elements.menuBtn?.addEventListener('click', openDrawer);
    elements.navClose?.addEventListener('click', closeDrawer);
    elements.navOverlay?.addEventListener('click', closeDrawer);

    // Navigation drawer items
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const panel = item.dataset.panel;
            if (panel) showPanel(panel);
        });
    });

    // Game mode toggle
    document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode) switchGameMode(mode);
        });
    });

    // Connect button
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', connect);
    }

    // Walk buttons
    document.querySelectorAll('[data-action="walk"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            if (cmd) walk(cmd);
        });
    });

    // Arm buttons
    document.querySelectorAll('[data-action="arm"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            if (cmd) arm(cmd);
        });
    });

    // Head buttons
    document.querySelectorAll('[data-action="head"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            if (cmd) headMove(cmd);
        });
    });

    // Attack buttons (use event delegation for dynamically added buttons)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="attack"]');
        if (btn) {
            const cmd = btn.dataset.cmd;
            if (cmd) attack(cmd);
        }

        // Quick sound buttons
        const soundBtn = e.target.closest('.quick-sound-btn');
        if (soundBtn) {
            const song = soundBtn.dataset.song;
            if (song !== undefined) playSong(song);
        }
    });

    // Attack checkboxes
    elements.attackCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const attackId = checkbox.id.replace('attack-', '');
            toggleAttackSelection(attackId, checkbox);
        });
    });

    // Buzzer checkboxes
    elements.buzzerCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const soundId = checkbox.id.replace('buzzer-', '');
            toggleSoundSelection(soundId, checkbox);
        });
    });

    // Buzzer buttons/cards
    document.querySelectorAll('.buzzer-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on checkbox
            if (e.target.classList.contains('buzzer-checkbox-input') ||
                e.target.classList.contains('buzzer-checkbox-label')) {
                return;
            }

            const song = card.dataset.song;
            if (song !== undefined) playSong(song);
        });
    });

    // Legacy buzzer buttons (if any)
    document.querySelectorAll('.buzzer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const song = btn.dataset.song;
            if (song !== undefined) playSong(song);
        });
    });

    // Calibrate buttons
    document.querySelectorAll('[data-action="calibrate"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            if (cmd === 'apply-left') applyOffset('left');
            else if (cmd === 'apply-right') applyOffset('right');
            else if (cmd === 'apply-both') applyBothOffsets();
            else if (cmd === 'reset') resetOffsets();
        });
    });

    // Offset sliders
    if (elements.offsetLeft) {
        elements.offsetLeft.addEventListener('input', (e) => {
            updateOffsetDisplay('left', e.target.value);
        });
    }

    if (elements.offsetRight) {
        elements.offsetRight.addEventListener('input', (e) => {
            updateOffsetDisplay('right', e.target.value);
        });
    }
}

// ========== INITIALIZATION ==========

/**
 * Initialize application
 */
function init() {
    try {
        initJoystick();
        setupEventListeners();

        // Start joystick update processing loop
        processJoystickUpdates();

        // Initialize quick attacks UI
        updateQuickAttacks();

        // Initialize quick sounds UI
        updateQuickSounds();

        // Initialize sounds UI
        updateSoundsUI();

        addLog("🚀 SISTEMA INICIADO - OTTO NINJA PRO v2.0");
        addLog("📡 Esperando conexión...");

        // Show default panel
        showPanel('game-controls');
    } catch (error) {
        console.error("Error al inicializar:", error);
        alert("Error al inicializar la aplicación. Por favor recarga la página.");
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export functions for global access (for HTML onclick attributes)
window.showPanel = showPanel;
window.switchGameMode = switchGameMode;
window.toggleAttackSelection = toggleAttackSelection;
window.updateQuickAttacks = updateQuickAttacks;
window.toggleSoundSelection = toggleSoundSelection;
window.updateSoundsUI = updateSoundsUI;
window.updateQuickSounds = updateQuickSounds;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.toggleDrawer = toggleDrawer;
window.connect = connect;
window.walk = walk;
window.arm = arm;
window.headMove = headMove;
window.attack = attack;
window.playSong = playSong;
window.updateOffsetDisplay = updateOffsetDisplay;
window.applyOffset = applyOffset;
window.applyBothOffsets = applyBothOffsets;
window.resetOffsets = resetOffsets;
