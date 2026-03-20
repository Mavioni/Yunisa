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

    // Check for existing partial download to resume
    let existingBytes = 0;
    try {
      if (fs.existsSync(tempPath)) {
        existingBytes = fs.statSync(tempPath).size;
      }
    } catch {}

    return new Promise<string>((resolve, reject) => {
      const doRequest = (url: string, redirectCount: number) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'));
          return;
        }

        const parsed = new URL(url);
        const transport = parsed.protocol === 'https:' ? https : http;
        const reqHeaders: Record<string, string> = { 'User-Agent': 'YUNISA/1.0' };
        if (existingBytes > 0) {
          reqHeaders['Range'] = `bytes=${existingBytes}-`;
        }

        const req = transport.get(
          {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            headers: reqHeaders,
          },
          (res) => {
            // Follow redirects — clear this request's timeout before recursing
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              req.setTimeout(0); // cancel timeout so it doesn't fire during the real download
              res.resume();
              const redirectUrl = new URL(res.headers.location, url).href;
              doRequest(redirectUrl, redirectCount + 1);
              return;
            }

            if (res.statusCode !== 200 && res.statusCode !== 206) {
              res.resume();
              reject(new Error(`Download failed: HTTP ${res.statusCode}`));
              return;
            }

            const isResume = res.statusCode === 206 && existingBytes > 0;
            if (!isResume && existingBytes > 0) {
              // Server doesn't support range — start fresh
              try { fs.unlinkSync(tempPath); } catch {}
              existingBytes = 0;
            }

            const contentLength = parseInt(res.headers['content-length'] || '0', 10);
            const totalBytes = isResume
              ? existingBytes + contentLength
              : (contentLength || entry.sizeBytes);

            const file = fs.createWriteStream(tempPath, isResume ? { flags: 'a' } : undefined);
            const startTime = Date.now();
            let downloadedBytes = isResume ? existingBytes : 0;
            let lastProgressTime = 0;

            // Data is flowing — cancel the connect timeout
            req.setTimeout(0);

            res.on('data', (chunk: Buffer) => {
              // Handle backpressure: if write buffer is full, pause the network stream
              const canContinue = file.write(chunk);
              downloadedBytes += chunk.length;

              if (!canContinue) {
                res.pause();
                file.once('drain', () => res.resume());
              }

              // Throttle progress updates to max 4 per second
              const now = Date.now();
              if (now - lastProgressTime < 250) return;
              lastProgressTime = now;

              const elapsed = (now - startTime) / 1000;
              const bytesThisSession = downloadedBytes - (isResume ? existingBytes : 0);
              const speed = elapsed > 0 ? bytesThisSession / elapsed : 0;
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
            });

            res.on('end', () => {
              file.end(() => {
                try {
                  fs.renameSync(tempPath, destPath);
                } catch (err) {
                  reject(err);
                  return;
                }

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

                resolve(destPath);
              });
            });

            res.on('error', (err) => {
              file.destroy();
              // Don't delete temp file — allows resume on retry
              reject(new Error(`Download interrupted: ${err.message}. Click "Try Again" to resume.`));
            });

            file.on('error', (err) => {
              res.destroy();
              reject(new Error(`Failed to write file: ${err.message}`));
            });
          }
        );

        req.on('error', (err) => {
          reject(new Error(`Connection failed: ${err.message}. Please check your internet connection.`));
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Connection timed out. Click "Try Again" to resume the download.'));
        });

        req.setTimeout(30000); // 30s connect timeout
      };

      doRequest(entry.url, 0);
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
