/**
 * In-memory cache implementation with TTL support
 */

import { CacheManager, CacheStats } from '../interfaces.js';
import { CacheEntry } from '../types.js';

export class MemoryCache implements CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };
  private cleanupInterval: NodeJS.Timeout;
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor(private maxSize: number = 1000, private defaultTTL: number = 10 * 60 * 1000) {
    // Start automatic cleanup
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL);
  }

  private performCleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    let freedEntries = 0;

    // Remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      freedEntries++;
    }

    // If still over capacity, remove oldest entries
    if (this.cache.size > this.maxSize * 0.8) { // Keep at 80% capacity
      this.evictOldestBatch(this.cache.size - Math.floor(this.maxSize * 0.8));
    }

    if (freedEntries > 0) {
      console.debug(`Cache cleanup: removed ${freedEntries} expired entries, ${this.cache.size} remaining`);
    }
  }

  private evictOldestBatch(count: number): void {
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp)
      .slice(0, count);

    for (const [key] of entries) {
      this.cache.delete(key);
      this.stats.evictions++;
    }
  }

  // Add pattern-based deletion for project-specific cleanup
  deleteByPattern(pattern: string): number {
    const regex = this.createPatternRegex(pattern);
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    return keysToDelete.length;
  }

  // Cleanup method for graceful shutdown
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    };

    this.cache.set(key, entry);
  }

  invalidate(pattern: string): void {
    const regex = this.createPatternRegex(pattern);
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      missRate: total > 0 ? this.stats.misses / total : 0,
      evictions: this.stats.evictions,
    };
  }

  private evictOldest(): void {
    if (this.cache.size === 0) return;

    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  private createPatternRegex(pattern: string): RegExp {
    // Convert glob-like pattern to regex
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*') // Convert * to .*
      .replace(/\?/g, '.'); // Convert ? to .
    
    return new RegExp(`^${escaped}$`);
  }
}