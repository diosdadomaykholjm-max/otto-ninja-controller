@echo off
REM Script para firmar la APK manualmente
RE

echo ========================================
echo   Firma de APK - Otto Ninja Controller
echo ========================================
echo.

REM Generar keystore si no existe
if not exist android\otto-ninja-release.keystore (
    echo [1/3] Generando keystore...
    keytool -genkey -v ^
      -keystore android\otto-ninja-release.keystore ^
      -alias otto-ninja ^
      -keyalg RSA ^
      -keysize 2048 ^
      -validity 10000 ^
      -storepass otto123456 ^
      -keypass otto123456 ^
      -dname "CN=Otto Ninja, OU=LABEEII, O=LABEEII, L=City, ST=State, C=US"

    if errorlevel 1 (
        echo.
        echo ERROR: No se pudo generar el keystore.
        echo Asegurate de tener Java JDK instalado y keytool en tu PATH.
        pause
        exit /b 1
    )
    echo Keystore generado exitosamente.
) else (
    echo [1/3] Keystore ya existe, saltando generacion...
)

echo.
echo [2/3] Sincronizando archivos con Capacitor...
call npx cap sync android

echo.
echo [3/3] Compilando APK Release firmada...
cd android
call gradlew assembleRelease

if errorlevel 1 (
    echo.
    echo ERROR: Fallo en la compilacion.
    cd ..
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo   APK Firmada generada exitosamente!
echo ========================================
echo.
echo Ubicacion: android\app\build\outputs\apk\release\app-release.apk
echo.
echo Esta APK firmada NO deberia ser marcada como sospechosa por Google Play Protect.
echo.

pause
