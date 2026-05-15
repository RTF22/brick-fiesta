# Brick Fiesta 🎮

Buntes Brick-Breaker-Spiel im 16-bit-Stil — als reine HTML5-Webapp.
Läuft im Browser, lässt sich als **PWA** unter Windows, Android und iOS installieren, und kommt vollständig **ohne Tracker, ohne Abhängigkeiten, ohne Build-Schritt** aus.

> **Hinweis zu Markenrechten:** Der Name "Brick Fiesta" und sämtliche Assets sind eigenständig. Es bestehen keinerlei Bezüge zu "Breakout®" (Atari) oder "Arkanoid®" (Taito).

## Features

- **60+ Level** mit sanft ansteigendem Schwierigkeitsgrad
- **Drei Steuerungen:** Maus, Tastatur (Pfeiltasten/Leertaste), Touch
- **Powerups:** Breiteres Paddle, Multi-Ball, Slowmo, Extraleben, Sticky-Paddle, Laser …
- **Chiptune-Sound** prozedural via WebAudio (keine externen Samples)
- **Offline-fähig** durch Service Worker
- **Responsive** — passt sich Hoch- und Querformat an

## Lokales Testen

Einfach im Browser öffnen:

```powershell
# Beliebiger statischer Server, z.B. Python:
python -m http.server 8000
# dann http://localhost:8000 öffnen
```

Service Worker und PWA-Install funktionieren nur über `http(s)://`, nicht via `file://`.

## Deployment auf GitHub Pages

1. Repository auf GitHub anlegen, Inhalt pushen.
2. Im Repo unter **Settings → Pages** als Source **"GitHub Actions"** wählen.
3. Der enthaltene Workflow `.github/workflows/pages.yml` deployt automatisch bei jedem Push auf `main`.
4. Spiel ist erreichbar unter `https://<user>.github.io/<repo>/`.

## Als App installieren

- **Windows (Edge/Chrome):** In der Adressleiste auf das Install-Symbol klicken.
- **Android (Chrome):** Menü → "App installieren" / "Zum Startbildschirm hinzufügen".
- **iOS (Safari):** Teilen → "Zum Home-Bildschirm".

## Steuerung

| Aktion       | Maus/Touch | Tastatur     |
| ------------ | ---------- | ------------ |
| Paddle       | Bewegen    | ← → oder A/D |
| Ball starten | Klick/Tipp | Leertaste    |
| Pause        | II-Button  | P            |
| Stumm        | ♪-Button   | M            |

## Eigene Level

Level werden in [`levels.js`](levels.js) als 2D-ASCII-Karten definiert (10 Spalten breit).

```
.  = leer
1-9 = Block mit n Treffern
X  = unzerstörbar
*  = droppt Powerup
$  = Goldblock (Bonuspunkte)
```

## Lizenz

MIT — siehe Code-Header. Du darfst alles damit machen, was die Lizenz erlaubt.
