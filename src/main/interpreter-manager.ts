import { spawn, ChildProcess, execFileSync } from 'child_process';
import path from 'path';
import readline from 'readline';

export class InterpreterManager {
  private process: ChildProcess | null = null;
  private airllmProcess: ChildProcess | null = null;
  private scriptPath: string;
  private pythonDir: string;
  private chunkCallback: ((chunk: any) => void) | null = null;

  constructor(appRoot: string) {
    this.pythonDir = path.join(appRoot, 'python');
    this.scriptPath = path.join(this.pythonDir, 'interpreter_bridge.py');
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  async start(): Promise<void> {
    if (this.process) return;

    // Boot dedicated AirLLM proxy bridge exclusively for Interpreter Agent-S
    const airllmPort = 8086;
    this.bootAirLLM(airllmPort);

    this.process = spawn('python', [this.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(this.scriptPath),
    });

    this.process.on('exit', () => {
      this.process = null;
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[interpreter]', data.toString());
    });

    // Parse newline-delimited JSON from stdout
    if (this.process.stdout) {
      const rl = readline.createInterface({ input: this.process.stdout });
      rl.on('line', (line) => {
        try {
          const chunk = JSON.parse(line);
          if (this.chunkCallback) {
            this.chunkCallback(chunk);
          }
        } catch {
          // Ignore non-JSON output
        }
      });
    }

    // Send configuration decoupled from Chat engine
    this.send({ type: 'configure', port: airllmPort });

    // Wait for confirmation
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      const prevCb = this.chunkCallback;
      this.chunkCallback = (chunk) => {
        if (chunk.type === 'configured') {
          clearTimeout(timeout);
          this.chunkCallback = prevCb;
          resolve();
        } else if (prevCb) {
          prevCb(chunk);
        }
      };
    });
  }

  onChunk(callback: (chunk: any) => void): void {
    this.chunkCallback = callback;
  }

  sendMessage(content: string, sessionId: string): void {
    this.send({ type: 'message', content, session_id: sessionId });
  }

  abort(sessionId: string): void {
    this.send({ type: 'abort', session_id: sessionId });
  }

  private send(obj: any): void {
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(JSON.stringify(obj) + '\n');
    }
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
    this.airllmProcess.on('error', (err) => { console.error('[interpreter-airllm] spawn error:', err.message); this.airllmProcess = null; });
  }

  stop(): void {
    if (this.process) {
      try {
        if (process.platform === 'win32' && this.process.pid) {
          execFileSync('taskkill', ['/PID', String(this.process.pid), '/T', '/F'], { stdio: 'ignore' });
        } else if (this.process.pid) {
          process.kill(this.process.pid, 'SIGTERM');
        }
      } catch {}
      this.process = null;
    }

    if (this.airllmProcess) {
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
}
