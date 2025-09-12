import { BaseEntity } from '../types.js';

export abstract class BaseService<T extends BaseEntity> {
  protected entityName: string;
  protected storage: Map<string, T> = new Map();

  constructor(entityName: string) {
    this.entityName = entityName;
  }

  async findById(id: string): Promise<T | null> {
    return this.storage.get(id) || null;
  }

  async findAll(): Promise<T[]> {
    return Array.from(this.storage.values());
  }

  async save(entity: T): Promise<T> {
    this.storage.set(entity.id, entity);
    return entity;
  }

  async delete(id: string): Promise<boolean> {
    return this.storage.delete(id);
  }

  async count(): Promise<number> {
    return this.storage.size;
  }

  async findBy(predicate: (entity: T) => boolean): Promise<T[]> {
    return Array.from(this.storage.values()).filter(predicate);
  }

  async exists(id: string): Promise<boolean> {
    return this.storage.has(id);
  }

  protected async validateEntity(entity: T): Promise<void> {
    if (!entity.id) {
      throw new Error(`${this.entityName} must have an id`);
    }
    if (!entity.createdAt) {
      throw new Error(`${this.entityName} must have a createdAt date`);
    }
    if (!entity.updatedAt) {
      throw new Error(`${this.entityName} must have an updatedAt date`);
    }
  }
}