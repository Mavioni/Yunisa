import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface IEngineAdapter {
  start(modelPath: string, port: number, binariesDir: string): Promise<ChildProcess>;
}

export class LlamaEngineAdapter implements IEngineAdapter {
  private getConfig: () => any;
  constructor(getConfig: () => any = () => ({})) { this.getConfig = getConfig; }

  async start(modelPath: string, port: number, binariesDir: string): Promise<ChildProcess> {
    const serverExe = path.join(binariesDir, 'llama-server.exe');
    const cfg = this.getConfig();
    const ctxSize = cfg.contextSize || '16384';
    const threads = cfg.cpuThreads && cfg.cpuThreads !== 'auto' && cfg.cpuThreads !== 'max' ? cfg.cpuThreads : undefined;
    let gpuArgs: string[] = [];
    try {
      execSync('nvidia-smi', { stdio: 'ignore' });
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

export class AirLLMEngineAdapter implements IEngineAdapter {
  async start(modelPath: string, port: number, binariesDir: string): Promise<ChildProcess> {
    console.log('[engine-adapter] Routing to AirLLM Python Optimization layer...');
    const pythonScript = path.join(binariesDir, '..', '..', 'python', 'airllm_server.py');
    let targetModel = 'meta-llama/Meta-Llama-3-70B-Instruct';
    try {
      const stubContent = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      if (stubContent.target) targetModel = stubContent.target;
    } catch (e) {}

    return spawn('python', [pythonScript, '--model', targetModel, '--port', String(port)], {
      cwd: path.join(binariesDir, '..', '..', 'python'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
}

export class EngineFactory {
  static create(modelPath: string, getConfig: () => any = () => ({})): IEngineAdapter {
    if (modelPath.includes('airllm')) {
      return new AirLLMEngineAdapter();
    }
    return new LlamaEngineAdapter(getConfig);
  }
}
