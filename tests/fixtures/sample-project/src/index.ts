export interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

export interface Product {
  id: number;
  title: string;
  price: number;
  category: string;
}

export class UserService {
  private users: User[] = [];

  constructor() {}

  async createUser(user: Omit<User, 'id'>): Promise<User> {
    const newUser: User = {
      id: this.users.length + 1,
      ...user
    };
    this.users.push(newUser);
    return newUser;
  }

  async getUserById(id: number): Promise<User | null> {
    return this.users.find(user => user.id === id) || null;
  }

  async getAllUsers(): Promise<User[]> {
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