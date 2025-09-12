import { User, CreateUserRequest, UpdateUserRequest, PaginatedResponse, ApiResponse, Role } from '../types.js';
import { BaseService } from './BaseService.js';
import { EmailService } from './EmailService.js';

export class UserService extends BaseService<User> {
  private emailService: EmailService;
  private static instance: UserService;
  
  constructor(emailService: EmailService) {
    super('users');
    this.emailService = emailService;
  }

  // Singleton pattern
  static getInstance(emailService: EmailService): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService(emailService);
    }
    return UserService.instance;
  }

  // Async operations with complex return types
  async createUser(userData: CreateUserRequest): Promise<ApiResponse<User>> {
    try {
      const existingUser = await this.findByEmail(userData.email);
      if (existingUser) {
        return {
          data: null as any,
          status: 'error',
          message: 'User already exists',
          errors: [{
            field: 'email',
            code: 'DUPLICATE_EMAIL',
            message: 'Email address is already in use'
          }]
        };
      }

      const user: User = {
        ...userData,
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.save(user);
      await this.emailService.sendWelcomeEmail(user);

      return {
        data: user,
        status: 'success',
        message: 'User created successfully'
      };
    } catch (error) {
      return {
        data: null as any,
        status: 'error',
        message: 'Failed to create user',
        errors: [{
          field: 'general',
          code: 'CREATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }]
      };
    }
  }

  async updateUser(id: string, updates: UpdateUserRequest): Promise<ApiResponse<User>> {
    const user = await this.findById(id);
    if (!user) {
      return {
        data: null as any,
        status: 'error',
        message: 'User not found'
      };
    }

    const updatedUser: User = {
      ...user,
      ...updates,
      updatedAt: new Date()
    };

    await this.save(updatedUser);

    return {
      data: updatedUser,
      status: 'success',
      message: 'User updated successfully'
    };
  }

  async getUsersByRole(roleName: string): Promise<PaginatedResponse<User>> {
    const users = await this.findAll();
    const filteredUsers = users.filter(user => 
      user.roles.some(role => role.name === roleName)
    );

    return {
      data: filteredUsers,
      status: 'success',
      pagination: {
        page: 1,
        pageSize: filteredUsers.length,
        total: filteredUsers.length,
        hasNext: false,
        hasPrev: false
      }
    };
  }

  // Generic method
  async processUserData<T>(
    userId: string, 
    processor: (user: User) => T
  ): Promise<T | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    
    return processor(user);
  }

  // Method with complex parameter types
  async bulkUpdateUsers(
    updates: Array<{ id: string; data: UpdateUserRequest }>
  ): Promise<ApiResponse<User[]>> {
    const results: User[] = [];
    const errors: any[] = [];

    for (const update of updates) {
      try {
        const result = await this.updateUser(update.id, update.data);
        if (result.status === 'success') {
          results.push(result.data);
        } else {
          errors.push(...(result.errors || []));
        }
      } catch (error) {
        errors.push({
          field: update.id,
          code: 'UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      data: results,
      status: errors.length === 0 ? 'success' : 'error',
      message: `Updated ${results.length} users`,
      errors
    };
  }

  // Private helper methods
  private async findByEmail(email: string): Promise<User | null> {
    const users = await this.findAll();
    return users.find(user => user.email === email) || null;
  }

  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Method with function parameters
  async validateUsers(validator: (user: User) => boolean): Promise<User[]> {
    const users = await this.findAll();
    return users.filter(validator);
  }

  // Async generator method
  async* getUsersStream(): AsyncGenerator<User, void, unknown> {
    const users = await this.findAll();
    for (const user of users) {
      yield user;
      // Simulate async processing
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}