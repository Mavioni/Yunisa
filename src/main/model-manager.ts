import fs from 'fs';
import path from 'path';
import { net } from 'electron';

export interface ModelRegistryEntry {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  url: string;
  localFilename: string;
  sha256: string;
  description: string;
  default: boolean;
}

export interface InstalledModel {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  active: boolean;
}

export interface DownloadProgress {
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speed: string;
  etaSeconds: number;
}

const MODEL_REGISTRY: ModelRegistryEntry[] = [
  {
    id: 'bitnet-b1.58-2B4T',
    name: 'BitNet b1.58-2B-4T',
    size: '1.2GB',
    sizeBytes: 1187801280,
    url: 'https://huggingface.co/microsoft/BitNet-b1.58-2B-4T-gguf/resolve/main/ggml-model-i2_s.gguf',
    localFilename: 'bitnet-b1.58-2B4T.gguf',
    sha256: '',
    description: '2.4B parameter 1-bit LLM. Fast CPU inference, low energy.',
    default: true,
  },
];

export class ModelManager {
  private modelsDir: string;
  private configPath: string;
  private config: { selectedModel: string; port: number; contextSize: number; theme: string };

  constructor(dataDir: string) {
    this.modelsDir = path.join(dataDir, 'models');
    this.configPath = path.join(dataDir, 'config.json');
    fs.mkdirSync(this.modelsDir, { recursive: true });
    this.config = this.loadConfig();
  }

  private loadConfig() {
    const defaults = { selectedModel: 'bitnet-b1.58-2B4T', port: 8080, contextSize: 2048, theme: 'dark' };
    try {
      if (fs.existsSync(this.configPath)) {
        return { ...defaults, ...JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) };
      }
    } catch {}
    return defaults;
  }

  private saveConfig(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  getRegistry(): ModelRegistryEntry[] {
    return MODEL_REGISTRY;
  }

  listInstalled(): InstalledModel[] {
    const installed: InstalledModel[] = [];
    for (const entry of MODEL_REGISTRY) {
      const filePath = path.join(this.modelsDir, entry.localFilename);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        installed.push({
          id: entry.id,
          name: entry.name,
          path: filePath,
          sizeBytes: stat.size,
          active: this.config.selectedModel === entry.id,
        });
      }
    }
    return installed;
  }

  hasAnyModel(): boolean {
    return this.listInstalled().length > 0;
  }

  getActive(): { id: string; path: string } | null {
    const entry = MODEL_REGISTRY.find(m => m.id === this.config.selectedModel);
    if (!entry) return null;
    const filePath = path.join(this.modelsDir, entry.localFilename);
    if (!fs.existsSync(filePath)) return null;
    return { id: entry.id, path: filePath };
  }

  setActive(modelId: string): void {
    this.config.selectedModel = modelId;
    this.saveConfig();
  }

  async download(modelId: string, onProgress: (progress: DownloadProgress) => void): Promise<string> {
    const entry = MODEL_REGISTRY.find(m => m.id === modelId);
    if (!entry) throw new Error(`Model ${modelId} not found in registry`);

    const destPath = path.join(this.modelsDir, entry.localFilename);
    const tempPath = destPath + '.download';

    // Clean up any previous partial download
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}

    // Use Electron's net.fetch (Chromium network stack) — handles redirects,
    // proxies, and certificates properly unlike Node's https module
    const response = await net.fetch(entry.url, {
      headers: { 'User-Agent': 'YUNISA/1.0' },
    });

    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
    }

    const totalBytes = parseInt(response.headers.get('content-length') || '0', 10) || entry.sizeBytes;
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const file = fs.createWriteStream(tempPath);
    const startTime = Date.now();
    let downloadedBytes = 0;
    let lastProgressTime = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        file.write(Buffer.from(value));
        downloadedBytes += value.byteLength;

        // Throttle progress updates to max 4 per second
        const now = Date.now();
        if (now - lastProgressTime < 250) continue;
        lastProgressTime = now;

        const elapsed = (now - startTime) / 1000;
        const speed = elapsed > 0 ? downloadedBytes / elapsed : 0;
        const speedStr = speed > 1048576
          ? `${(speed / 1048576).toFixed(1)} MB/s`
          : `${(speed / 1024).toFixed(0)} KB/s`;
        const eta = speed > 0 ? Math.round((totalBytes - downloadedBytes) / speed) : 0;

        onProgress({
          modelId,
          downloadedBytes,
          totalBytes,
          percent: Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)),
          speed: speedStr,
          etaSeconds: eta,
        });
      }

      // Wait for file to finish writing
      await new Promise<void>((res, rej) => {
        file.end(() => {
          try {
            fs.renameSync(tempPath, destPath);
            res();
          } catch (err) {
            rej(err);
          }
        });
        file.on('error', rej);
      });

      this.config.selectedModel = modelId;
      this.saveConfig();

      onProgress({
        modelId,
        downloadedBytes: totalBytes,
        totalBytes,
        percent: 100,
        speed: '0 KB/s',
        etaSeconds: 0,
      });

      return destPath;
    } catch (err) {
      file.destroy();
      try { fs.unlinkSync(tempPath); } catch {}
      throw err;
    }
  }

  delete(modelId: string): void {
    const entry = MODEL_REGISTRY.find(m => m.id === modelId);
    if (!entry) return;
    const filePath = path.join(this.modelsDir, entry.localFilename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (this.config.selectedModel === modelId) {
      const remaining = this.listInstalled();
      this.config.selectedModel = remaining.length > 0 ? remaining[0].id : '';
      this.saveConfig();
    }
  }
}
