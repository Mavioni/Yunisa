import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface IEngineAdapter {
  start(modelPath: string, port: number, binariesDir: string): Promise<ChildProcess>;
}

export class LlamaEngineAdapter implements IEngineAdapter {
  async start(modelPath: string, port: number, binariesDir: string): Promise<ChildProcess> {
    const serverExe = path.join(binariesDir, 'llama-server.exe');
    let gpuArgs: string[] = [];
    try {
      execSync('nvidia-smi', { stdio: 'ignore' });
      console.log('[engine-adapter] NVIDIA RTX Acceleration Auto-Enabled for Llama.cpp');
      gpuArgs = ['--n-gpu-layers', '99']; // Offload all layers to cuBLAS
    } catch (e) {
      console.log('[engine-adapter] No NVIDIA GPU detected. Running pure CPU inference.');
    }

    return spawn(serverExe, [
      '--model', modelPath,
      '--ctx-size', '16384',
      '--port', String(port),
      '--host', '127.0.0.1',
      ...gpuArgs
    ], {
      cwd: binariesDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
  static create(modelPath: string): IEngineAdapter {
    if (modelPath.includes('airllm')) {
      return new AirLLMEngineAdapter();
    }
    // Future plugins like TensorRT-LLM, vLLM, or MLX will naturally append here
    return new LlamaEngineAdapter();
  }
}
