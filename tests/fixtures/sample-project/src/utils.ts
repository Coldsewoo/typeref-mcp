import { User, Product } from './index';

export function formatUserName(user: User): string {
  return `${user.name} <${user.email}>`;
}

export function calculateTotal(products: Product[]): number {
  return products.reduce((sum, product) => sum + product.price, 0);
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export class Logger {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  info(message: string): void {
    console.log(`[INFO${this.prefix ? ` ${this.prefix}` : ''}] ${message}`);
  }

  error(message: string): void {
    console.error(`[ERROR${this.prefix ? ` ${this.prefix}` : ''}] ${message}`);
  }
}