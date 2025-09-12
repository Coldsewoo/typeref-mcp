// Advanced type definitions
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User extends BaseEntity {
  email: string;
  firstName: string;
  lastName: string;
  age?: number;
  roles: Role[];
  preferences: UserPreferences;
}

export interface Role {
  name: string;
  permissions: Permission[];
  level: number;
}

export interface Permission {
  resource: string;
  actions: ('read' | 'write' | 'delete' | 'admin')[];
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  language: string;
}

export interface Product extends BaseEntity {
  name: string;
  description?: string;
  price: Money;
  category: Category;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface Money {
  amount: number;
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY';
}

export interface Category extends BaseEntity {
  name: string;
  slug: string;
  parentId?: string;
  children?: Category[];
}

// Complex generic types
export interface ApiResponse<T> {
  data: T;
  status: 'success' | 'error';
  message?: string;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Utility types
export type UserWithoutDates = Omit<User, 'createdAt' | 'updatedAt'>;
export type CreateUserRequest = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateUserRequest = Partial<CreateUserRequest>;
export type UserRole = Pick<User, 'id' | 'email' | 'roles'>;

// Conditional types
export type ApiResult<T> = T extends string 
  ? { message: T } 
  : T extends number 
    ? { code: T } 
    : { data: T };

// Mapped types
export type Optional<T> = {
  [P in keyof T]?: T[P];
};

export type ReadOnly<T> = {
  readonly [P in keyof T]: T[P];
};

// Template literal types
export type EventName = `user:${string}` | `product:${string}` | `system:${string}`;

// Function types
export type EventHandler<T = any> = (event: T) => Promise<void> | void;
export type AsyncFunction<T, R> = (arg: T) => Promise<R>;
export type Validator<T> = (value: T) => boolean | string;