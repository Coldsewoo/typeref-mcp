/**
 * Simple file watcher implementation using chokidar
 */

import chokidar, { FSWatcher } from 'chokidar';
import { FileWatcher, FileChangeCallback, Logger } from '../interfaces.js';
import { FileChangeType } from '../interfaces.js';

export class SimpleFileWatcher implements FileWatcher {
  private watchers = new Map<string, FSWatcher>();

  constructor(private logger: Logger) {}

  watch(path: string, callback: FileChangeCallback): void {
    if (this.watchers.has(path)) {
      this.logger.warn(`Already watching path: ${path}`);
      return;
    }

    this.logger.debug(`Starting to watch: ${path}`);

    const watcher = chokidar.watch(`${path}/**/*.{ts,tsx}`, {
      ignored: [
        /node_modules/,
        /\.d\.ts$/,
        /dist\//,
        /build\//,
        /coverage\//,
        /\.git\//,
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher.on('add', (filePath) => {
      this.logger.debug(`File added: ${filePath}`);
      callback(FileChangeType.Created, filePath);
    });

    watcher.on('change', (filePath) => {
      this.logger.debug(`File changed: ${filePath}`);
      callback(FileChangeType.Modified, filePath);
    });

    watcher.on('unlink', (filePath) => {
      this.logger.debug(`File deleted: ${filePath}`);
      callback(FileChangeType.Deleted, filePath);
    });

    watcher.on('error', (error) => {
      this.logger.error(`Watcher error for ${path}:`, error);
    });

    watcher.on('ready', () => {
      this.logger.info(`File watcher ready for: ${path}`);
    });

    this.watchers.set(path, watcher);
  }

  unwatch(path: string): void {
    const watcher = this.watchers.get(path);
    if (watcher) {
      this.logger.debug(`Stopping watch for: ${path}`);
      watcher.close();
      this.watchers.delete(path);
    }
  }

  dispose(): void {
    this.logger.info(`Disposing file watcher (${this.watchers.size} watchers)`);
    
    for (const [path, watcher] of this.watchers.entries()) {
      this.logger.debug(`Closing watcher for: ${path}`);
      watcher.close();
    }
    
    this.watchers.clear();
  }
}