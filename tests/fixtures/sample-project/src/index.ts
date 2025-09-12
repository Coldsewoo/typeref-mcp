// Re-export all types for convenience
export * from './types.js';

// Re-export services
export { BaseService } from './services/BaseService.js';
export { UserService } from './services/UserService.js';
export { EmailService, type EmailTemplate, type EmailConfig } from './services/EmailService.js';

// Legacy simple interfaces (kept for backwards compatibility)
export interface SimpleUser {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

export interface SimpleProduct {
  id: number;
  title: string;
  price: number;
  category: string;
}

export class SimpleUserService {
  private users: SimpleUser[] = [];

  constructor() {}

  async createUser(user: Omit<SimpleUser, 'id'>): Promise<SimpleUser> {
    const newUser: SimpleUser = {
      id: this.users.length + 1,
      ...user
    };
    this.users.push(newUser);
    return newUser;
  }

  async getUserById(id: number): Promise<SimpleUser | null> {
    return this.users.find(user => user.id === id) || null;
  }

  async getAllUsers(): Promise<SimpleUser[]> {
    return this.users.filter(user => user.isActive);
  }
}

export enum Status {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export type RequestStatus = Status;

export const API_BASE_URL = 'https://api.example.com';
export const DEFAULT_TIMEOUT = 5000;