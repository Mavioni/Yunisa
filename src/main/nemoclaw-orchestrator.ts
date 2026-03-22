import { spawn, ChildProcess, execFileSync } from 'child_process';
import path from 'path';

export class NemoclawOrchestrator {
  private process: ChildProcess | null = null;
  private airllmProcess: ChildProcess | null = null;
  private pythonDir: string;

  constructor(pythonDir: string) {
    this.pythonDir = pythonDir;
  }

  async start(useDocker: boolean = false): Promise<{ status: string; port: number }> {
    if (this.process) return { status: 'already_running', port: 3000 };

    if (!useDocker) {
      console.log('[nemoclaw] Native mode (default). Booting Flask directly.');
      return this.startNative();
    }

    try {
      execFileSync('docker', ['--version'], { stdio: 'ignore' });
    } catch {
      console.warn('[nemoclaw] Docker not found. Falling back to native host execution.');
      return this.startNative();
    }

    console.log('[nemoclaw] Building Docker Sandbox Image... (cached if exists)');
    const dockerfile = path.join(this.pythonDir, 'Dockerfile.nemoclaw');
    
    try {
      await new Promise<void>((resolve, reject) => {
        const buildProc = spawn('docker', ['build', '-t', 'yunisa-nemoclaw-sandbox', '-f', dockerfile, this.pythonDir], { stdio: 'ignore' });
        buildProc.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error('Docker build failed'));
        });
      });
    } catch (err) {
      console.error('[nemoclaw] Docker build failed, falling back to Native.', err);
      return this.startNative();
    }

    // Boot native AirLLM engine for the Docker container to hit
    console.log('[nemoclaw] Starting dedicated AirLLM backend for Sandbox Container...');
    this.bootAirLLM(8085);

    console.log('[nemoclaw] Spawning isolated OpenShell Sandbox container...');
    const proc = spawn('docker', [
      'run', '--rm', 
      '-p', '3000:3000', 
      '-e', 'LLM_HOST=host.docker.internal',
      '-e', 'LLM_PORT=8085',
      '--name', 'nemoclaw_sandbox',
      'yunisa-nemoclaw-sandbox'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.on('exit', () => { this.process = null; });
    proc.on('error', (err) => { console.error('[sandbox] spawn error:', err.message); this.process = null; });
    proc.stderr?.on('data', (d: Buffer) => console.log('[sandbox]', d.toString()));
    this.process = proc;

    await new Promise(r => setTimeout(r, 3000));
    return { status: 'started_secure_container', port: 3000 };
  }

  private bootAirLLM(port: number): void {
    if (this.airllmProcess) return;
    const airScript = path.join(this.pythonDir, 'airllm_server.py');
    this.airllmProcess = spawn('python', [airScript, '--port', String(port)], {
      cwd: this.pythonDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.airllmProcess.on('exit', () => { this.airllmProcess = null; });
    this.airllmProcess.on('error', (err) => { console.error('[airllm] spawn error:', err.message); this.airllmProcess = null; });
  }

  private async startNative(): Promise<{ status: string; port: number }> {
    console.log('[nemoclaw] Starting dedicated AirLLM backend...');
    this.bootAirLLM(8085);

    const scriptPath = path.join(this.pythonDir, 'nemoclaw_server.py');
    const proc = spawn('python', [scriptPath, '--port', '3000', '--llm-port', '8086'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.on('exit', () => { this.process = null; });
    proc.on('error', (err) => { console.error('[nemoclaw] spawn error:', err.message); this.process = null; });
    proc.stderr?.on('data', (d: Buffer) => console.error('[nemoclaw]', d.toString()));
    this.process = proc;

    await new Promise(r => setTimeout(r, 2000));
    return { status: 'started_native', port: 3000 };
  }

  stop(): void {
    if (this.process) {
      try {
        console.log('[nemoclaw] Terminating Sandbox Container...');
        execFileSync('docker', ['stop', 'nemoclaw_sandbox'], { stdio: 'ignore' });
      } catch {
        // Fallback for native execution cleanup
        if (this.process.pid) {
          try {
            if (process.platform === 'win32') {
              execFileSync('taskkill', ['/PID', String(this.process.pid), '/T', '/F'], { stdio: 'ignore' });
            } else {
              process.kill(this.process.pid, 'SIGTERM');
            }
          } catch {}
        }
      }
      this.process = null;
    }

    if (this.airllmProcess) {
      console.log('[nemoclaw] Terminating dedicated AirLLM backend...');
      try {
        if (process.platform === 'win32' && this.airllmProcess.pid) {
          execFileSync('taskkill', ['/PID', String(this.airllmProcess.pid), '/T', '/F'], { stdio: 'ignore' });
        } else if (this.airllmProcess.pid) {
          process.kill(this.airllmProcess.pid, 'SIGTERM');
        }
      } catch {}
      this.airllmProcess = null;
    }
  }

  getStatus(): { running: boolean } {
    return { running: this.process !== null };
  }
}
