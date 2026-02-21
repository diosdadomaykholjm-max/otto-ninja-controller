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
    selectedDisplayMessages: new Set(),
    maxSelectedDisplayMessages: 4,
    customMessages: [], // Array de mensajes personalizados
    customMelodies: {}, // Melodías MIDI importadas { 16: {name, notes}, 17: ... }
    volume: 30, // Volumen del buzzer (0-100)
    muted: false, // Estado de silencio
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
    buzzerCards: document.querySelectorAll('.buzzer-card'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeToggleBtn: document.getElementById('volumeToggleBtn'),
    volumePanel: document.getElementById('volumePanel'),
    volumeMuteBtn: document.getElementById('volumeMuteBtn'),
    volumeIcon: document.getElementById('volumeIcon'),
    volumeUp: document.getElementById('volumeUp'),
    volumeDown: document.getElementById('volumeDown')
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

    // Stop live ultrasonic polling when leaving the ultrasonic panel
    if (state.currentMode === 'ultrasonic' && panelId !== 'ultrasonic') {
        stopUltrasonicLive();
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

    // Start live ultrasonic polling when entering the ultrasonic panel
    if (panelId === 'ultrasonic') {
        startUltrasonicLive();
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
            addLog(`⚠️ Máximo 4 ataques permitidos`);
            return;
        }
        state.selectedAttacks.add(attackId);

        // Ejecutar el ataque como preview (solo si está conectado)
        if (state.connected) {
            // Agregar temporalmente a selectedAttacks para permitir ejecución
            attack(attackId);
        }
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

        // Reproducir el sonido como preview al seleccionar
        playSong(soundId, true);
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

// Web Audio API Context
let audioContext = null;

/**
 * Initialize Audio Context (lazy initialization)
 */
function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

/**
 * Play a single tone using Web Audio API
 * @param {number} frequency - Frequency in Hz
 * @param {number} duration - Duration in milliseconds
 */
function playTone(frequency, duration) {
    return new Promise((resolve) => {
        const ctx = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'square'; // Similar to buzzer sound

        // Calcular ganancia basada en volumen y estado de mute
        const targetGain = state.muted ? 0 : (state.volume / 100) * 0.5;

        // Envelope for better sound
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + duration / 1000 - 0.01);
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration / 1000);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration / 1000);

        setTimeout(resolve, duration);
    });
}

/**
 * Sound definitions (based on melodias.h from Arduino code)
 * Each sound is an array of [frequency, duration] pairs
 */
const soundMelodies = {
    0: [ // S_CONNECTION - Conectar
        [523, 50], [0, 30], [523, 100]
    ],
    1: [ // S_DISCONNECTION - Desconectar
        [523, 50], [0, 30], [392, 100]
    ],
    2: [ // S_BUTTON_PUSHED - Botón
        [1047, 50]
    ],
    3: [ // S_MODE1 - Batalla
        [262, 100], [330, 100], [392, 100], [523, 100]
    ],
    4: [ // S_MODE2 - Furia
        [392, 100], [523, 100], [659, 100], [784, 100]
    ],
    5: [ // S_MODE3 - Ninja
        [659, 100], [523, 100], [392, 100], [330, 100]
    ],
    6: [ // S_SURPRISE - Sorpresa
        [523, 70], [0, 50], [659, 150]
    ],
    7: [ // S_OhOoh - ¡Oh!
        [330, 150], [392, 150]
    ],
    8: [ // S_OhOoh2 - ¡Oh! 2
        [392, 150], [330, 150]
    ],
    9: [ // S_CUDDLY - Tierno
        [523, 100], [659, 100], [784, 100], [1047, 100]
    ],
    10: [ // S_SLEEPING - Durmiendo
        [262, 200], [0, 100], [262, 200], [0, 100], [262, 200]
    ],
    11: [ // S_HAPPY - Feliz
        [523, 100], [587, 100], [659, 100], [784, 150]
    ],
    12: [ // S_SUPER_HAPPY - Muy Feliz
        [523, 80], [659, 80], [784, 80], [1047, 80], [784, 80], [659, 80], [523, 150]
    ],
    13: [ // S_HAPPY_SHORT - Feliz Corto
        [523, 80], [659, 80], [784, 100]
    ],
    14: [ // S_SAD - Triste
        [392, 150], [330, 150], [262, 200]
    ],
    15: [ // S_CONFUSED - Confundido
        [392, 100], [330, 100], [392, 100], [330, 100]
    ]
};

/**
 * Play melody in browser using Web Audio API
 * @param {number} songNumber - Song index
 */
async function playMelodyInBrowser(songNumber) {
    let melody = soundMelodies[songNumber];

    // Buscar en melodías personalizadas si no es predefinida
    if (!melody && state.customMelodies[songNumber]) {
        melody = state.customMelodies[songNumber].notes;
    }

    if (!melody) {
        console.error(`Melody ${songNumber} not found`);
        return;
    }

    for (const [frequency, duration] of melody) {
        if (frequency === 0) {
            // Rest/silence
            await new Promise(resolve => setTimeout(resolve, duration));
        } else {
            await playTone(frequency, duration);
        }
    }
}

/**
 * Play buzzer song
 * @param {number} songNumber - Song index
 * @param {boolean} isPreview - If true, play without checking if selected
 */
async function playSong(songNumber, isPreview = false) {
    // Check if sound is selected (skip check for previews)
    if (!isPreview && !state.selectedSounds.has(songNumber.toString())) {
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

    const songName = songNames[songNumber] ||
        (state.customMelodies[songNumber]?.name || `Custom ${songNumber}`);

    const prefix = isPreview ? '🎵 Preview' : '🔊 SOUND';
    addLog(`${prefix}: ${songName} (${songNumber})`);

    // Play in browser (always for preview, or when not connected)
    if (isPreview || !state.connected) {
        try {
            await playMelodyInBrowser(songNumber);
        } catch (error) {
            console.error('Error playing sound in browser:', error);
            addLog(`⚠️ Error al reproducir sonido en navegador`);
        }
    }

    // Send to ESP32 if connected and not just a preview
    if (state.connected && !isPreview) {
        await sendRequest('buzzer', { song: songNumber });
    }
}

// ========== CUSTOM MELODIES ==========

/**
 * Renderizar tarjetas de melodías personalizadas en el panel de buzzer
 */
function renderCustomMelodyCards() {
    const grid = document.getElementById('customMelodiesGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const melodyEntries = Object.entries(state.customMelodies);

    if (melodyEntries.length === 0) {
        grid.innerHTML = '<p class="no-custom-melodies">No hay melodias personalizadas. Importa un archivo MIDI para crear una.</p>';
        return;
    }

    melodyEntries.forEach(([songNum, melody]) => {
        const isSent = melody.sentToEsp === true;
        const card = document.createElement('div');
        card.className = 'custom-melody-card buzzer-card';
        card.dataset.song = songNum;
        card.title = melody.name + ' (' + melody.notes.length + ' notas)';
        card.innerHTML =
            '<div class="melody-card-actions">' +
                '<button class="melody-edit-btn" data-edit-song="' + songNum + '" title="Editar melodia">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                '</button>' +
            '</div>' +
            '<div class="buzzer-checkbox">' +
                '<input type="checkbox" class="buzzer-checkbox-input" id="buzzer-' + songNum + '">' +
                '<label for="buzzer-' + songNum + '" class="buzzer-checkbox-label"></label>' +
            '</div>' +
            '<span class="buzzer-name">' + melody.name + '</span>' +
            '<div class="melody-esp-status">' +
                (isSent
                    ? '<span class="melody-status-sent" title="Guardada en el robot">En robot</span>'
                    : '<button class="melody-send-btn" data-send-song="' + songNum + '" title="Enviar al robot">Enviar al robot</button>'
                ) +
            '</div>';

        // Drag to trash
        card.draggable = true;
        card.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', songNum);
            e.dataTransfer.effectAllowed = 'move';
            card.classList.add('dragging');
            document.getElementById('melodyTrashZone')?.classList.add('visible');
        });
        card.addEventListener('dragend', function() {
            card.classList.remove('dragging');
            document.getElementById('melodyTrashZone')?.classList.remove('visible', 'over');
        });

        // Click en la tarjeta = preview
        card.addEventListener('click', function(e) {
            if (e.target.closest('.melody-edit-btn') || e.target.closest('.buzzer-checkbox') || e.target.closest('.melody-send-btn')) return;
            playSong(parseInt(songNum), true);
        });

        // Click en editar
        const editBtn = card.querySelector('.melody-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof window.editCustomMelody === 'function') {
                    window.editCustomMelody(songNum);
                }
            });
        }

        // Click en enviar al robot
        const sendBtn = card.querySelector('.melody-send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof window.sendMelodyToESP32BySlot === 'function') {
                    window.sendMelodyToESP32BySlot(songNum);
                }
            });
        }

        grid.appendChild(card);
    });

    // Trash zone drag events (re-bind each render)
    const trashZone = document.getElementById('melodyTrashZone');
    if (trashZone) {
        trashZone.ondragover = function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            trashZone.classList.add('over');
        };
        trashZone.ondragleave = function() {
            trashZone.classList.remove('over');
        };
        trashZone.ondrop = function(e) {
            e.preventDefault();
            trashZone.classList.remove('over', 'visible');
            const slot = e.dataTransfer.getData('text/plain');
            const melodyName = state.customMelodies[slot]?.name || 'esta melodia';
            if (confirm('Eliminar "' + melodyName + '"?')) {
                if (typeof window.deleteCustomMelody === 'function') {
                    window.deleteCustomMelody(slot);
                }
            }
        };
    }
}

// ========== DISPLAY MESSAGES ==========

/**
 * Display message data for quick access
 */
const displayMessageData = {
    'HOLA': { icon: '👋', name: 'HOLA' },
    'ADIOS': { icon: '👋', name: 'ADIOS' },
    'FELIZ': { icon: '😊', name: 'FELIZ' },
    'TRISTE': { icon: '😢', name: 'TRISTE' },
    'ENOJADO': { icon: '😡', name: 'ENOJADO' },
    'LISTO': { icon: '✅', name: 'LISTO' },
    'ESPERA': { icon: '⏳', name: 'ESPERA' },
    'ERROR': { icon: '❌', name: 'ERROR' },
    'OK': { icon: '👍', name: 'OK' },
    'NINJA': { icon: '🥷', name: 'NINJA' }
};

/**
 * Toggle display message selection
 * @param {string} messageId - Message identifier
 * @param {HTMLInputElement} checkbox - Checkbox element
 */
function toggleDisplayMessageSelection(messageId, checkbox) {
    if (checkbox.checked) {
        if (state.selectedDisplayMessages.size >= state.maxSelectedDisplayMessages) {
            checkbox.checked = false;
            addLog(`⚠️ Máximo 4 mensajes permitidos`);
            return;
        }
        state.selectedDisplayMessages.add(messageId);

        // Mostrar mensaje como preview
        if (state.connected) {
            sendDisplayMessage(messageId);
        }
    } else {
        state.selectedDisplayMessages.delete(messageId);
    }

    updateDisplayMessagesUI();

    const action = checkbox.checked ? 'Seleccionado' : 'Deseleccionado';
    addLog(`📺 ${action}: ${messageId}`);
}

/**
 * Update display messages UI based on selection
 */
function updateDisplayMessagesUI() {
    const count = state.selectedDisplayMessages.size;
    const displayCounter = document.getElementById('displayCounter');
    if (displayCounter) {
        displayCounter.innerText = count;
    }

    // Update cards
    const displayCards = document.querySelectorAll('.display-card');
    displayCards.forEach(card => {
        const checkbox = card.querySelector('.display-checkbox-input');
        if (!checkbox) return;

        const messageId = checkbox.id.replace('display-', '').toUpperCase();

        if (state.selectedDisplayMessages.has(messageId)) {
            card.classList.add('selected');
            card.classList.remove('disabled');
        } else if (count >= state.maxSelectedDisplayMessages) {
            card.classList.remove('selected');
            card.classList.add('disabled');
        } else {
            card.classList.remove('selected');
            card.classList.remove('disabled');
        }
    });

    // Update quick display messages
    updateQuickDisplayMessages();
}

/**
 * Update quick display messages containers with selected messages
 */
function updateQuickDisplayMessages() {
    const quickDisplayRotate = document.getElementById('quickDisplayRotate');
    const quickDisplayWalk = document.getElementById('quickDisplayWalk');

    if (!quickDisplayRotate || !quickDisplayWalk) return;

    // Clear existing content
    quickDisplayRotate.innerHTML = '';
    quickDisplayWalk.innerHTML = '';

    // If no messages selected, show message
    if (state.selectedDisplayMessages.size === 0) {
        const message = '<p class="no-display-message">Selecciona hasta 4 mensajes</p>';
        quickDisplayRotate.innerHTML = message;
        quickDisplayWalk.innerHTML = message;
        return;
    }

    // Create buttons for each selected message
    state.selectedDisplayMessages.forEach(messageId => {
        // Check if it's a predefined message or custom message
        let data = displayMessageData[messageId];
        let icon = data ? data.icon : '💬';
        let text = messageId;

        // Create button
        const button = document.createElement('button');
        button.className = 'quick-display-btn';
        button.innerHTML = `
            <span class="display-icon">${icon}</span>
            <span class="display-text">${text}</span>
        `;
        button.dataset.msg = messageId;
        button.title = text;

        // Clone for both containers
        const buttonForRotate = button.cloneNode(true);
        const buttonForWalk = button.cloneNode(true);

        // Add click event
        buttonForRotate.addEventListener('click', () => sendDisplayMessage(messageId));
        buttonForWalk.addEventListener('click', () => sendDisplayMessage(messageId));

        quickDisplayRotate.appendChild(buttonForRotate);
        quickDisplayWalk.appendChild(buttonForWalk);
    });
}

/**
 * Add custom message
 */
function addCustomMessage() {
    const input = document.getElementById('customMessageInput');
    if (!input) return;

    const message = input.value.trim().toUpperCase();

    if (!message) {
        addLog('⚠️ Escribe un mensaje primero');
        return;
    }

    if (message.length > 16) {
        addLog('⚠️ Mensaje muy largo (máx 16 caracteres)');
        return;
    }

    // Check if already exists
    if (state.customMessages.includes(message)) {
        addLog('⚠️ Este mensaje ya existe');
        return;
    }

    state.customMessages.push(message);
    input.value = '';
    updateCustomMessagesList();
    addLog(`✅ Mensaje agregado: ${message}`);
}

/**
 * Delete custom message
 * @param {string} message - Message to delete
 */
function deleteCustomMessage(message) {
    const index = state.customMessages.indexOf(message);
    if (index > -1) {
        state.customMessages.splice(index, 1);
        state.selectedDisplayMessages.delete(message);
        updateCustomMessagesList();
        updateDisplayMessagesUI();
        addLog(`🗑️ Mensaje eliminado: ${message}`);
    }
}

/**
 * Update custom messages list
 */
function updateCustomMessagesList() {
    const list = document.getElementById('customMessagesList');
    if (!list) return;

    list.innerHTML = '';

    if (state.customMessages.length === 0) {
        list.innerHTML = '<p class="no-custom-messages">No hay mensajes personalizados</p>';
        return;
    }

    state.customMessages.forEach(message => {
        const item = document.createElement('div');
        item.className = 'custom-message-item';

        const isSelected = state.selectedDisplayMessages.has(message);

        item.innerHTML = `
            <span class="custom-message-text">${message}</span>
            <div class="custom-message-actions">
                <button class="custom-message-btn custom-message-select-btn" data-msg="${message}" title="${isSelected ? 'Deseleccionar' : 'Seleccionar'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        ${isSelected ? '<path d="M5 13l4 4L19 7"/>' : '<path d="M12 5v14M5 12h14"/>'}
                    </svg>
                </button>
                <button class="custom-message-btn custom-message-delete-btn" data-delete="${message}" title="Eliminar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18M8 6V4h8v2m-9 0v12a2 2 0 002 2h6a2 2 0 002-2V6H7z"/>
                    </svg>
                </button>
            </div>
        `;

        list.appendChild(item);
    });
}

/**
 * Send display message to ESP32
 * @param {string} message - Message to display
 */
async function sendDisplayMessage(message) {
    addLog(`📺 DISPLAY: ${message}`);
    await sendRequest('display', { msg: message });
}

// ========== BITMAP / IMAGE TO OLED ==========

const bitmapState = {
    sourceImage: null,
    threshold: 128,
    invert: false,
    scale: 'fit',
    rotation: 0,
    byteArray: null,
    title: 'Otto Ninja',
    titleInvert: false
};

function bitmapLoadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            bitmapState.sourceImage = img;
            const origCanvas = document.getElementById('bitmapOriginalCanvas');
            if (origCanvas) {
                const ctx = origCanvas.getContext('2d');
                ctx.clearRect(0, 0, 128, 48);
                ctx.drawImage(img, 0, 0, 128, 48);
            }
            const workspace = document.getElementById('bitmapWorkspace');
            if (workspace) workspace.style.display = 'flex';
            bitmapRender();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function bitmapRender() {
    if (!bitmapState.sourceImage) return;
    const W = 128, H = 48;
    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    const octx = offscreen.getContext('2d');
    octx.fillStyle = bitmapState.invert ? '#000' : '#fff';
    octx.fillRect(0, 0, W, H);

    const img = bitmapState.sourceImage;
    const rot = bitmapState.rotation;

    // Para rotaciones 90/270 el ancho y alto de la imagen original se invierten
    const imgW = (rot === 90 || rot === 270) ? img.height : img.width;
    const imgH = (rot === 90 || rot === 270) ? img.width  : img.height;

    let dx = 0, dy = 0, dw = W, dh = H;
    if (bitmapState.scale === 'fit') {
        const r = Math.min(W / imgW, H / imgH);
        dw = Math.round(imgW * r); dh = Math.round(imgH * r);
        dx = Math.round((W - dw) / 2);  dy = Math.round((H - dh) / 2);
    } else if (bitmapState.scale === 'fill') {
        const r = Math.max(W / imgW, H / imgH);
        dw = Math.round(imgW * r); dh = Math.round(imgH * r);
        dx = Math.round((W - dw) / 2);  dy = Math.round((H - dh) / 2);
    }

    octx.save();
    octx.translate(W / 2, H / 2);
    octx.rotate(rot * Math.PI / 180);
    // Para 90/270 los ejes dw/dh quedan invertidos respecto al canvas final
    if (rot === 90 || rot === 270) {
        octx.drawImage(img, -dh / 2 + (dy - H / 2 + dh / 2), -dw / 2 + (dx - W / 2 + dw / 2), dh, dw);
    } else {
        octx.drawImage(img, dx - W / 2, dy - H / 2, dw, dh);
    }
    octx.restore();

    const pixels = octx.getImageData(0, 0, W, H).data;
    const BPR = W / 8;
    const bytes = new Uint8Array(H * BPR);
    const thresh = bitmapState.threshold;
    const inv = bitmapState.invert;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const lum = pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114;
            let on = lum >= thresh ? 1 : 0;
            if (inv) on = 1 - on;
            if (on) {
                bytes[y * BPR + Math.floor(x / 8)] |= (1 << (7 - (x % 8)));
            }
        }
    }
    bitmapState.byteArray = bytes;

    const previewCanvas = document.getElementById('bitmapPreviewCanvas');
    if (previewCanvas) {
        const pctx = previewCanvas.getContext('2d');
        // Canvas es 128×64: 16px zona amarilla + 48px zona azul
        const PW = 128, PH = 64, TITLE_H = 16;
        const pd = pctx.createImageData(PW, PH);

        const titleInv = bitmapState.titleInvert;

        // Zona amarilla (filas 0-15): normal=fondo oscuro dorado / invertido=fondo dorado claro
        for (let y = 0; y < TITLE_H; y++) {
            for (let x = 0; x < PW; x++) {
                const idx = (y * PW + x) * 4;
                if (titleInv) {
                    pd.data[idx]   = 255; pd.data[idx+1] = 215; pd.data[idx+2] = 0;
                } else {
                    pd.data[idx]   = 40;  pd.data[idx+1] = 32;  pd.data[idx+2] = 0;
                }
                pd.data[idx+3] = 255;
            }
        }
        // Zona azul (filas 16-63): pixels del bitmap
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const on = (bytes[y * BPR + Math.floor(x / 8)] >> (7 - (x % 8))) & 1;
                const idx = ((y + TITLE_H) * PW + x) * 4;
                pd.data[idx]   = on ? 0   : 0;
                pd.data[idx+1] = on ? 140 : 0;
                pd.data[idx+2] = on ? 255 : 18;
                pd.data[idx+3] = 255;
            }
        }
        pctx.putImageData(pd, 0, 0);

        // Texto del título en zona amarilla (invertido: texto oscuro sobre fondo dorado)
        pctx.fillStyle = titleInv ? '#1a1200' : '#FFD700';
        pctx.font = 'bold 9px monospace';
        pctx.textAlign = 'center';
        pctx.textBaseline = 'middle';
        pctx.fillText(bitmapState.title || 'Otto Ninja', PW / 2, TITLE_H / 2);
    }

    bitmapGenerateCCode(bytes);
}

function bitmapGenerateCCode(bytes) {
    const BPR = 16;
    const lines = [
        '// 128x48 OLED bitmap — generado por Otto Ninja Controller',
        '// Uso: display.drawBitmap(0, 16, ottoBitmap, 128, 48, WHITE);',
        'const uint8_t PROGMEM ottoBitmap[] = {'
    ];
    for (let row = 0; row < 48; row++) {
        const hex = [];
        for (let col = 0; col < BPR; col++) {
            hex.push('0x' + bytes[row * BPR + col].toString(16).padStart(2, '0').toUpperCase());
        }
        lines.push('    ' + hex.join(', ') + (row < 47 ? ',' : ''));
    }
    lines.push('};');
    const code = lines.join('\n');
    const codeOutput  = document.getElementById('bitmapCodeOutput');
    const codeSection = document.getElementById('bitmapCodeSection');
    const codeSize    = document.getElementById('bitmapCodeSize');
    if (codeOutput)  codeOutput.textContent = code;
    if (codeSection) codeSection.style.display = 'block';
    if (codeSize)    codeSize.textContent = bytes.length + ' bytes';
}

async function bitmapCopyCode() {
    const el = document.getElementById('bitmapCodeOutput');
    if (!el || !el.textContent) { addLog('Bitmap: nada que copiar'); return; }
    try {
        await navigator.clipboard.writeText(el.textContent);
        addLog('Bitmap: código C copiado al portapapeles');
    } catch(e) {
        addLog('Bitmap: no se pudo copiar — ' + e.message);
    }
}

async function bitmapSendToESP32() {
    if (!bitmapState.byteArray) { addLog('Bitmap: convertí una imagen primero'); return; }
    if (!state.espIP)           { addLog('Bitmap: ingresá una IP válida'); return; }
    if (!state.connected)       { addLog('Bitmap: no conectado al robot'); return; }

    const btn = document.getElementById('bitmapSendBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`http://${state.espIP}/bitmap`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: bitmapState.title || 'Otto Ninja', invert: bitmapState.invert, titleInvert: bitmapState.titleInvert, data: Array.from(bitmapState.byteArray) }),
            signal: controller.signal
        });
        clearTimeout(tid);
        if (res.ok) {
            addLog('Bitmap: imagen enviada al OLED correctamente');
        } else {
            addLog('Bitmap: error HTTP ' + res.status);
        }
    } catch(e) {
        addLog('Bitmap: ' + (e.name === 'AbortError' ? 'timeout — ESP32 no respondió' : e.message));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Enviar al robot';
        }
    }
}

function initBitmapPanel() {
    const dropzone  = document.getElementById('bitmapDropzone');
    const fileInput = document.getElementById('bitmapFileInput');
    const threshold = document.getElementById('bitmapThreshold');
    const threshVal = document.getElementById('bitmapThresholdValue');
    const invertChk = document.getElementById('bitmapInvert');
    const titleInput      = document.getElementById('bitmapTitle');
    const titleInvertChk  = document.getElementById('bitmapTitleInvert');
    const copyBtn   = document.getElementById('bitmapCopyCode');
    const sendBtn   = document.getElementById('bitmapSendBtn');

    if (dropzone) {
        dropzone.addEventListener('click', () => fileInput && fileInput.click());
        dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
        dropzone.addEventListener('drop', e => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            const f = e.dataTransfer.files[0];
            if (f) bitmapLoadFile(f);
        });
    }
    if (fileInput) fileInput.addEventListener('change', () => fileInput.files[0] && bitmapLoadFile(fileInput.files[0]));
    if (threshold) threshold.addEventListener('input', () => {
        bitmapState.threshold = parseInt(threshold.value);
        if (threshVal) threshVal.textContent = threshold.value;
        bitmapRender();
    });
    if (invertChk) invertChk.addEventListener('change', () => { bitmapState.invert = invertChk.checked; bitmapRender(); });
    if (titleInput)     titleInput.addEventListener('input', () => { bitmapState.title = titleInput.value; bitmapRender(); });
    if (titleInvertChk) titleInvertChk.addEventListener('change', () => { bitmapState.titleInvert = titleInvertChk.checked; bitmapRender(); });

    document.querySelectorAll('.bitmap-scale-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bitmap-scale-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            bitmapState.scale = btn.dataset.scale;
            bitmapRender();
        });
    });
    document.querySelectorAll('.bitmap-rotate-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bitmap-rotate-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            bitmapState.rotation = parseInt(btn.dataset.rotation);
            bitmapRender();
        });
    });
    if (copyBtn) copyBtn.addEventListener('click', bitmapCopyCode);
    if (sendBtn) sendBtn.addEventListener('click', bitmapSendToESP32);
}

// ========== VOLUME CONTROLS ==========

/**
 * Update volume icon based on current volume and mute state
 */
function updateVolumeIcon() {
    if (!elements.volumeIcon) return;

    const volume = state.volume;
    const muted = state.muted;

    // Remover todas las clases de estado
    elements.volumeIcon.classList.remove('volume-off', 'volume-low', 'volume-medium', 'volume-high', 'muted');

    if (muted) {
        elements.volumeIcon.classList.add('muted');
    } else if (volume === 0) {
        elements.volumeIcon.classList.add('volume-off');
    } else if (volume <= 33) {
        elements.volumeIcon.classList.add('volume-low');
    } else if (volume <= 66) {
        elements.volumeIcon.classList.add('volume-medium');
    } else {
        elements.volumeIcon.classList.add('volume-high');
    }
}

/**
 * Update volume display
 */
function updateVolumeDisplay() {
    if (elements.volumeSlider) {
        elements.volumeSlider.value = state.volume;
    }

    // Update volume value display
    const volumeValueDisplay = document.getElementById('volumeValueDisplay');
    if (volumeValueDisplay) {
        volumeValueDisplay.innerText = state.volume;
    }
}

/**
 * Set volume level
 * @param {number} value - Volume level (0-100)
 */
function setVolume(value) {
    state.volume = Math.max(0, Math.min(100, value));

    updateVolumeDisplay();

    // Unmute if volume is changed from 0
    if (state.volume > 0 && state.muted) {
        state.muted = false;
    }

    updateVolumeIcon();
    addLog(`🔊 Volumen: ${state.volume}%`);
}

/**
 * Toggle mute state
 */
function toggleMute() {
    state.muted = !state.muted;
    updateVolumeIcon();

    const status = state.muted ? 'SILENCIADO' : 'ACTIVADO';
    addLog(`🔇 Sonido: ${status}`);
}

/**
 * Toggle volume panel visibility
 */
function toggleVolumePanel() {
    if (!elements.volumePanel) return;

    const isActive = elements.volumePanel.classList.contains('active');

    if (isActive) {
        closeVolumePanel();
    } else {
        openVolumePanel();
    }
}

/**
 * Open volume panel
 */
function openVolumePanel() {
    if (!elements.volumePanel || !elements.volumeToggleBtn) return;

    // Calcular posición del botón
    const btnRect = elements.volumeToggleBtn.getBoundingClientRect();
    const panelWidth = 280;

    // Posicionar el panel justo debajo del botón
    elements.volumePanel.style.top = `${btnRect.bottom + 8}px`;

    // En pantallas pequeñas, centrar el panel
    if (window.innerWidth <= 768) {
        elements.volumePanel.style.left = '50%';
        elements.volumePanel.style.transform = 'translateX(-50%)';
    } else {
        // En pantallas grandes, alinear a la derecha del botón
        const leftPosition = btnRect.right - panelWidth;

        // Asegurar que no se salga del viewport
        const minLeft = 8;
        const maxLeft = window.innerWidth - panelWidth - 8;
        const finalLeft = Math.max(minLeft, Math.min(maxLeft, leftPosition));

        elements.volumePanel.style.left = `${finalLeft}px`;
        elements.volumePanel.style.transform = 'none';
    }

    elements.volumePanel.classList.add('active');
}

/**
 * Close volume panel
 */
function closeVolumePanel() {
    if (!elements.volumePanel) return;
    elements.volumePanel.classList.remove('active');
}

/**
 * Increase volume by 10%
 */
function volumeUp() {
    setVolume(state.volume + 10);
}

/**
 * Decrease volume by 10%
 */
function volumeDown() {
    setVolume(state.volume - 10);
}

// ========== ULTRASONIC SENSOR ==========

const usState = {
    enabled: false,
    dangerThreshold: 15,
    alertThreshold: 40,
    reaction: 'stop',
    buzzerAlert: false,
    // Test state
    testRunning: false,
    testInterval: null,
    testReadings: [],
    testMaxReadings: 30,
    displayAlert: false,
    lastDistance: null,
    // Live polling
    liveInterval: null
};

/**
 * Fetch one distance reading and update the UI
 */
async function fetchUltrasonicLive() {
    if (!state.connected || !state.espIP) {
        updateUltrasonicDisplay(null, 'Sin conexión');
        return;
    }
    try {
        const url = `http://${state.espIP}/ultrasonic?action=read`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (resp.ok) {
            const data = await resp.json();
            const dist = parseInt(data.distance);
            usState.lastDistance = dist;
            updateUltrasonicDisplay(dist);
        } else {
            updateUltrasonicDisplay(null, 'Error al leer');
        }
    } catch (e) {
        updateUltrasonicDisplay(null, 'Sin respuesta');
    }
}

/**
 * Start automatic live distance polling (every 500 ms)
 */
function startUltrasonicLive() {
    if (usState.liveInterval) return;
    const dot   = document.getElementById('usLiveDot');
    const label = document.getElementById('usLiveLabel');
    if (dot)   dot.className   = 'us-live-dot active';
    if (label) label.textContent = 'En vivo';
    fetchUltrasonicLive(); // immediate first read
    usState.liveInterval = setInterval(fetchUltrasonicLive, 500);
}

/**
 * Stop live distance polling
 */
function stopUltrasonicLive() {
    if (usState.liveInterval) {
        clearInterval(usState.liveInterval);
        usState.liveInterval = null;
    }
    const dot   = document.getElementById('usLiveDot');
    const label = document.getElementById('usLiveLabel');
    if (dot)   dot.className   = 'us-live-dot';
    if (label) label.textContent = 'Pausado';
}

/**
 * Update the live reading UI
 */
function updateUltrasonicDisplay(dist, errorMsg) {
    const valEl      = document.getElementById('usDistanceValue');
    const badge      = document.getElementById('usStatusBadge');
    const fill       = document.getElementById('usBarFill');
    const sensorWrap = document.getElementById('usSensorImgWrap');

    const danger = usState.dangerThreshold;
    const alert  = usState.alertThreshold;
    const maxCm  = 150;

    if (dist === null || dist === undefined || errorMsg) {
        if (valEl) { valEl.textContent = '--'; valEl.style.color = 'rgba(255,255,255,0.35)'; }
        if (badge) { badge.textContent = errorMsg || 'Sin lectura'; badge.className = 'us-status-badge'; }
        if (fill)  fill.style.width = '0%';
        if (sensorWrap) sensorWrap.className = 'us-sensor-img-wrap';
        return;
    }

    if (valEl) valEl.textContent = dist;

    const pct = Math.min(100, (dist / maxCm) * 100);
    if (fill) fill.style.width = pct + '%';

    let status, color, stateClass;
    if (dist <= danger) {
        status = 'Peligro — obstáculo cercano'; color = '#ff3b30'; stateClass = 'danger';
    } else if (dist <= alert) {
        status = 'Alerta — objeto detectado'; color = '#ff9f0a'; stateClass = 'alert';
    } else {
        status = 'Libre — sin obstáculos'; color = '#34c759'; stateClass = 'normal';
    }

    if (valEl) valEl.style.color = color;
    if (fill)  fill.style.background = color;
    if (badge) { badge.textContent = status; badge.className = 'us-status-badge ' + stateClass; }
    if (sensorWrap) sensorWrap.className = 'us-sensor-img-wrap ' + stateClass;
}

/**
 * Update the zone markers on the distance bar
 */
function updateUltrasonicMarkers() {
    const maxCm = 150;
    const dangerMarker = document.getElementById('usBarDanger');
    const alertMarker  = document.getElementById('usBarAlert');
    if (dangerMarker) dangerMarker.style.left = Math.min(99, (usState.dangerThreshold / maxCm) * 100) + '%';
    if (alertMarker)  alertMarker.style.left  = Math.min(99, (usState.alertThreshold  / maxCm) * 100) + '%';
}

/**
 * Send configuration to the ESP32
 */
async function applyUltrasonicConfig() {
    const btn = document.getElementById('usApplyBtn');
    if (btn) { btn.classList.add('loading'); btn.textContent = 'Aplicando...'; }

    await sendRequest('ultrasonic', {
        action:   'config',
        enabled:  usState.enabled ? 1 : 0,
        danger:   usState.dangerThreshold,
        alert:    usState.alertThreshold,
        reaction: usState.reaction,
        buzzer:   usState.buzzerAlert ? 1 : 0,
        display:  usState.displayAlert ? 1 : 0
    });

    if (btn) { btn.classList.remove('loading'); btn.textContent = 'Aplicar configuración'; }
}

/**
 * Start continuous sensor test
 */
function startUltrasonicTest() {
    if (usState.testRunning) return;
    usState.testRunning = true;
    usState.testReadings = [];

    const dot      = document.getElementById('usTestDot');
    const txt      = document.getElementById('usTestStatusText');
    const startBtn = document.getElementById('usTestStartBtn');
    const stopBtn  = document.getElementById('usTestStopBtn');

    if (dot)      { dot.className = 'us-test-dot running'; }
    if (txt)      txt.textContent = 'Ejecutando...';
    if (startBtn) startBtn.disabled = true;
    if (stopBtn)  stopBtn.disabled = false;

    // Run immediately, then every 600ms
    runTestReading();
    usState.testInterval = setInterval(runTestReading, 600);
}

async function runTestReading() {
    if (!state.connected || !state.espIP) {
        stopUltrasonicTest('error', 'Sin conexión al robot');
        return;
    }
    try {
        const url = `http://${state.espIP}/ultrasonic?action=read`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (!resp.ok) { stopUltrasonicTest('error', 'Error de respuesta'); return; }
        const data = await resp.json();
        const dist = parseInt(data.distance);
        if (isNaN(dist) || dist < 0) { stopUltrasonicTest('error', 'Dato inválido'); return; }

        usState.testReadings.push(dist);
        if (usState.testReadings.length > usState.testMaxReadings) {
            usState.testReadings.shift();
        }

        updateUltrasonicDisplay(dist);
        updateTestChart();
        updateTestStats();

        // Update status text
        const txt = document.getElementById('usTestStatusText');
        const stateClass = dist <= usState.dangerThreshold ? 'Peligro' :
                           dist <= usState.alertThreshold  ? 'Alerta' : 'Libre';
        if (txt) txt.textContent = `Sensor OK — ${stateClass}`;

    } catch (e) {
        stopUltrasonicTest('error', 'Sin respuesta del sensor');
    }
}

/**
 * Stop sensor test
 */
function stopUltrasonicTest(status = 'ok', msg = null) {
    usState.testRunning = false;
    clearInterval(usState.testInterval);
    usState.testInterval = null;

    const dot      = document.getElementById('usTestDot');
    const txt      = document.getElementById('usTestStatusText');
    const startBtn = document.getElementById('usTestStartBtn');
    const stopBtn  = document.getElementById('usTestStopBtn');

    if (dot) dot.className = 'us-test-dot ' + status;
    if (txt) txt.textContent = msg || (status === 'ok' ? 'Detenido' : 'Error — sensor no responde');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn)  stopBtn.disabled = true;
}

/**
 * Render the bar chart with the last N readings
 */
function updateTestChart() {
    const container = document.getElementById('usChartBars');
    const maxLabel  = document.getElementById('usChartMax');
    const minLabel  = document.getElementById('usChartMin');
    if (!container || usState.testReadings.length === 0) return;

    const readings = usState.testReadings;
    const max = Math.max(...readings);
    const min = Math.min(...readings);

    if (maxLabel) maxLabel.textContent = max;
    if (minLabel) minLabel.textContent = min;

    container.innerHTML = '';
    readings.forEach(val => {
        const bar = document.createElement('div');
        bar.className = 'us-chart-bar';
        const pct = max > 0 ? Math.max(4, Math.round((val / max) * 100)) : 4;
        bar.style.height = pct + '%';
        const color = val <= usState.dangerThreshold ? '#ff3b30'
                    : val <= usState.alertThreshold  ? '#ff9f0a'
                    : '#34c759';
        bar.style.background = color;
        bar.title = val + ' cm';
        container.appendChild(bar);
    });
}

/**
 * Update test statistics
 */
function updateTestStats() {
    const r = usState.testReadings;
    if (r.length === 0) return;

    const avg = Math.round(r.reduce((a, b) => a + b, 0) / r.length);
    const min = Math.min(...r);
    const max = Math.max(...r);

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('usStatAvg',   avg);
    setEl('usStatMin',   min);
    setEl('usStatMax',   max);
    setEl('usStatCount', r.length);
}

/**
 * Verify sensor reading against a known distance
 */
async function verifyCalibration() {
    const input     = document.getElementById('usCalInput');
    const resultEl  = document.getElementById('usCalResult');
    const btn       = document.getElementById('usCalBtn');
    if (!input || !resultEl) return;

    const expected = parseInt(input.value);
    if (!expected || expected < 5) return;

    btn.disabled = true;
    resultEl.className = 'us-cal-result';
    resultEl.textContent = 'Midiendo...';

    if (!state.connected || !state.espIP) {
        resultEl.textContent = 'Sin conexión al robot.';
        resultEl.className = 'us-cal-result error';
        btn.disabled = false;
        return;
    }

    try {
        const url = `http://${state.espIP}/ultrasonic?action=read`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
        const data = await resp.json();
        const measured = parseInt(data.distance);
        const diff = Math.abs(measured - expected);
        const pct = Math.round((diff / expected) * 100);

        updateUltrasonicDisplay(measured);

        if (diff <= 2) {
            resultEl.textContent = `✓ Perfecto — sensor mide ${measured} cm (error ±${diff} cm)`;
            resultEl.className = 'us-cal-result ok';
        } else if (pct <= 10) {
            resultEl.textContent = `⚠ Aceptable — mide ${measured} cm, esperado ${expected} cm (error ${pct}%)`;
            resultEl.className = 'us-cal-result warn';
        } else {
            resultEl.textContent = `✗ Descalibrado — mide ${measured} cm, esperado ${expected} cm (error ${pct}%)`;
            resultEl.className = 'us-cal-result error';
        }
    } catch (e) {
        resultEl.textContent = '✗ Sensor no responde.';
        resultEl.className = 'us-cal-result error';
    }
    btn.disabled = false;
}

/**
 * Initialize ultrasonic panel event listeners
 */
function initUltrasonicPanel() {
    // Enable toggle
    const enabledChk = document.getElementById('usEnabled');
    const enabledLabel = document.getElementById('usEnabledLabel');
    if (enabledChk) {
        enabledChk.addEventListener('change', function() {
            usState.enabled = this.checked;
            if (enabledLabel) enabledLabel.textContent = this.checked ? 'Activo' : 'Inactivo';
        });
    }

    // Danger slider
    const dangerSlider = document.getElementById('usDangerSlider');
    const dangerValue  = document.getElementById('usDangerValue');
    if (dangerSlider) {
        dangerSlider.addEventListener('input', function() {
            usState.dangerThreshold = parseInt(this.value);
            // Prevent danger from exceeding alert
            if (usState.dangerThreshold >= usState.alertThreshold) {
                usState.alertThreshold = usState.dangerThreshold + 5;
                const alertSlider = document.getElementById('usAlertSlider');
                const alertValue  = document.getElementById('usAlertValue');
                if (alertSlider) alertSlider.value = usState.alertThreshold;
                if (alertValue)  alertValue.textContent = usState.alertThreshold + ' cm';
            }
            if (dangerValue) dangerValue.textContent = this.value + ' cm';
            updateUltrasonicMarkers();
            updateUltrasonicDisplay(usState.lastDistance);
        });
    }

    // Alert slider
    const alertSlider = document.getElementById('usAlertSlider');
    const alertValue  = document.getElementById('usAlertValue');
    if (alertSlider) {
        alertSlider.addEventListener('input', function() {
            usState.alertThreshold = parseInt(this.value);
            // Prevent alert from going below danger
            if (usState.alertThreshold <= usState.dangerThreshold) {
                usState.dangerThreshold = usState.alertThreshold - 5;
                const dSlider = document.getElementById('usDangerSlider');
                const dValue  = document.getElementById('usDangerValue');
                if (dSlider) dSlider.value = usState.dangerThreshold;
                if (dValue)  dValue.textContent = usState.dangerThreshold + ' cm';
            }
            if (alertValue) alertValue.textContent = this.value + ' cm';
            updateUltrasonicMarkers();
            updateUltrasonicDisplay(usState.lastDistance);
        });
    }

    // Reaction buttons
    document.querySelectorAll('.us-reaction-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.us-reaction-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            usState.reaction = this.dataset.reaction;
        });
    });

    // Checkboxes
    const buzzerChk  = document.getElementById('usBuzzerAlert');
    const displayChk = document.getElementById('usDisplayAlert');
    if (buzzerChk)  buzzerChk.addEventListener('change',  () => { usState.buzzerAlert  = buzzerChk.checked; });
    if (displayChk) displayChk.addEventListener('change', () => { usState.displayAlert = displayChk.checked; });

    // Apply button
    const applyBtn = document.getElementById('usApplyBtn');
    if (applyBtn) applyBtn.addEventListener('click', applyUltrasonicConfig);

    // Test buttons
    const testStartBtn = document.getElementById('usTestStartBtn');
    if (testStartBtn) testStartBtn.addEventListener('click', startUltrasonicTest);

    const testStopBtn = document.getElementById('usTestStopBtn');
    if (testStopBtn) testStopBtn.addEventListener('click', () => stopUltrasonicTest());

    const calBtn = document.getElementById('usCalBtn');
    if (calBtn) calBtn.addEventListener('click', verifyCalibration);

    // Init markers
    updateUltrasonicMarkers();
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

        // Quick sound buttons (these are already selected, not preview)
        const soundBtn = e.target.closest('.quick-sound-btn');
        if (soundBtn) {
            const song = soundBtn.dataset.song;
            if (song !== undefined) playSong(song, false); // false = not preview, already selected
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

    // Buzzer buttons/cards - Preview sound when clicking (not on checkbox)
    document.querySelectorAll('.buzzer-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on checkbox
            if (e.target.classList.contains('buzzer-checkbox-input') ||
                e.target.classList.contains('buzzer-checkbox-label') ||
                e.target.classList.contains('buzzer-number')) {
                return;
            }

            const song = card.dataset.song;
            if (song !== undefined) playSong(song, true); // true = preview mode
        });
    });

    // Attack cards - Preview attack when clicking (not on checkbox)
    document.querySelectorAll('.attack-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on checkbox
            if (e.target.classList.contains('attack-checkbox-input') ||
                e.target.classList.contains('attack-checkbox-label')) {
                return;
            }

            // Get attack command from card
            const attackCmd = card.dataset.cmd;
            if (attackCmd && state.connected) {
                // Execute attack as preview
                const originalSize = state.selectedAttacks.size;
                const wasSelected = state.selectedAttacks.has(attackCmd);

                // Temporarily add to allow execution
                if (!wasSelected) {
                    state.selectedAttacks.add(attackCmd);
                }

                attack(attackCmd);

                // Restore original state if it wasn't selected
                if (!wasSelected) {
                    state.selectedAttacks.delete(attackCmd);
                }
            } else if (attackCmd && !state.connected) {
                addLog(`⚠️ Conecta el robot para ver el ataque: ${card.querySelector('.attack-name')?.textContent || attackCmd}`);
            }
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

    // Volume controls
    if (elements.volumeToggleBtn) {
        elements.volumeToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleVolumePanel();
        });
    }

    if (elements.volumeSlider) {
        elements.volumeSlider.addEventListener('input', (e) => {
            setVolume(parseInt(e.target.value));
        });
    }

    if (elements.volumeMuteBtn) {
        elements.volumeMuteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMute();
        });
    }

    if (elements.volumeUp) {
        elements.volumeUp.addEventListener('click', (e) => {
            e.stopPropagation();
            volumeUp();
        });
    }

    if (elements.volumeDown) {
        elements.volumeDown.addEventListener('click', (e) => {
            e.stopPropagation();
            volumeDown();
        });
    }

    // Close volume panel when clicking outside
    document.addEventListener('click', (e) => {
        if (elements.volumePanel && elements.volumePanel.classList.contains('active')) {
            if (!elements.volumePanel.contains(e.target) && !elements.volumeToggleBtn.contains(e.target)) {
                closeVolumePanel();
            }
        }
    });

    // Prevent volume panel from closing when clicking inside it
    if (elements.volumePanel) {
        elements.volumePanel.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Display message checkboxes
    document.querySelectorAll('.display-checkbox-input').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const messageId = checkbox.id.replace('display-', '').toUpperCase();
            toggleDisplayMessageSelection(messageId, checkbox);
        });
    });

    // Display cards - Preview message when clicking (not on checkbox)
    document.querySelectorAll('.display-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on checkbox
            if (e.target.classList.contains('display-checkbox-input') ||
                e.target.classList.contains('display-checkbox-label')) {
                return;
            }

            const message = card.dataset.msg;
            if (message && state.connected) {
                sendDisplayMessage(message);
            }
        });
    });

    // Add custom message button
    const addCustomMessageBtn = document.getElementById('addCustomMessageBtn');
    if (addCustomMessageBtn) {
        addCustomMessageBtn.addEventListener('click', addCustomMessage);
    }

    // Custom message input - Enter key to add
    const customMessageInput = document.getElementById('customMessageInput');
    if (customMessageInput) {
        customMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addCustomMessage();
            }
        });
    }

    // Event delegation for custom message buttons
    document.addEventListener('click', (e) => {
        // Select/Deselect custom message
        const selectBtn = e.target.closest('.custom-message-select-btn');
        if (selectBtn) {
            const message = selectBtn.dataset.msg;
            if (state.selectedDisplayMessages.has(message)) {
                state.selectedDisplayMessages.delete(message);
                addLog(`📺 Deseleccionado: ${message}`);
            } else {
                if (state.selectedDisplayMessages.size >= state.maxSelectedDisplayMessages) {
                    addLog(`⚠️ Máximo 4 mensajes permitidos`);
                    return;
                }
                state.selectedDisplayMessages.add(message);
                addLog(`📺 Seleccionado: ${message}`);

                // Preview message
                if (state.connected) {
                    sendDisplayMessage(message);
                }
            }
            updateCustomMessagesList();
            updateDisplayMessagesUI();
        }

        // Delete custom message
        const deleteBtn = e.target.closest('.custom-message-delete-btn');
        if (deleteBtn) {
            const message = deleteBtn.dataset.delete;
            if (confirm(`¿Eliminar el mensaje "${message}"?`)) {
                deleteCustomMessage(message);
            }
        }
    });
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

        // Initialize display messages UI
        updateDisplayMessagesUI();
        updateCustomMessagesList();
        updateQuickDisplayMessages();

        // Initialize volume controls
        updateVolumeIcon();
        updateVolumeDisplay();

        // Initialize ultrasonic sensor panel
        initUltrasonicPanel();

        // Initialize bitmap/image-to-OLED panel
        initBitmapPanel();

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
window.setVolume = setVolume;
window.toggleMute = toggleMute;
window.volumeUp = volumeUp;
window.volumeDown = volumeDown;
window.toggleVolumePanel = toggleVolumePanel;
window.openVolumePanel = openVolumePanel;
window.closeVolumePanel = closeVolumePanel;
window.toggleDisplayMessageSelection = toggleDisplayMessageSelection;
window.updateDisplayMessagesUI = updateDisplayMessagesUI;
window.updateQuickDisplayMessages = updateQuickDisplayMessages;
window.addCustomMessage = addCustomMessage;
window.deleteCustomMessage = deleteCustomMessage;
window.updateCustomMessagesList = updateCustomMessagesList;
window.sendDisplayMessage = sendDisplayMessage;
window.renderCustomMelodyCards = renderCustomMelodyCards;
window.soundMelodies = soundMelodies;
window.playTone = playTone;
window.state = state;
