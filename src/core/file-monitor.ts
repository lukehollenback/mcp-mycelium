import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import pino from 'pino';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: Date;
}

export class FileMonitorError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FileMonitorError';
  }
}

export class FileMonitor extends EventEmitter {
  private watcher?: ReturnType<typeof chokidar.watch>;
  private changeBuffer = new Map<string, FileChangeEvent>();
  private debounceTimer?: NodeJS.Timeout;
  private logger = pino({ name: 'FileMonitor' });
  private isRunning = false;

  constructor(
    private watchPath: string,
    private debounceMs: number = 1000
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn({ path: this.watchPath }, 'File monitor already running');
      return;
    }

    try {
      this.logger.info({ path: this.watchPath, debounceMs: this.debounceMs }, 'Starting file monitor');

      this.watcher = chokidar.watch(this.watchPath, {
        persistent: true,
        ignored: [
          /(^|[/\\])\../,
          '**/node_modules/**',
          '**/.git/**',
          '**/.DS_Store',
          '**/Thumbs.db',
          '**/*.tmp',
          '**/*.temp',
        ],
        ignoreInitial: true,
        followSymlinks: false,
        depth: 10,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 10,
        },
      });

      this.watcher.on('add', (path: string) => this.handleFileEvent('add', path));
      this.watcher.on('change', (path: string) => this.handleFileEvent('change', path));
      this.watcher.on('unlink', (path: string) => this.handleFileEvent('unlink', path));

      this.watcher.on('error', (error: unknown) => {
        this.logger.error({ error, path: this.watchPath }, 'File watcher error');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.emit('error', new FileMonitorError(
          `File watcher error: ${errorMessage}`,
          this.watchPath,
          'watch',
          error instanceof Error ? error : undefined
        ));
      });

      this.watcher.on('ready', () => {
        this.logger.info({ path: this.watchPath }, 'File monitor ready');
        this.isRunning = true;
        this.emit('ready');
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new FileMonitorError(
            'File monitor startup timeout',
            this.watchPath,
            'start'
          ));
        }, 10000);

        this.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      this.logger.error({ error, path: this.watchPath }, 'Failed to start file monitor');
      throw new FileMonitorError(
        `Failed to start file monitor: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.watchPath,
        'start',
        error instanceof Error ? error : undefined
      );
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info({ path: this.watchPath }, 'Stopping file monitor');

    try {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.processPendingChanges();
      }

      if (this.watcher) {
        await this.watcher.close();
        this.watcher = undefined;
      }

      this.isRunning = false;
      this.changeBuffer.clear();
      this.removeAllListeners();

      this.logger.info({ path: this.watchPath }, 'File monitor stopped');
    } catch (error) {
      this.logger.error({ error, path: this.watchPath }, 'Error stopping file monitor');
      throw new FileMonitorError(
        `Failed to stop file monitor: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.watchPath,
        'stop',
        error instanceof Error ? error : undefined
      );
    }
  }

  private handleFileEvent(type: 'add' | 'change' | 'unlink', filePath: string): void {
    if (!this.isRunning) {
      return;
    }

    const event: FileChangeEvent = {
      type,
      path: filePath,
      timestamp: new Date(),
    };

    this.changeBuffer.set(filePath, event);

    this.logger.debug({ type, path: filePath }, 'File event buffered');

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, this.debounceMs);
  }

  private processPendingChanges(): void {
    if (this.changeBuffer.size === 0) {
      return;
    }

    const changes = Array.from(this.changeBuffer.values());
    this.changeBuffer.clear();

    this.logger.debug({ count: changes.length }, 'Processing pending file changes');

    const batches = this.groupChangesByType(changes);

    for (const [type, paths] of batches) {
      this.emitBatchedChanges(type, paths);
    }
  }

  private groupChangesByType(changes: FileChangeEvent[]): Map<string, string[]> {
    const batches = new Map<string, string[]>();

    for (const change of changes) {
      if (!batches.has(change.type)) {
        batches.set(change.type, []);
      }
      batches.get(change.type)!.push(change.path);
    }

    return batches;
  }

  private emitBatchedChanges(type: string, paths: string[]): void {
    for (const path of paths) {
      try {
        switch (type) {
          case 'add':
          case 'change':
            this.emit('fileChanged', path);
            break;
          case 'unlink':
            this.emit('fileDeleted', path);
            break;
        }
      } catch (error) {
        this.logger.error({ type, path, error }, 'Error emitting file change event');
        this.emit('error', new FileMonitorError(
          `Error processing file change: ${error instanceof Error ? error.message : 'Unknown error'}`,
          path,
          type,
          error instanceof Error ? error : undefined
        ));
      }
    }
  }

  getWatchedPath(): string {
    return this.watchPath;
  }

  isWatching(): boolean {
    return this.isRunning;
  }

  getPendingChanges(): FileChangeEvent[] {
    return Array.from(this.changeBuffer.values());
  }

  async forceProcessPending(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.processPendingChanges();
  }

  getStats(): {
    watching: boolean;
    watchPath: string;
    pendingChanges: number;
    debounceMs: number;
  } {
    return {
      watching: this.isRunning,
      watchPath: this.watchPath,
      pendingChanges: this.changeBuffer.size,
      debounceMs: this.debounceMs,
    };
  }
}