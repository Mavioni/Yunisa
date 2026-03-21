import { spawn, execFileSync, ChildProcess } from 'child_process';
import path from 'path';
import http from 'http';
import fs from 'fs';
import net from 'net';
import { EngineFactory } from './engine-adapters';

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

  constructor(binariesDir: string, dataDir: string, getConfig: () => any = () => ({})) {
    this.binariesDir = binariesDir;
    this.dataDir = dataDir;
    this.getConfig = getConfig;
  }

  getStatus(): ServerStatus {
    return this.status;
  }

  getPort(): number {
    return this.port;
  }

  async start(modelPath: string): Promise<{ status: ServerStatus; port: number }> {
    if (this.process) {
      this.stop();
    }

    if (!fs.existsSync(modelPath)) {
      this.status = 'error';
      return { status: 'error', port: 0 };
    }

    this.port = await this.findAvailablePort(8080);
    this.status = 'starting';

    // YUNISA DUAL-ENGINE ARCHITECTURE routing
    try {
      const engine = EngineFactory.create(modelPath, this.getConfig);
      this.process = await engine.start(modelPath, this.port, this.binariesDir);
      this.lastModelPath = modelPath;
    } catch (err) {
      console.error('[server-manager] Engine adaptation failed', err);
      this.status = 'error';
      return { status: 'error', port: 0 };
    }

    this.process.on('exit', (code) => {
      this.process = null;
      if (this.status === 'stopped') return;

      // Server crashed unexpectedly — attempt auto-restart
      this.status = 'error';
      if (this.restartCount < this.maxRestarts && this.lastModelPath) {
        this.restartCount++;
        console.error(`[server-manager] llama-server exited (code ${code}), restarting (attempt ${this.restartCount}/${this.maxRestarts})...`);
        setTimeout(() => {
          if (this.lastModelPath && this.status === 'error') {
            this.start(this.lastModelPath);
          }
        }, this.restartCooldown);
      } else {
        console.error(`[server-manager] llama-server exited (code ${code}), max restarts reached`);
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[llama-server stderr]', data.toString());
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      console.log('[llama-server stdout]', data.toString());
    });

    const healthy = await this.waitForHealth(30000);
    this.status = healthy ? 'ready' : 'error';
    if (healthy) this.restartCount = 0;

    return { status: this.status, port: this.port };
  }

  stop(): void {
    this.status = 'stopped';
    if (this.process) {
      const pid = this.process.pid;
      if (pid) {
        try {
          if (process.platform === 'win32') {
            execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
          } else {
            process.kill(pid, 'SIGTERM');
          }
        } catch {
          // Process already exited
        }
      }
      this.process = null;
    }
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    for (let port = startPort; port < startPort + 10; port++) {
      const available = await this.isPortAvailable(port);
      if (available) return port;
    }
    throw new Error('No available ports found (tried 8080-8089)');
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });
  }

  private waitForHealth(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    return new Promise((resolve) => {
      let isResolved = false;

      const check = () => {
        if (isResolved) return;
        // Fast-fail if the server process crashed before timeout
        if (this.status === 'error' && !this.process) {
          isResolved = true;
          resolve(false);
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          isResolved = true;
          resolve(false);
          return;
        }

        const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
          res.resume(); // drain the response body
          if (res.statusCode === 200) {
            isResolved = true;
            resolve(true);
          } else {
            // Server is up but not ready yet (e.g. 503 while loading model) — retry
            setTimeout(check, 500);
          }
        });

        let errorHandled = false;
        
        req.on('error', () => {
          if (!errorHandled) {
            errorHandled = true;
            setTimeout(check, 500);
          }
        });

        req.setTimeout(2000, () => {
          if (!errorHandled) {
            errorHandled = true;
            req.destroy();
            setTimeout(check, 500);
          }
        });
      };

      setTimeout(check, 1000);
    });
  }
}
