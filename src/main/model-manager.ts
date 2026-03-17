import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

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

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let downloadedBytes = 0;

      const doRequest = (url: string) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, { headers: { 'User-Agent': 'YUNISA/1.0' } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            doRequest(res.headers.location);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10) || entry.sizeBytes;
          const file = fs.createWriteStream(tempPath);

          res.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? downloadedBytes / elapsed : 0;
            const speedStr = speed > 1048576
              ? `${(speed / 1048576).toFixed(1)} MB/s`
              : `${(speed / 1024).toFixed(0)} KB/s`;

            onProgress({
              modelId,
              downloadedBytes,
              totalBytes,
              percent: Math.round((downloadedBytes / totalBytes) * 100),
              speed: speedStr,
            });
          });

          res.pipe(file);

          file.on('finish', () => {
            file.close(() => {
              fs.renameSync(tempPath, destPath);
              this.config.selectedModel = modelId;
              this.saveConfig();
              resolve(destPath);
            });
          });

          file.on('error', (err) => {
            fs.unlinkSync(tempPath);
            reject(err);
          });
        }).on('error', reject);
      };

      doRequest(entry.url);
    });
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
