import { spawn, execFileSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface IEngineAdapter {
  readonly name: string;
  start(modelPath: string, port: number, binariesDir: string): Promise<ChildProcess>;
}

// ── Tier 1: llama.cpp native binary ──────────────────────────────────────────
export class LlamaEngineAdapter implements IEngineAdapter {
  readonly name = 'llama.cpp';
  private getConfig: () => any;
  constructor(getConfig: () => any = () => ({})) { this.getConfig = getConfig; }

  async start(modelPath: string, port: number, binariesDir: string): Promise<ChildProcess> {
    const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
    const serverExe = path.join(binariesDir, exeName);
    const cfg = this.getConfig();
    const ctxSize = cfg.contextSize || '16384';
    const threads = cfg.cpuThreads && cfg.cpuThreads !== 'auto' && cfg.cpuThreads !== 'max' ? cfg.cpuThreads : undefined;
    let gpuArgs: string[] = [];
    try {
      execFileSync('nvidia-smi', { stdio: 'ignore' });
      console.log('[engine-adapter] NVIDIA RTX Acceleration Auto-Enabled for Llama.cpp');
      gpuArgs = ['--n-gpu-layers', '99'];
    } catch (e) {
      console.log('[engine-adapter] No NVIDIA GPU detected. Running pure CPU inference.');
    }
    const threadArgs = threads ? ['--threads', threads] : [];
    return spawn(serverExe, [
      '--model', modelPath,
      '--ctx-size', ctxSize,
      '--port', String(port),
      '--host', '127.0.0.1',
      ...threadArgs,
      ...gpuArgs
    ], { cwd: binariesDir, stdio: ['ignore', 'pipe', 'pipe'] });
  }
}

// ── Tier 2: AirLLM Python layer ───────────────────────────────────────────────
export class AirLLMEngineAdapter implements IEngineAdapter {
  readonly name = 'AirLLM';
  async start(modelPath: string, port: number, binariesDir: string): Promise<ChildProcess> {
    console.log('[engine-adapter] Tier 2 — AirLLM Python layer...');
    const pythonScript = path.join(binariesDir, '..', '..', 'python', 'airllm_server.py');
    let targetModel = 'meta-llama/Meta-Llama-3-70B-Instruct';
    try {
      const stubContent = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      if (stubContent.target) targetModel = stubContent.target;
    } catch (e) {}
    return spawn('python', [pythonScript, '--model', targetModel, '--port', String(port)], {
      cwd: path.join(binariesDir, '..', '..', 'python'),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }
}

// ── Tier 2 (DTIA): MIZU Python pipeline ──────────────────────────────────────
export class MizuEngineAdapter implements IEngineAdapter {
  readonly name = 'MIZU';
  private getConfig: () => any;
  constructor(getConfig: () => any = () => ({})) { this.getConfig = getConfig; }

  async start(modelPath: string, port: number, binariesDir: string): Promise<ChildProcess> {
    console.log('[engine-adapter] Tier 2 — DTIA MIZU Pipeline...');
    const pythonScript = path.join(binariesDir, '..', '..', 'python', 'mizu_server.py');
    const cfg = this.getConfig();
    const ctxSize = cfg.contextSize || '16384';
    const threads = cfg.cpuThreads && cfg.cpuThreads !== 'auto' && cfg.cpuThreads !== 'max' ? cfg.cpuThreads : 'auto';
    return spawn('python', [
      '-u', pythonScript,
      '--model', modelPath,
      '--port', String(port),
      '--binaries', binariesDir,
      '--ctx-size', ctxSize,
      '--threads', threads,
    ], {
      cwd: path.dirname(pythonScript),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }
}

// ── Tier 3: NVIDIA NIM Cloud proxy ───────────────────────────────────────────
export class NimEngineAdapter implements IEngineAdapter {
  readonly name = 'NIM Cloud';
  private getConfig: () => any;
  constructor(getConfig: () => any = () => ({})) { this.getConfig = getConfig; }

  async start(modelPath: string, port: number, binariesDir: string): Promise<ChildProcess> {
    console.log('[engine-adapter] Tier 3 — NVIDIA NIM Cloud proxy...');
    const pythonScript = path.join(binariesDir, '..', '..', 'python', 'airllm_server.py');
    const cfg = this.getConfig();
    const env = {
      ...process.env,
      NVIDIA_API_KEY: cfg.nvidiaApiKey || '',
      NEMOCLAW_ONLINE: '1',
      YUNISA_NIM_MODE: '1',
    };
    return spawn('python', [pythonScript, '--nim', '--port', String(port)], {
      cwd: path.join(binariesDir, '..', '..', 'python'),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env,
    });
  }
}

// ── Unified chain factory ─────────────────────────────────────────────────────
export class EngineFactory {
  /** Returns ordered adapter array — server-manager walks this until one is healthy. */
  static createChain(modelPath: string, getConfig: () => any = () => ({})): IEngineAdapter[] {
    const cfg = getConfig();
    const chain: IEngineAdapter[] = [];

    // Tier 1: llama.cpp (skip for airllm/nim stub models)
    if (!modelPath.includes('airllm') && !modelPath.includes('nim')) {
      chain.push(new LlamaEngineAdapter(getConfig));
    }

    // Tier 2: AirLLM or MIZU
    if (cfg.enableDtia) {
      chain.push(new MizuEngineAdapter(getConfig));
    } else {
      chain.push(new AirLLMEngineAdapter());
    }

    // Tier 3: NIM Cloud (only if API key is configured)
    if (cfg.nvidiaApiKey && cfg.nvidiaApiKey.length > 5) {
      chain.push(new NimEngineAdapter(getConfig));
    }

    return chain;
  }

  /** Legacy single-engine factory kept for backward compat */
  static create(modelPath: string, getConfig: () => any = () => ({})): IEngineAdapter {
    return EngineFactory.createChain(modelPath, getConfig)[0];
  }
}
