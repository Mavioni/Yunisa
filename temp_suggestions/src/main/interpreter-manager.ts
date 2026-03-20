import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import readline from 'readline';

export class InterpreterManager {
  private process: ChildProcess | null = null;
  private scriptPath: string;
  private chunkCallback: ((chunk: any) => void) | null = null;

  constructor(appRoot: string) {
    this.scriptPath = path.join(appRoot, 'python', 'interpreter_bridge.py');
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  async start(serverPort: number): Promise<void> {
    if (this.process) return;

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

    // Send configuration
    this.send({ type: 'configure', port: serverPort });

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

  stop(): void {
    if (this.process) {
      try {
        this.process.kill();
      } catch {}
      this.process = null;
    }
  }
}
