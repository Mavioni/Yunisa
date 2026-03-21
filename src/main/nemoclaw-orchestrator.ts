import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';

export class NemoclawOrchestrator {
  private process: ChildProcess | null = null;
  private pythonDir: string;

  constructor(pythonDir: string) {
    this.pythonDir = pythonDir;
  }

  async start(llmPort: number): Promise<{ status: string; port: number }> {
    if (this.process) return { status: 'already_running', port: 3000 };

    try {
      execSync('docker --version', { stdio: 'ignore' });
    } catch {
      console.warn('[nemoclaw] Docker not found. Falling back to native host execution.');
      return this.startNative(llmPort);
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
      return this.startNative(llmPort);
    }

    console.log('[nemoclaw] Spawning isolated OpenShell Sandbox container...');
    const proc = spawn('docker', [
      'run', '--rm', 
      '-p', '3000:3000', 
      '--name', 'nemoclaw_sandbox',
      'yunisa-nemoclaw-sandbox'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.on('exit', () => { this.process = null; });
    proc.stderr?.on('data', (d: Buffer) => console.log('[sandbox]', d.toString()));
    this.process = proc;

    await new Promise(r => setTimeout(r, 3000));
    return { status: 'started_secure_container', port: 3000 };
  }

  private async startNative(llmPort: number): Promise<{ status: string; port: number }> {
    const scriptPath = path.join(this.pythonDir, 'nemoclaw_server.py');
    const proc = spawn('python', [scriptPath, '--port', '3000', '--llm-port', String(llmPort)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.on('exit', () => { this.process = null; });
    proc.stderr?.on('data', (d: Buffer) => console.error('[nemoclaw]', d.toString()));
    this.process = proc;

    await new Promise(r => setTimeout(r, 2000));
    return { status: 'started_native', port: 3000 };
  }

  stop(): void {
    if (this.process) {
      try {
        console.log('[nemoclaw] Terminating Sandbox Container...');
        execSync('docker stop nemoclaw_sandbox', { stdio: 'ignore' });
      } catch {
        // Fallback for native execution cleanup
        if (this.process.pid) {
          try {
            if (process.platform === 'win32') {
              require('child_process').execSync(`taskkill /PID ${this.process.pid} /T /F`, { stdio: 'ignore' });
            } else {
              process.kill(this.process.pid, 'SIGTERM');
            }
          } catch {}
        }
      }
      this.process = null;
    }
  }

  getStatus(): { running: boolean } {
    return { running: this.process !== null };
  }
}
