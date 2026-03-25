---
description: Debug YUNISA issues — crashes, errors, and runtime failures
---

# /debug Workflow

// turbo-all

## 1. Check the renderer error log (most recent 60 lines)

```powershell
Get-Content "$env:APPDATA\yunisa\renderer_errors.log" -Tail 60
```

## 2. Check the MSAM / main process for uncaught exceptions

Run the app with verbose output and capture all stderr:

```powershell
cd c:\Users\massi\yunisa
npx electron . 2>&1 | Tee-Object -FilePath "$env:APPDATA\yunisa\electron_debug.log"
```

Then read the log:

```powershell
Get-Content "$env:APPDATA\yunisa\electron_debug.log" | Select-String -Pattern "Error|error|UNKNOWN|ERR_|Cannot|spawn|Uncaught|TypeError|ReferenceError|SyntaxError|MSAM|MIZU|Python|bridge"
```

## 3. TypeScript build check

```powershell
cd c:\Users\massi\yunisa
npm run build:ts 2>&1
```

## 4. Check Python bridge health

```powershell
python c:\Users\massi\yunisa\python\interpreter_bridge.py --health 2>&1
```

## 5. Check Mizu (llama) server status

```powershell
try {
  Invoke-WebRequest -Uri http://127.0.0.1:8080/health -TimeoutSec 3 |
    Select-Object -ExpandProperty Content
} catch { "Server not reachable: $_" }
```

## 6. Check native addon ABI (better-sqlite3)

```powershell
node -e "const db = require('better-sqlite3')(':memory:');
  db.close(); console.log('better-sqlite3 OK')" 2>&1
```

If this fails, rebuild:

```powershell
npx @electron/rebuild
```

## 7. Git diff — see what code changed since last working commit

```powershell
cd c:\Users\massi\yunisa
git diff --stat HEAD
git log --oneline -10
```

## 8. Summarise findings

After running the above steps, report:

- Which step(s) produced errors
- The exact error messages
- The top 3 most likely root causes

