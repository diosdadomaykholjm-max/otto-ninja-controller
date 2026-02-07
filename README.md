# 🥷 Otto Ninja Pro Controller

Interface web profesional para control de robot Otto Ninja vía WiFi.

## 📁 Estructura del Proyecto

```
otto-ninja-controller/
│
├── index.html          # Página principal HTML
├── styles.css          # Estilos CSS (animaciones, diseño visual)
├── app.js              # Lógica JavaScript
├── README.md           # Este archivo
└── ok.html            # Versión anterior (todo en un archivo)
```

## 🚀 Características

### Modo de Operación
- **CAMINAR por defecto** - Al iniciar, el robot está en modo caminar
- **Envío de comandos de modo** - Notifica al ESP32 cuando cambias entre RODAR/CAMINAR
  - `/mode?cmd=rodar` - Activa modo rodaje
  - `/mode?cmd=caminar` - Activa modo caminata
- **Orientación horizontal** - La app se fuerza en modo landscape para mejor control

### Diseño Visual
- ✨ Estética Cyberpunk/Futurista
- 🎨 Paleta: Cyan (#00f5ff), Magenta (#ff00ff), Amarillo (#ffff00)
- 🤖 Logo de robot animado 100% CSS
- 📊 Visualizador de audio animado
- 🌐 Grid de fondo animado
- 💫 Efectos glow, hover y transiciones suaves

### Funcionalidades
- 🎮 **Joystick** - Control analógico para rodaje
- 🚶 **Caminar** - D-PAD para movimiento direccional
- 💪 **Brazos** - Control individual de brazos
- ⚔️ **Ataques** - 9 movimientos de combate
- 🔊 **Sonido** - 16 melodías + notas musicales
- ⚙️ **Calibración** - Ajuste fino de servos

### Arquitectura
- **HTML Semántico** - Estructura clara y accesible
- **CSS Modular** - Variables CSS, animaciones keyframes
- **JavaScript Moderno** - ES6+, async/await, módulos
- **SPA sin recargas** - Navegación fluida entre paneles

## 🛠️ Instalación y Uso

### Opción 1: Servidor Local (Recomendado)

```bash
# Si tienes Python instalado:
python -m http.server 8000

# O con Node.js:
npx serve

# Luego abre en tu navegador:
# http://localhost:8000
```

### Opción 2: Abrir Directamente

Simplemente abre `index.html` en tu navegador moderno.

### Conexión con ESP32

1. Conecta tu ESP32 a la red WiFi
2. Encuentra su IP (normalmente 192.168.1.XX)
3. Ingresa la IP en el campo de conexión
4. Presiona "Conectar"
5. ¡Listo para controlar!

## 🎨 Personalización

### Cambiar Colores

Edita `styles.css`:

```css
:root {
    --primary: #00f5ff;      /* Cyan principal */
    --secondary: #ff00ff;    /* Magenta secundario */
    --accent: #ffff00;       /* Amarillo acentos */
    --success: #00ff88;      /* Verde éxito */
    --warning: #ffaa00;      /* Naranja advertencia */
    --danger: #ff3366;       /* Rojo peligro */
}
```

### Agregar Nuevos Ataques

1. Edita `index.html` en la sección `#attacks`
2. Agrega un nuevo `<div class="attack-card">`:
```html
<div class="attack-card" data-action="attack" data-cmd="new_attack">
    <span class="attack-icon">🎯</span>
    <div class="attack-name">Nuevo Ataque</div>
</div>
```

3. El código JavaScript ya maneja comandos dinámicamente

## 📱 Compatibilidad

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Móviles (iOS/Android)
- ✅ **Android APK** - Genera una app nativa con Capacitor

## 📲 Generar APK Android

Este proyecto usa **Capacitor 6** (versión estable) para generar una APK nativa de Android.

### Opción 1: Compilar Localmente

#### Requisitos Previos
1. **Android Studio** instalado
2. **Java JDK 8+**
3. **Variables de entorno configuradas**:
   ```bash
   ANDROID_HOME = C:\Users\TuUsuario\AppData\Local\Android\Sdk
   ```

#### Pasos para Generar APK

```bash
# 1. Instalar dependencias
npm install

# 2. Sincronizar archivos web con Android
npx cap sync android

# 3. Abrir proyecto en Android Studio
npx cap open android

# 4. En Android Studio:
#    - Build > Build Bundle(s) / APK(s) > Build APK(s)
#    - La APK se genera en: android/app/build/outputs/apk/debug/app-debug.apk
```

### Opción 2: Compilar con Codemagic (CI/CD)

Este proyecto incluye configuración para **Codemagic**:

```bash
# 1. Los archivos ya están configurados:
#    - capacitor.config.json
#    - codemagic.yaml

# 2. Sube cambios a GitHub:
git add .
git commit -m "Add Capacitor and Codemagic config"
git push origin master

# 3. Ve a https://codemagic.io/
#    - Conecta tu repositorio de GitHub
#    - Haz clic en "Check for configuration file"
#    - Selecciona la app y haz clic en "Start new build"

# 4. La APK se generará automáticamente
#    - Descarga la APK desde la sección "Artifacts"
```

### Instalar la APK en tu Dispositivo

1. **Habilitar instalación de fuentes desconocidas**:
   - Android 8+: Configuración > Seguridad > Instalar apps desconocidas

2. **Transferir la APK**:
   - USB: Conecta tu celular y copia la APK
   - Cloud: Sube la APK a Google Drive/Dropbox

3. **Instalar**:
   - Abre el archivo `.apk`
   - Sigue los pasos de instalación

### Estructura del Proyecto con Capacitor

```
otto-ninja-controller/
├── www/                    # Archivos web (HTML, CSS, JS)
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── *.png
├── android/                # Proyecto Android nativo (autogenerado)
├── capacitor.config.json    # Configuración de Capacitor
├── codemagic.yaml          # Configuración CI/CD
└── package.json
```

## 🔧 Configuración del ESP32

El ESP32 debe tener estos endpoints:

```
GET /status                  # Verificar conexión
GET /walk?cmd=forward        # Comandos de caminata
GET /arms?cmd=raise_left     # Comandos de brazos
GET /head?cmd=left          # Movimientos de cabeza
GET /attack?cmd=slash       # Ataques ninja
GET /buzzer?song=0          # Reproducir melodía
GET /joystick?x=50&y=-30    # Control analógico
GET /offset?left=10&right=5 # Calibración
```

## 📝 Licencia

Este proyecto es código abierto y está disponible para uso personal y educacional.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Si encuentras bugs o tienes ideas:

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

---

**Versión**: 2.0 Pro
**Autor**: Otto Ninja Team
**Año**: 2025
