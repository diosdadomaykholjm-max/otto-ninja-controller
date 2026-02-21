/**
 * MIDI IMPORT MODULE - Otto Ninja Controller
 * Permite importar archivos MIDI, convertirlos a frecuencia/duración
 * y enviarlos al ESP32 para guardarlos en memoria flash.
 */

const CUSTOM_MELODY_START = 16;
const MAX_CUSTOM_MELODIES = 5;
const MAX_NOTES_PER_MELODY = 100;

// Estado del modal de importación
let midiImportState = {
    parsedTracks: [],
    selectedTrack: null,
    fileNotes: [],           // Notas del archivo MIDI original (nunca cambian)
    originalNotes: [],       // Notas originales del MIDI (base para edición actual)
    convertedNotes: [],      // Notas convertidas (base para edición)
    editedNotes: [],         // Notas después de editar (recortadas y con velocidad)
    midiName: '',
    bpm: 120,
    isPreviewPlaying: false,
    previewAbort: false,
    previewCurrentNoteIndex: 0,  // Índice de la nota actual en reproducción
    previewElapsedTime: 0,     // Tiempo transcurrido en la nota actual (ms)
    // Edit controls
    startPointer: 0,         // Posición del puntero de inicio (0-100%)
    endPointer: 100,         // Posición del puntero de fin (0-100%)
    speed: 100,              // Velocidad de reproducción (50-200%)
    pitch: 0,                // Pitch shift en semitonos (-12 a +12)
    isEdited: false,         // Indica si se ha editado la melodía
    loop: false,             // Repetir en bucle
    editingSlot: null        // Slot que se está editando (null = nueva melodía)
};

/* ================== MIDI NOTE TO FREQUENCY ================== */

/**
 * Convertir número de nota MIDI a frecuencia en Hz
 * Fórmula estándar: freq = 440 * 2^((note - 69) / 12)
 */
function midiNoteToFreq(midiNote) {
    return Math.round(440 * Math.pow(2, (midiNote - 69) / 12));
}

/* ================== MIDI PARSING ================== */

/**
 * Parsear archivo MIDI usando @tonejs/midi
 * @param {ArrayBuffer} buffer - Datos binarios del archivo MIDI
 * @returns {Object} Datos parseados con pistas y BPM
 */
function parseMidiFile(buffer) {
    const midi = new Midi(buffer);
    const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;

    const tracks = midi.tracks
        .map((track, index) => {
            if (track.notes.length === 0) return null;

            // Convertir notas a formato [freq, dur] con tiempos absolutos
            const notes = track.notes.map(note => ({
                freq: midiNoteToFreq(note.midi),
                dur: Math.max(20, Math.min(Math.round(note.duration * 1000), 2000)),
                time: Math.round(note.time * 1000),
                midi: note.midi
            }));

            return {
                index: index,
                name: track.name || `Pista ${index + 1}`,
                instrument: track.instrument?.name || 'Desconocido',
                channel: track.channel,
                noteCount: notes.length,
                notes: notes
            };
        })
        .filter(t => t !== null);

    return { tracks, bpm, name: midi.header.name || '' };
}

/**
 * Convertir pista polifónica a monofónica (una nota a la vez)
 * Toma la nota más aguda en cada momento (extrae melodía)
 * Inserta silencios entre notas no adyacentes
 */
function convertToMonophonic(trackNotes, maxNotes) {
    maxNotes = maxNotes || MAX_NOTES_PER_MELODY;

    // Ordenar por tiempo, luego por frecuencia (más aguda primero)
    const sorted = [...trackNotes].sort((a, b) => a.time - b.time || b.freq - a.freq);

    const mono = [];
    let lastEnd = 0;

    for (const note of sorted) {
        if (note.time >= lastEnd) {
            // Insertar silencio si hay un gap > 15ms
            const gap = note.time - lastEnd;
            if (gap > 15 && mono.length > 0) {
                mono.push([0, Math.min(Math.round(gap), 500)]);
            }

            const dur = Math.max(20, Math.min(note.dur, 2000));
            mono.push([note.freq, dur]);
            lastEnd = note.time + dur;
        }

        // Limitar cantidad de notas
        if (mono.length >= maxNotes) break;
    }

    return mono;
}

/* ================== MODAL UI ================== */

/**
 * Abrir modal de importación MIDI
 */
function openMidiImportModal() {
    // Verificar slots disponibles
    const usedSlots = Object.keys(window.state?.customMelodies || {}).length;
    if (usedSlots >= MAX_CUSTOM_MELODIES) {
        alert('Limite alcanzado: maximo ' + MAX_CUSTOM_MELODIES + ' melodias personalizadas. Elimina una para agregar otra.');
        return;
    }

    // Reset state
    midiImportState = {
        parsedTracks: [],
        selectedTrack: null,
        fileNotes: [],
        originalNotes: [],
        convertedNotes: [],
        editedNotes: [],
        midiName: '',
        bpm: 120,
        isPreviewPlaying: false,
        previewAbort: false,
        previewCurrentNoteIndex: 0,
        previewElapsedTime: 0,
        startPointer: 0,
        endPointer: 100,
        speed: 100,
        pitch: 0,
        isEdited: false,
        loop: false,
        editingSlot: null
    };

    const overlay = document.getElementById('midiModalOverlay');
    if (overlay) {
        overlay.classList.add('active');
        resetMidiModal();
    }
}

/**
 * Cerrar modal de importación MIDI
 */
function closeMidiImportModal() {
    midiImportState.previewAbort = true;
    const overlay = document.getElementById('midiModalOverlay');
    if (overlay) overlay.classList.remove('active');
}

/**
 * Resetear el modal a su estado inicial
 */
function resetMidiModal() {
    // Mostrar paso 1, ocultar los demás
    showMidiStep(1);

    // Reset inputs
    const fileInput = document.getElementById('midiFileInput');
    if (fileInput) fileInput.value = '';

    const nameInput = document.getElementById('midiMelodyName');
    if (nameInput) nameInput.value = '';

    const fileInfo = document.getElementById('midiFileInfo');
    if (fileInfo) fileInfo.style.display = 'none';

    const saveBtn = document.getElementById('midiSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    // Reset loop button visual state
    const loopBtn = document.getElementById('midiLoopBtn');
    if (loopBtn) loopBtn.classList.remove('active');
}

/**
 * Mostrar paso específico del modal
 */
function showMidiStep(step) {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById('midiStep' + i);
        if (el) el.style.display = i <= step ? 'block' : 'none';
    }
}

/* ================== FILE HANDLING ================== */

/**
 * Manejar archivo MIDI seleccionado o arrastrado
 */
function handleMidiFile(file) {
    if (!file || (!file.name.endsWith('.mid') && !file.name.endsWith('.midi'))) {
        alert('Por favor selecciona un archivo MIDI (.mid o .midi)');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const result = parseMidiFile(e.target.result);
            midiImportState.parsedTracks = result.tracks;
            midiImportState.bpm = result.bpm;
            midiImportState.midiName = result.name || file.name.replace(/\.(mid|midi)$/i, '');

            // Mostrar info del archivo
            const fileInfo = document.getElementById('midiFileInfo');
            if (fileInfo) {
                fileInfo.style.display = 'flex';
                document.getElementById('midiFilename').textContent = file.name;
                document.getElementById('midiBpm').textContent = result.bpm + ' BPM';
            }

            if (result.tracks.length === 0) {
                alert('No se encontraron pistas con notas en este archivo MIDI.');
                return;
            }

            // Si solo hay una pista, seleccionarla automáticamente
            if (result.tracks.length === 1) {
                selectMidiTrack(0);
                showMidiStep(3);
            } else {
                renderTrackList(result.tracks);
                showMidiStep(2);
            }
        } catch (err) {
            console.error('Error al parsear MIDI:', err);
            alert('Error al leer el archivo MIDI. Verifica que sea un archivo MIDI valido.');
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Renderizar lista de pistas para selección
 */
function renderTrackList(tracks) {
    const list = document.getElementById('midiTrackList');
    if (!list) return;

    list.innerHTML = '';

    tracks.forEach((track, i) => {
        const item = document.createElement('div');
        item.className = 'midi-track-item';
        item.dataset.trackIndex = i;
        item.innerHTML = `
            <div>
                <div class="midi-track-name">${track.name}</div>
                <div class="midi-track-info">${track.instrument} | ${track.noteCount} notas</div>
            </div>
            <div class="midi-track-notes">${Math.min(track.noteCount, MAX_NOTES_PER_MELODY)} notas</div>
        `;
        item.addEventListener('click', function() {
            // Quitar selección anterior
            list.querySelectorAll('.midi-track-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectMidiTrack(i);
            showMidiStep(3);
        });
        list.appendChild(item);
    });
}

/**
 * Seleccionar una pista y convertirla a formato monofónico
 */
function selectMidiTrack(trackIndex) {
    const track = midiImportState.parsedTracks[trackIndex];
    if (!track) return;

    midiImportState.selectedTrack = trackIndex;
    const converted = convertToMonophonic(track.notes, MAX_NOTES_PER_MELODY);
    midiImportState.fileNotes = [...converted];     // Notas del archivo (reset)
    midiImportState.originalNotes = [...converted];  // Base para edición actual
    midiImportState.convertedNotes = converted;
    midiImportState.editedNotes = [...converted];     // Copia inicial
    midiImportState.startPointer = 0;
    midiImportState.endPointer = 100;
    midiImportState.speed = 100;
    midiImportState.pitch = 0;
    midiImportState.isEdited = false;

    // Actualizar nombre si estaba vacío
    const nameInput = document.getElementById('midiMelodyName');
    if (nameInput && !nameInput.value) {
        const name = midiImportState.midiName || track.name || 'Mi Melodia';
        nameInput.value = name.substring(0, 20);
    }

    // Actualizar contadores y sliders
    updateNoteCounter();
    updateEditControls();
    updateTimeline();

    // Renderizar waveform con un delay para asegurar que el canvas tenga dimensiones
    setTimeout(() => renderWaveform(), 100);

    // Habilitar botones de guardar
    const saveBtn = document.getElementById('midiSaveBtn');
    const saveLocalBtn = document.getElementById('midiSaveLocalBtn');
    if (saveBtn) saveBtn.disabled = false;
    if (saveLocalBtn) saveLocalBtn.disabled = false;
}

/**
 * Actualizar indicador de cantidad de notas
 */
function updateNoteCounter() {
    const count = midiImportState.editedNotes.length;
    const originalCount = midiImportState.convertedNotes.length;
    const countEl = document.getElementById('midiNoteCount');
    const barFill = document.getElementById('midiNoteBarFill');

    if (countEl) {
        countEl.textContent = `${count} / ${originalCount}`;
    }

    if (barFill) {
        const percent = (count / MAX_NOTES_PER_MELODY) * 100;
        barFill.style.width = percent + '%';
        barFill.className = 'midi-note-bar-fill';
        if (percent > 90) barFill.classList.add('danger');
        else if (percent > 70) barFill.classList.add('warning');
    }
}

/**
 * Aplicar edición de punteros y velocidad a las notas
 */
function applyEdits() {
    // Usar fileNotes como base si no está editado, o originalNotes si ya está editado
    const sourceNotes = midiImportState.isEdited ? midiImportState.originalNotes : midiImportState.fileNotes;
    if (sourceNotes.length === 0) return;

    const totalNotes = sourceNotes.length;
    const startIndex = Math.floor((midiImportState.startPointer / 100) * totalNotes);
    const endIndex = Math.ceil((midiImportState.endPointer / 100) * totalNotes);

    // Recortar según punteros
    let cropped = sourceNotes.slice(startIndex, endIndex);

    // Aplicar velocidad a la duración
    const speedFactor = 100 / midiImportState.speed; // 100% = 1.0, 200% = 0.5, 50% = 2.0
    const edited = cropped.map(([freq, dur]) => [
        freq,
        Math.max(10, Math.round(dur * speedFactor))
    ]);

    // Actualizar todo: originalNotes pasa a ser el recorte (nueva base)
    midiImportState.originalNotes = edited;
    midiImportState.editedNotes = edited;
    midiImportState.convertedNotes = edited;
    midiImportState.isEdited = true;

    // Reset punteros después de recortar
    midiImportState.startPointer = 0;
    midiImportState.endPointer = 100;

    updateNoteCounter();
    updateSelectionRegion();
    resetPlayhead();
    renderWaveform();
}

/**
 * Actualizar los controles de edición (sliders)
 */
function updateEditControls() {
    const speedValue = document.getElementById('midiSpeedValue');
    const pitchValue = document.getElementById('midiPitchValue');
    const speedSlider = document.getElementById('midiSpeedSlider');
    const pitchSlider = document.getElementById('midiPitchSlider');

    if (speedValue) speedValue.textContent = midiImportState.speed + '%';
    if (pitchValue) pitchValue.textContent = (midiImportState.pitch > 0 ? '+' : '') + midiImportState.pitch;
    if (speedSlider) speedSlider.value = midiImportState.speed;
    if (pitchSlider) pitchSlider.value = midiImportState.pitch;
}

/**
 * Manejar cambio en puntero de inicio
 */
function onStartPointerChange(value) {
    value = parseInt(value);
    if (value >= midiImportState.endPointer - 5) {
        value = midiImportState.endPointer - 5; // Mínimo 5% de diferencia
    }
    midiImportState.startPointer = Math.max(0, value);
    updateEditControls();
    applyEdits();
}

/**
 * Manejar cambio en puntero de fin
 */
function onEndPointerChange(value) {
    value = parseInt(value);
    if (value <= midiImportState.startPointer + 5) {
        value = midiImportState.startPointer + 5; // Mínimo 5% de diferencia
    }
    midiImportState.endPointer = Math.min(100, value);
    updateEditControls();
    applyEdits();
}

/**
 * Manejar cambio en velocidad
 */
function onSpeedChange(value) {
    midiImportState.speed = Math.max(50, Math.min(200, parseInt(value)));
    updateEditControls();
    applyEdits();
}

/**
 * Resetear edición a valores originales
 */
function resetEdits() {
    midiImportState.startPointer = 0;
    midiImportState.endPointer = 100;
    midiImportState.speed = 100;
    midiImportState.pitch = 0;

    // Resetear a las notas del archivo MIDI original
    if (midiImportState.fileNotes.length > 0) {
        midiImportState.originalNotes = [...midiImportState.fileNotes];
        midiImportState.editedNotes = [...midiImportState.fileNotes];
        midiImportState.convertedNotes = [...midiImportState.fileNotes];
    }

    midiImportState.isEdited = false;
    midiImportState.previewCurrentNoteIndex = 0;
    midiImportState.previewElapsedTime = 0;

    updateEditControls();
    updateNoteCounter();
    updateSelectionRegion();
    resetPlayhead();
    renderWaveform();
    updatePreviewTime();
}

/* ================== TIMELINE - PROFESSIONAL EDITOR ================== */

/**
 * Calcular duración total de las notas en segundos
 */
function calculateDuration(notes) {
    return notes.reduce((total, [, dur]) => total + dur, 0) / 1000;
}

/**
 * Formatear tiempo a MM:ss.m
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
}

/**
 * Actualizar la región de selección en el waveform
 * - Si está editado: la región ocupa todo el ancho (ya está recortado)
 * - Si no está editado: muestra la selección basada en startPointer/endPointer
 */
function updateSelectionRegion() {
    const region = document.getElementById('midiSelectionRegion');
    if (region) {
        if (midiImportState.isEdited) {
            // La región ocupa todo el ancho porque el waveform ya está recortado
            region.style.left = '0%';
            region.style.width = '100%';
        } else {
            // Mostrar la selección dentro de todas las notas
            region.style.left = midiImportState.startPointer + '%';
            region.style.width = (midiImportState.endPointer - midiImportState.startPointer) + '%';
        }
    }
}

/**
 * Resetear el playhead al inicio de la selección
 */
function resetPlayhead() {
    const playhead = document.getElementById('midiPlayhead');
    const currentTimeEl = document.getElementById('midiCurrentTime');

    // Resetear posición de reproducción
    midiImportState.previewCurrentNoteIndex = 0;
    midiImportState.previewElapsedTime = 0;

    // Si la melodía ha sido editada (recortada), el playhead va al 0%
    // Si no ha sido editada, el playhead va al inicio de la selección
    if (midiImportState.isEdited) {
        if (playhead) playhead.style.left = '0%';
    } else {
        // El playhead debe estar al inicio de la selección actual
        if (playhead) playhead.style.left = midiImportState.startPointer + '%';
    }
    if (currentTimeEl) currentTimeEl.textContent = '00:00.0';
}

/**
 * Actualizar el playhead durante reproducción
 */
function updatePlayhead(percent, seconds) {
    const playhead = document.getElementById('midiPlayhead');
    const currentTimeEl = document.getElementById('midiCurrentTime');

    let displayPercent = percent;

    // Si no está editado, el playhead debe mapearse al rango de selección
    if (!midiImportState.isEdited) {
        const selectionStart = midiImportState.startPointer;
        const selectionWidth = midiImportState.endPointer - midiImportState.startPointer;
        displayPercent = selectionStart + (percent * selectionWidth / 100);
    }

    if (playhead) playhead.style.left = displayPercent + '%';
    if (currentTimeEl) currentTimeEl.textContent = formatTime(seconds);
}

/**
 * Renderizar el waveform estilo Piano Roll
 * - Si está editado: muestra solo las notas recortadas
 * - Si no está editado: muestra todas las notas con la selección visible
 */
function renderWaveform() {
    const canvas = document.getElementById('midiWaveformCanvas');
    if (!canvas || midiImportState.editedNotes.length === 0) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Fondo con gradiente sutil
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#2a2a3e');
    bgGradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Usar fileNotes como base para mostrar todas las notas
    // Si está editado, las notas recortadas están en originalNotes
    const baseNotes = midiImportState.isEdited ? midiImportState.originalNotes : midiImportState.fileNotes;

    if (baseNotes.length === 0) return;

    let notes;
    let totalDuration;

    if (midiImportState.isEdited) {
        // Mostrar solo las notas recortadas (ocupan todo el ancho)
        notes = baseNotes;
        totalDuration = notes.reduce((sum, [, dur]) => sum + dur, 0);
    } else {
        // Mostrar todas las notas, solo se resalta la selección
        notes = baseNotes;
        totalDuration = notes.reduce((sum, [, dur]) => sum + dur, 0);
    }

    const notesWithFreq = notes.filter(([f]) => f > 0);

    if (totalDuration === 0) {
        updateNotesInfo(notes);
        return;
    }

    // Encontrar rango de notas MIDI
    const midiNotes = notesWithFreq.map(([f]) => Math.round(12 * Math.log2(f / 440) + 69));
    const minNote = midiNotes.length > 0 ? Math.min(...midiNotes) : 48;
    const maxNote = midiNotes.length > 0 ? Math.max(...midiNotes) : 72;

    // Extender el rango para mejor distribución (mínimo 2 octavas)
    const minOctave = Math.floor(minNote / 12) - 1;
    const maxOctave = Math.floor(maxNote / 12) + 1;
    const displayMinNote = minOctave * 12;
    const displayMaxNote = (maxOctave + 1) * 12 - 1;
    const noteRange = displayMaxNote - displayMinNote + 1;
    const rowHeight = height / noteRange;

    // Líneas de grid horizontales más visibles
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= noteRange; i++) {
        const y = i * rowHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Líneas verticales de tiempo
    if (midiImportState.bpm > 0) {
        const beatDuration = 60000 / midiImportState.bpm;
        const numBeats = Math.ceil(totalDuration / beatDuration);

        for (let i = 0; i <= numBeats; i++) {
            const x = (i * beatDuration / totalDuration) * width;
            const isMeasure = i % 4 === 0;
            ctx.strokeStyle = isMeasure ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = isMeasure ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }

    // Dibujar notas como bloques horizontales con efecto glow
    let currentTime = 0;
    notes.forEach(([freq, dur]) => {
        if (freq > 0) {
            const midiNote = Math.round(12 * Math.log2(freq / 440) + 69);
            const y = height - ((midiNote - displayMinNote + 1) * rowHeight);

            const x1 = (currentTime / totalDuration) * width;
            const x2 = ((currentTime + dur) / totalDuration) * width;
            const noteWidth = Math.max(4, x2 - x1 - 1);

            // Determinar si la nota está dentro de la selección (cuando no está editado)
            const noteStartPercent = (currentTime / totalDuration) * 100;
            const noteEndPercent = ((currentTime + dur) / totalDuration) * 100;
            const isInSelection = !midiImportState.isEdited &&
                noteStartPercent >= midiImportState.startPointer &&
                noteEndPercent <= midiImportState.endPointer;

            // Color más vibrante según altura
            const noteNum = midiNote % 12;
            const hue = 180 + (noteNum * 12.5);

            // Ajustar brillo según si está en la selección
            const saturation = midiImportState.isEdited || isInSelection ? 85 : 40;
            const lightness = midiImportState.isEdited || isInSelection ? 60 : 30;
            const alpha = midiImportState.isEdited || isInSelection ? 1 : 0.4;

            // Glow effect solo para notas seleccionadas
            if (midiImportState.isEdited || isInSelection) {
                ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`;
                ctx.shadowBlur = 8;
            } else {
                ctx.shadowBlur = 0;
            }

            const gradient = ctx.createLinearGradient(x1, y, x1, y + rowHeight);
            gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 5}%, ${alpha})`);
            gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness - 10}%, ${alpha})`);

            ctx.fillStyle = gradient;

            // Bloque con bordes redondeados
            const radius = Math.min(4, rowHeight / 2 - 1);
            ctx.beginPath();
            ctx.moveTo(x1 + radius, y);
            ctx.lineTo(x1 + noteWidth - radius, y);
            ctx.quadraticCurveTo(x1 + noteWidth, y, x1 + noteWidth, y + radius);
            ctx.lineTo(x1 + noteWidth, y + rowHeight - radius);
            ctx.quadraticCurveTo(x1 + noteWidth, y + rowHeight, x1 + noteWidth - radius, y + rowHeight);
            ctx.lineTo(x1 + radius, y + rowHeight);
            ctx.quadraticCurveTo(x1, y + rowHeight, x1, y + rowHeight - radius);
            ctx.lineTo(x1, y + radius);
            ctx.quadraticCurveTo(x1, y, x1 + radius, y);
            ctx.fill();

            // Reset shadow para el borde
            ctx.shadowBlur = 0;

            // Borde brillante
            const borderLight = midiImportState.isEdited || isInSelection ? 75 : 40;
            ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${borderLight}%, ${alpha})`;
            ctx.lineWidth = midiImportState.isEdited || isInSelection ? 1.5 : 1;
            ctx.stroke();

            // Brillo en el borde superior (solo para notas seleccionadas)
            if (midiImportState.isEdited || isInSelection) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fillRect(x1 + 2, y + 1, noteWidth - 4, Math.min(3, rowHeight / 3));
            }
        }

        currentTime += dur;
    });

    updateNotesInfo(notes);
}

/**
 * Actualizar información de las notas
 */
function updateNotesInfo(notes) {
    const totalNotesEl = document.getElementById('midiTotalNotes');
    const durationEl = document.getElementById('midiDurationText');
    const rangeEl = document.getElementById('midiNoteRange');
    const keySigEl = document.getElementById('midiKeySig');

    if (totalNotesEl) totalNotesEl.textContent = notes.length;

    if (durationEl) {
        const duration = calculateDuration(notes);
        durationEl.textContent = duration.toFixed(1) + 's';
    }

    if (rangeEl && notes.length > 0) {
        const freqs = notes.map(([f]) => f).filter(f => f > 0);
        if (freqs.length > 0) {
            const minFreq = Math.min(...freqs);
            const maxFreq = Math.max(...freqs);
            const minNote = Math.round(12 * Math.log2(minFreq / 440) + 69);
            const maxNote = Math.round(12 * Math.log2(maxFreq / 440) + 69);
            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            rangeEl.textContent = `${noteNames[minNote % 12]}${Math.floor(minNote / 12) - 1}-${noteNames[maxNote % 12]}${Math.floor(maxNote / 12) - 1}`;
        }
    }

    if (keySigEl) {
        // Detectar tonalidad aproximada
        const freqs = notes.map(([f]) => f).filter(f => f > 0);
        if (freqs.length > 0) {
            const avgFreq = freqs.reduce((a, b) => a + b, 0) / freqs.length;
            const avgNote = Math.round(12 * Math.log2(avgFreq / 440) + 69) % 12;
            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            keySigEl.textContent = noteNames[avgNote];
        }
    }
}

/**
 * Actualizar el tiempo de preview basado en la selección actual
 */
function updatePreviewTime() {
    let sourceNotes;
    let totalTime = 0;
    const speedFactor = 100 / midiImportState.speed;

    if (midiImportState.isEdited) {
        // Usar las notas recortadas
        sourceNotes = midiImportState.originalNotes;
        for (const [, dur] of sourceNotes) {
            totalTime += Math.max(10, Math.round(dur * speedFactor));
        }
    } else {
        // Usar las notas del archivo con la selección
        sourceNotes = midiImportState.fileNotes;
        const totalNotes = sourceNotes.length;
        const startIndex = Math.floor((midiImportState.startPointer / 100) * totalNotes);
        const endIndex = Math.ceil((midiImportState.endPointer / 100) * totalNotes);

        for (let i = startIndex; i < endIndex; i++) {
            if (sourceNotes[i]) {
                totalTime += Math.max(10, Math.round(sourceNotes[i][1] * speedFactor));
            }
        }
    }

    const totalTimeEl = document.getElementById('midiTotalTime');
    if (totalTimeEl) totalTimeEl.textContent = formatTime(totalTime / 1000);
}

/**
 * Actualizar la línea de tiempo (llamada al seleccionar pista)
 */
function updateTimeline() {
    updatePreviewTime();
    updateSelectionRegion();
    // No resetear el playhead al actualizar el timeline
    // resetPlayhead();
    // Usar requestAnimationFrame para asegurar que el canvas tenga dimensiones correctas
    requestAnimationFrame(() => {
        renderWaveform();
    });
}

/* ================== PREVIEW ================== */

/**
 * Preview de la melodía en el navegador usando Web Audio API
 * Soporta play/pause - continúa desde la posición actual
 * - Si está editado: reproduce todas las notas (ya están recortadas)
 * - Si no está editado: reproduce solo la selección actual
 */
async function previewMidiMelody() {
    const sourceNotes = midiImportState.isEdited ? midiImportState.originalNotes : midiImportState.fileNotes;
    if (sourceNotes.length === 0) return;

    let previewNotes;

    if (midiImportState.isEdited) {
        // Ya está recortado, usar todas las notas
        const speedFactor = 100 / midiImportState.speed;
        previewNotes = sourceNotes.map(([freq, dur]) => [
            freq,
            Math.max(10, Math.round(dur * speedFactor))
        ]);
    } else {
        // Obtener notas según la selección actual
        const totalNotes = sourceNotes.length;
        const startIndex = Math.floor((midiImportState.startPointer / 100) * totalNotes);
        const endIndex = Math.ceil((midiImportState.endPointer / 100) * totalNotes);

        // Aplicar velocidad a la duración
        const speedFactor = 100 / midiImportState.speed;
        previewNotes = sourceNotes.slice(startIndex, endIndex).map(([freq, dur]) => [
            freq,
            Math.max(10, Math.round(dur * speedFactor))
        ]);
    }

    if (previewNotes.length === 0) return;

    // Calcular tiempo total
    const totalTime = previewNotes.reduce((sum, [, dur]) => sum + dur, 0);
    const totalTimeEl = document.getElementById('midiTotalTime');
    if (totalTimeEl) totalTimeEl.textContent = formatTime(totalTime / 1000);

    const previewBtn = document.getElementById('midiPreviewBtn');

    // Si está reproduciendo, pausar
    if (midiImportState.isPreviewPlaying) {
        midiImportState.previewAbort = true;
        // Esperar a que se detenga y salir sin resetear posición
        await new Promise(r => setTimeout(r, 100));
        midiImportState.isPreviewPlaying = false;

        // Cambiar icono de vuelta a play
        if (previewBtn) {
            const playIcon = previewBtn.querySelector('.play-icon');
            const pauseIcon = previewBtn.querySelector('.pause-icon');
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        }
        return;
    }

    // Iniciar reproducción desde la posición guardada o desde el inicio
    midiImportState.isPreviewPlaying = true;
    midiImportState.previewAbort = false;

    // Cambiar icono de play a pause
    if (previewBtn) {
        const playIcon = previewBtn.querySelector('.play-icon');
        const pauseIcon = previewBtn.querySelector('.pause-icon');
        if (playIcon) playIcon.style.display = 'none';
        if (pauseIcon) pauseIcon.style.display = 'block';
    }

    const updateInterval = 30; // Actualizar cada 30ms

    try {
        let startNoteIndex = midiImportState.previewCurrentNoteIndex || 0;
        let startOffset = midiImportState.previewElapsedTime || 0;

        // Si no hay posición guardada o está fuera de rango, empezar del inicio
        if (startNoteIndex >= previewNotes.length) {
            startNoteIndex = 0;
            startOffset = 0;
        }

        // Calcular tiempo ya transcurrido antes de la nota actual
        let elapsedTime = 0;
        for (let i = 0; i < startNoteIndex; i++) {
            elapsedTime += previewNotes[i][1];
        }
        elapsedTime += startOffset;

        for (let i = startNoteIndex; i < previewNotes.length; i++) {
            if (midiImportState.previewAbort) {
                // Guardar posición para continuar después
                midiImportState.previewCurrentNoteIndex = i;
                midiImportState.previewElapsedTime = Date.now() - startTime - startOffset;
                break;
            }

            const [freq, dur] = previewNotes[i];
            const offset = (i === startNoteIndex) ? startOffset : 0;
            const actualDur = dur - offset;

            if (actualDur <= 0) continue;

            const noteStartTime = elapsedTime;
            const startTime = Date.now();

            // Aplicar pitch
            const adjustedFreq = midiImportState.pitch !== 0 && freq > 0
                ? freq * Math.pow(2, midiImportState.pitch / 12)
                : freq;

            // Iniciar sonido
            if (freq > 0) {
                if (typeof window.playTone === 'function') {
                    window.playTone(adjustedFreq, actualDur);
                } else if (window.melodiasWeb) {
                    window.melodiasWeb.playTone(adjustedFreq, actualDur);
                }
            }

            // Actualizar playhead durante la nota
            while (Date.now() - startTime < actualDur && !midiImportState.previewAbort) {
                await new Promise(r => setTimeout(r, updateInterval));
                const currentDur = Date.now() - startTime;
                const currentElapsed = noteStartTime + currentDur;
                const percent = (currentElapsed / totalTime) * 100;
                updatePlayhead(percent, currentElapsed / 1000);
            }

            elapsedTime += dur;
            midiImportState.previewCurrentNoteIndex = i + 1;
            midiImportState.previewElapsedTime = 0;

            const percent = (elapsedTime / totalTime) * 100;
            updatePlayhead(percent, elapsedTime / 1000);
        }

        // Reset al finalizar naturalmente
        if (!midiImportState.previewAbort) {
            midiImportState.previewCurrentNoteIndex = 0;
            midiImportState.previewElapsedTime = 0;

            // Si loop está activo, reiniciar desde el principio
            if (midiImportState.loop) {
                resetPlayhead();
                midiImportState.isPreviewPlaying = false;
                previewMidiMelody();
                return;
            }
        }
    } catch (err) {
        console.error('Error en preview:', err);
    }

    midiImportState.isPreviewPlaying = false;
    midiImportState.previewAbort = false;

    // Restaurar icono de play
    if (previewBtn) {
        const playIcon = previewBtn.querySelector('.play-icon');
        const pauseIcon = previewBtn.querySelector('.pause-icon');
        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon) pauseIcon.style.display = 'none';
    }
}

/**
 * Detener preview
 */
function stopMidiPreview() {
    midiImportState.previewAbort = true;
    const previewBtn = document.getElementById('midiPreviewBtn');
    if (previewBtn) {
        const playIcon = previewBtn.querySelector('.play-icon');
        const pauseIcon = previewBtn.querySelector('.pause-icon');
        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon) pauseIcon.style.display = 'none';
    }
    resetPlayhead();
}

/* ================== SAVE & UPLOAD ================== */

/**
 * Encontrar el siguiente slot disponible (16-20)
 */
function findNextSlot() {
    const melodies = window.state?.customMelodies || {};
    for (let i = CUSTOM_MELODY_START; i < CUSTOM_MELODY_START + MAX_CUSTOM_MELODIES; i++) {
        if (!melodies[i]) return i;
    }
    return -1;
}

/**
 * Guardar melodía localmente (sin enviar al ESP32)
 */
async function saveMidiMelodyLocal() {
    const nameInput = document.getElementById('midiMelodyName');
    const name = (nameInput?.value || 'Mi Melodia').substring(0, 20);
    const notes = midiImportState.editedNotes;

    if (notes.length === 0) {
        alert('No hay notas para guardar.');
        return;
    }

    const slot = midiImportState.editingSlot !== null
        ? midiImportState.editingSlot
        : findNextSlot();
    if (slot === -1) {
        alert('No hay slots disponibles. Elimina una melodia primero.');
        return;
    }

    const saveLocalBtn = document.getElementById('midiSaveLocalBtn');
    if (saveLocalBtn) {
        saveLocalBtn.disabled = true;
        saveLocalBtn.textContent = 'Guardando...';
    }

    try {
        if (!window.state.customMelodies) window.state.customMelodies = {};
        window.state.customMelodies[slot] = { name: name, notes: notes, sentToEsp: false };

        if (typeof window.soundMelodies !== 'undefined') {
            window.soundMelodies[slot] = notes;
        }

        saveCustomMelodiesToStorage();

        if (typeof window.renderCustomMelodyCards === 'function') {
            window.renderCustomMelodyCards();
        }

        closeMidiImportModal();
        console.log('Melodia guardada localmente en slot ' + slot + ': ' + name + ' (' + notes.length + ' notas)');
    } catch (err) {
        console.error('Error al guardar melodia:', err);
        alert('Error al guardar la melodia.');
    }

    if (saveLocalBtn) {
        saveLocalBtn.disabled = false;
        saveLocalBtn.textContent = 'Guardar';
    }
}

/**
 * Guardar melodía y enviar al ESP32
 */
async function saveMidiMelody() {
    const nameInput = document.getElementById('midiMelodyName');
    const name = (nameInput?.value || 'Mi Melodia').substring(0, 20);
    const notes = midiImportState.editedNotes; // Usar notas editadas

    if (notes.length === 0) {
        alert('No hay notas para guardar.');
        return;
    }

    const slot = midiImportState.editingSlot !== null
        ? midiImportState.editingSlot
        : findNextSlot();
    if (slot === -1) {
        alert('No hay slots disponibles. Elimina una melodia primero.');
        return;
    }

    const saveBtn = document.getElementById('midiSaveBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Enviando...';
    }

    try {
        // Enviar al ESP32 si está conectado
        let sentToEsp = false;
        if (window.state?.connected && window.state?.espIP) {
            const success = await sendMelodyToESP32(slot, name, notes);
            sentToEsp = success;
            if (!success) {
                alert('Error al enviar al robot. La melodia se guardara localmente.');
            }
        } else {
            alert('No hay conexion con el robot. La melodia se guardara localmente.');
        }

        // Guardar localmente
        if (!window.state.customMelodies) window.state.customMelodies = {};
        window.state.customMelodies[slot] = { name: name, notes: notes, sentToEsp: sentToEsp };

        // Agregar a soundMelodies para reproducción en navegador
        if (typeof window.soundMelodies !== 'undefined') {
            window.soundMelodies[slot] = notes;
        }

        // Guardar en localStorage
        saveCustomMelodiesToStorage();

        // Renderizar tarjetas
        if (typeof window.renderCustomMelodyCards === 'function') {
            window.renderCustomMelodyCards();
        }

        // Cerrar modal
        closeMidiImportModal();

        console.log('Melodia guardada en slot ' + slot + ': ' + name + ' (' + notes.length + ' notas)');
    } catch (err) {
        console.error('Error al guardar melodia:', err);
        alert('Error al guardar la melodia.');
    }

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar y Enviar';
    }
}

/**
 * Enviar melodía al ESP32 via HTTP
 * Formato: GET /melody?action=save&slot=16&name=MiMelodia&data=523,100;659,80;...
 */
async function sendMelodyToESP32(slot, name, notes) {
    try {
        // Codificar notas como string compacto: "freq,dur;freq,dur;..."
        const dataStr = notes.map(n => n[0] + ',' + n[1]).join(';');
        const url = `http://${window.state.espIP}/melody?action=save&slot=${slot}&name=${encodeURIComponent(name)}&data=${dataStr}`;

        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        return response.ok;
    } catch (err) {
        console.error('Error enviando melodia al ESP32:', err);
        return false;
    }
}

/**
 * Enviar melodía existente al ESP32 (después de guardarla localmente)
 */
async function sendMelodyToESP32BySlot(slot) {
    slot = parseInt(slot);
    const melody = window.state?.customMelodies?.[slot];

    if (!melody) {
        alert('La melodia no existe.');
        return;
    }

    if (!window.state?.connected || !window.state?.espIP) {
        alert('No hay conexion con el robot.');
        return;
    }

    try {
        const success = await sendMelodyToESP32(slot, melody.name, melody.notes);
        if (success) {
            melody.sentToEsp = true;
            saveCustomMelodiesToStorage();
            if (typeof window.renderCustomMelodyCards === 'function') {
                window.renderCustomMelodyCards();
            }
            alert('Melodia enviada al robot correctamente.');
        } else {
            alert('Error al enviar la melodia al robot.');
        }
    } catch (err) {
        console.error('Error al enviar:', err);
        alert('Error al enviar la melodia al robot.');
    }
}

/**
 * Eliminar melodía personalizada
 */
async function deleteCustomMelody(slot) {
    slot = parseInt(slot);

    // Eliminar del ESP32
    if (window.state?.connected && window.state?.espIP) {
        try {
            await fetch(`http://${window.state.espIP}/melody?action=delete&slot=${slot}`, {
                signal: AbortSignal.timeout(5000)
            });
        } catch (err) {
            console.error('Error eliminando del ESP32:', err);
        }
    }

    // Eliminar localmente
    if (window.state?.customMelodies) {
        delete window.state.customMelodies[slot];
    }

    // Eliminar de soundMelodies
    if (typeof window.soundMelodies !== 'undefined') {
        delete window.soundMelodies[slot];
    }

    // Actualizar localStorage
    saveCustomMelodiesToStorage();

    // Re-renderizar
    if (typeof window.renderCustomMelodyCards === 'function') {
        window.renderCustomMelodyCards();
    }
}

/**
 * Abrir modal para reeditar una melodía guardada
 */
function editCustomMelody(slot) {
    slot = parseInt(slot);
    const melody = window.state?.customMelodies?.[slot];
    if (!melody || !melody.notes || melody.notes.length === 0) {
        alert('No se puede editar esta melodia.');
        return;
    }

    // Preparar estado con las notas guardadas
    midiImportState = {
        parsedTracks: [],
        selectedTrack: null,
        fileNotes: [...melody.notes],
        originalNotes: [...melody.notes],
        convertedNotes: [...melody.notes],
        editedNotes: [...melody.notes],
        midiName: melody.name,
        bpm: 120,
        isPreviewPlaying: false,
        previewAbort: false,
        previewCurrentNoteIndex: 0,
        previewElapsedTime: 0,
        startPointer: 0,
        endPointer: 100,
        speed: 100,
        pitch: 0,
        isEdited: false,
        loop: false,
        editingSlot: slot
    };

    // Abrir el modal
    const overlay = document.getElementById('midiModalOverlay');
    if (!overlay) return;
    overlay.classList.add('active');

    // Reset visual del modal
    resetMidiModal();

    // Pre-rellenar el nombre
    const nameInput = document.getElementById('midiMelodyName');
    if (nameInput) nameInput.value = melody.name;

    // Ir directo al paso 3 (editor)
    showMidiStep(3);

    // Habilitar botones de guardar
    const saveBtn = document.getElementById('midiSaveBtn');
    if (saveBtn) saveBtn.disabled = false;
    const saveLocalBtn = document.getElementById('midiSaveLocalBtn');
    if (saveLocalBtn) saveLocalBtn.disabled = false;

    // Renderizar waveform y controles
    renderWaveform();
    updateSelectionRegion();
    resetPlayhead();
    updateNoteCounter();
    updatePreviewTime();
    updateEditControls();
}

/* ================== LOCAL STORAGE ================== */

/**
 * Guardar melodías personalizadas en localStorage
 */
function saveCustomMelodiesToStorage() {
    try {
        const data = {};
        const melodies = window.state?.customMelodies || {};
        for (const [key, melody] of Object.entries(melodies)) {
            data[key] = {
                name: melody.name,
                notes: melody.notes,
                sentToEsp: melody.sentToEsp || false
            };
        }
        localStorage.setItem('ottoCustomMelodies', JSON.stringify(data));
    } catch (e) {
        console.error('Error guardando en localStorage:', e);
    }
}

/**
 * Cargar melodías personalizadas desde localStorage
 */
function loadCustomMelodiesFromStorage() {
    try {
        const stored = localStorage.getItem('ottoCustomMelodies');
        if (stored) {
            const data = JSON.parse(stored);
            if (!window.state.customMelodies) window.state.customMelodies = {};
            for (const [key, melody] of Object.entries(data)) {
                const slot = parseInt(key);
                window.state.customMelodies[slot] = {
                    name: melody.name,
                    notes: melody.notes,
                    sentToEsp: melody.sentToEsp || false
                };
                // Agregar a soundMelodies
                if (typeof window.soundMelodies !== 'undefined') {
                    window.soundMelodies[slot] = melody.notes;
                }
            }
        }
    } catch (e) {
        console.error('Error cargando desde localStorage:', e);
    }
}

/**
 * Sincronizar con ESP32 al conectar (cargar lista de melodías guardadas)
 */
async function syncCustomMelodiesFromESP32() {
    if (!window.state?.connected || !window.state?.espIP) return;

    try {
        const response = await fetch(`http://${window.state.espIP}/melody?action=list`, {
            signal: AbortSignal.timeout(5000)
        });
        if (response.ok) {
            const data = await response.json();
            if (data.melodies && Array.isArray(data.melodies)) {
                // Actualizar estado local con info del ESP32
                for (const m of data.melodies) {
                    if (!window.state.customMelodies[m.slot]) {
                        // Descargar datos completos de la melodía
                        try {
                            const resp = await fetch(`http://${window.state.espIP}/melody?action=get&slot=${m.slot}`, {
                                signal: AbortSignal.timeout(5000)
                            });
                            if (resp.ok) {
                                const melodyData = await resp.json();
                                window.state.customMelodies[m.slot] = {
                                    name: melodyData.name,
                                    notes: melodyData.notes
                                };
                                if (typeof window.soundMelodies !== 'undefined') {
                                    window.soundMelodies[m.slot] = melodyData.notes;
                                }
                            }
                        } catch (e) {
                            // Solo guardar metadata
                            window.state.customMelodies[m.slot] = {
                                name: m.name,
                                notes: []
                            };
                        }
                    }
                }
                saveCustomMelodiesToStorage();
                if (typeof window.renderCustomMelodyCards === 'function') {
                    window.renderCustomMelodyCards();
                }
            }
        }
    } catch (err) {
        console.error('Error sincronizando melodias:', err);
    }
}

/* ================== INIT EVENT LISTENERS ================== */

function initMidiImport() {
    // Botón importar
    const importBtn = document.getElementById('midiImportBtn');
    if (importBtn) {
        importBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openMidiImportModal();
        });
    }

    // Prevenir propagación de clicks dentro del modal
    const modal = document.querySelector('.midi-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    // Cerrar modal
    const closeBtn = document.getElementById('midiModalClose');
    if (closeBtn) closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeMidiImportModal();
    });

    const cancelBtn = document.getElementById('midiCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeMidiImportModal();
    });

    const overlay = document.getElementById('midiModalOverlay');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            e.stopPropagation();
            if (e.target === overlay) closeMidiImportModal();
        });
    }

    // Dropzone
    const dropzone = document.getElementById('midiDropzone');
    const fileInput = document.getElementById('midiFileInput');

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', function(e) {
            e.stopPropagation();
            fileInput.click();
        });

        dropzone.addEventListener('dragover', function(e) {
            e.stopPropagation();
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', function(e) {
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', function(e) {
            e.stopPropagation();
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                handleMidiFile(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', function(e) {
            e.stopPropagation();
            if (fileInput.files.length > 0) {
                handleMidiFile(fileInput.files[0]);
            }
        });
    }

    // Preview
    const previewBtn = document.getElementById('midiPreviewBtn');
    if (previewBtn) previewBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        previewMidiMelody();
    });

    const stopBtn = document.getElementById('midiStopBtn');
    if (stopBtn) stopBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        stopMidiPreview();
    });

    // Guardar
    const saveBtn = document.getElementById('midiSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        saveMidiMelody();
    });

    // Guardar solo local
    const saveLocalBtn = document.getElementById('midiSaveLocalBtn');
    if (saveLocalBtn) saveLocalBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        saveMidiMelodyLocal();
    });

    // Controles de efectos del editor profesional
    const speedSlider = document.getElementById('midiSpeedSlider');
    if (speedSlider) {
        speedSlider.addEventListener('input', function(e) {
            e.stopPropagation();
            midiImportState.speed = parseInt(this.value);
            updateEditControls();
            applyEdits();
        });
    }

    const pitchSlider = document.getElementById('midiPitchSlider');
    if (pitchSlider) {
        pitchSlider.addEventListener('input', function(e) {
            e.stopPropagation();
            midiImportState.pitch = parseInt(this.value);
            updateEditControls();
        });
    }


    // Transport buttons
    const toStartBtn = document.getElementById('midiToStart');
    if (toStartBtn) {
        toStartBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            resetPlayhead();
        });
    }

    // Manejadores de selección arrastrables (mouse + touch)
    const leftHandle = document.getElementById('midiSelHandleLeft');
    const rightHandle = document.getElementById('midiSelHandleRight');
    const waveformContainer = document.getElementById('midiWaveformContainer');

    let isDragging = false;
    let dragHandle = null;

    function updatePointerFromX(clientX) {
        if (!waveformContainer) return;
        const rect = waveformContainer.getBoundingClientRect();
        let percent = ((clientX - rect.left) / rect.width) * 100;
        percent = Math.max(0, Math.min(100, percent));

        if (dragHandle === 'left') {
            if (percent > midiImportState.endPointer - 5) {
                percent = midiImportState.endPointer - 5;
            }
            midiImportState.startPointer = percent;
        } else if (dragHandle === 'right') {
            if (percent < midiImportState.startPointer + 5) {
                percent = midiImportState.startPointer + 5;
            }
            midiImportState.endPointer = percent;
        }
        updateSelectionRegion();
        updatePreviewTime();
        // Actualizar waveform en tiempo real para mostrar la previsualización del recorte
        if (!midiImportState.isEdited) {
            requestAnimationFrame(() => renderWaveform());
        }
    }

    function handleStart(e, handle) {
        e.stopPropagation();
        e.preventDefault();
        isDragging = true;
        dragHandle = handle;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        updatePointerFromX(clientX);
    }

    function handleMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        updatePointerFromX(clientX);
    }

    function handleEnd() {
        if (isDragging) {
            isDragging = false;
            dragHandle = null;
            // Asegurar que el waveform se actualice correctamente después de soltar
            renderWaveform();
        }
    }

    // Eventos para el manejador izquierdo
    if (leftHandle) {
        leftHandle.addEventListener('mousedown', (e) => handleStart(e, 'left'));
        leftHandle.addEventListener('touchstart', (e) => handleStart(e, 'left'), { passive: false });
    }

    // Eventos para el manejador derecho
    if (rightHandle) {
        rightHandle.addEventListener('mousedown', (e) => handleStart(e, 'right'));
        rightHandle.addEventListener('touchstart', (e) => handleStart(e, 'right'), { passive: false });
    }

    // Eventos globales de movimiento
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);

    // Botón Recortar
    const trimBtn = document.getElementById('midiTrimBtn');
    if (trimBtn) {
        trimBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            applyEdits();
        });
    }

    // Botón Reset
    const resetBtn = document.getElementById('midiResetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            resetEdits();
        });
    }

    // Loop button toggle
    const loopBtn = document.getElementById('midiLoopBtn');
    if (loopBtn) {
        loopBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            this.classList.toggle('active');
            midiImportState.loop = this.classList.contains('active');
        });
    }

    // Cargar melodías guardadas
    loadCustomMelodiesFromStorage();

    // Resize handler para waveform
    window.addEventListener('resize', function() {
        if (midiImportState.editedNotes.length > 0) {
            renderWaveform();
        }
    });

    console.log('MIDI Import module initialized');
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMidiImport);
} else {
    initMidiImport();
}

// Exportar funciones globales
window.openMidiImportModal = openMidiImportModal;
window.closeMidiImportModal = closeMidiImportModal;
window.deleteCustomMelody = deleteCustomMelody;
window.editCustomMelody = editCustomMelody;
window.loadCustomMelodiesFromStorage = loadCustomMelodiesFromStorage;
window.saveCustomMelodiesToStorage = saveCustomMelodiesToStorage;
window.syncCustomMelodiesFromESP32 = syncCustomMelodiesFromESP32;
window.applyEdits = applyEdits;
window.resetEdits = resetEdits;
window.updateTimeline = updateTimeline;
window.updatePreviewTime = updatePreviewTime;
window.renderWaveform = renderWaveform;
window.saveMidiMelodyLocal = saveMidiMelodyLocal;
window.sendMelodyToESP32BySlot = sendMelodyToESP32BySlot;
