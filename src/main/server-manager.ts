import { spawn, execFileSync, ChildProcess } from 'child_process';
import path from 'path';
import http from 'http';
import fs from 'fs';
import net from 'net';
import { EngineFactory, IEngineAdapter } from './engine-adapters';

export type ServerStatus = 'stopped' | 'starting' | 'ready' | 'error';

export class ServerManager {
  private process: ChildProcess | null = null;
  private status: ServerStatus = 'stopped';
  private port: number = 8080;
  private binariesDir: string;
  private dataDir: string;
  private lastModelPath: string | null = null;
  private restartCount: number = 0;
  private maxRestarts: number = 3;
  private restartCooldown: number = 5000;
  private getConfig: () => any;
  private activeEngineName: string = 'unknown';
  private onEngineActiveCallback: ((name: string) => void) | null = null;

  constructor(binariesDir: string, dataDir: string, getConfig: () => any = () => ({})) {
    this.binariesDir = binariesDir;
    this.dataDir = dataDir;
    this.getConfig = getConfig;
  }

  getStatus(): ServerStatus { return this.status; }
  getPort(): number { return this.port; }
  getActiveEngine(): string { return this.activeEngineName; }

  onEngineActive(cb: (name: string) => void): void {
    this.onEngineActiveCallback = cb;
  }

  async start(modelPath: string): Promise<{ status: ServerStatus; port: number; engine?: string }> {
    if (this.process) this.stop();

    if (!fs.existsSync(modelPath)) {
      this.status = 'error';
      return { status: 'error', port: 0 };
    }

    this.port = await this.findAvailablePort(8080);
    this.status = 'starting';

    // ── YUNISA UNIFIED ENGINE CHAIN ──────────────────────────────────────────
    // Automatically tries each tier. First healthy response wins.
    const chain = EngineFactory.createChain(modelPath, this.getConfig);
    let started = false;

    for (const adapter of chain) {
      console.log(`[server-manager] Trying engine tier: ${adapter.name}`);

      // Tier-specific health probe windows:
      // llama.cpp — exits immediately if SAC-blocked, so 8s is generous
      // AirLLM/MIZU — Python model import can take 30-60s on first run
      // NIM — cloud API handshake, 15s is safe
      const probeMs =
        adapter.name === 'llama.cpp' ? 8000 :
        adapter.name === 'NIM Cloud' ? 15000 : 60000;

      try {
        const proc = await adapter.start(modelPath, this.port, this.binariesDir);
        this.process = proc;
        this.lastModelPath = modelPath;

        proc.stderr?.on('data', (d: Buffer) => console.error(`[${adapter.name}]`, d.toString().trim()));
        proc.stdout?.on('data', (d: Buffer) => console.log(`[${adapter.name}]`, d.toString().trim()));

        const healthy = await this.waitForHealth(probeMs);

        if (healthy) {
          this.activeEngineName = adapter.name;
          this.onEngineActiveCallback?.(adapter.name);
          console.log(`[server-manager] Engine online: ${adapter.name}`);
          started = true;
          break;
        } else {
          // This tier failed — kill proc and try next
          console.warn(`[server-manager] ${adapter.name} failed health check. Trying next tier...`);
          this.killProc(proc);
          this.process = null;
        }
      } catch (err: any) {
        console.warn(`[server-manager] ${adapter.name} spawn error: ${err.message}. Trying next tier...`);
        this.process = null;
      }
    }

    if (!started) {
      this.status = 'error';
      console.error('[server-manager] All engine tiers exhausted. No inference backend available.');
      return { status: 'error', port: 0 };
    }

    // Wire crash recovery on the winning process
    this.process!.on('exit', (code) => {
      this.process = null;
      if (this.status === 'stopped') return;
      this.status = 'error';

      if (this.restartCount < this.maxRestarts && this.lastModelPath) {
        this.restartCount++;
        console.error(`[server-manager] Engine exited (code ${code}), restarting (${this.restartCount}/${this.maxRestarts})...`);
        setTimeout(() => {
          if (this.lastModelPath && this.status === 'error') this.start(this.lastModelPath);
        }, this.restartCooldown);
      } else {
        console.error(`[server-manager] Engine exited (code ${code}), max restarts reached.`);
      }
    });

    this.status = 'ready';
    this.restartCount = 0;
    return { status: 'ready', port: this.port, engine: this.activeEngineName };
  }

  stop(): void {
    this.status = 'stopped';
    if (this.process) {
      this.killProc(this.process);
      this.process = null;
    }
  }

  private killProc(proc: ChildProcess): void {
    const pid = proc.pid;
    if (!pid) return;
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch { /* already exited */ }
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    for (let port = startPort; port < startPort + 10; port++) {
      if (await this.isPortAvailable(port)) return port;
    }
    throw new Error('No available ports found (tried 8080–8089)');
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => server.close(() => resolve(true)));
      server.listen(port, '127.0.0.1');
    });
  }

  private waitForHealth(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    return new Promise((resolve) => {
      let isResolved = false;

      const check = () => {
        if (isResolved) return;
        if (!this.process) { isResolved = true; resolve(false); return; }
        if (Date.now() - startTime > timeoutMs) { isResolved = true; resolve(false); return; }

        const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) { isResolved = true; resolve(true); }
          else setTimeout(check, 500);
        });

        let errorHandled = false;
        req.on('error', () => { if (!errorHandled) { errorHandled = true; setTimeout(check, 500); } });
        req.setTimeout(2000, () => { if (!errorHandled) { errorHandled = true; req.destroy(); setTimeout(check, 500); } });
      };

      setTimeout(check, 1000);
    });
  }
}
