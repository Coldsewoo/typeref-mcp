import { User } from '../types.js';

export interface EmailTemplate {
  subject: string;
  body: string;
  variables: Record<string, any>;
}

export interface EmailConfig {
  provider: 'smtp' | 'ses' | 'sendgrid';
  apiKey?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

export class EmailService {
  private config: EmailConfig;
  private templates: Map<string, EmailTemplate> = new Map();

  constructor(config: EmailConfig) {
    this.config = config;
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    this.templates.set('welcome', {
      subject: 'Welcome to {{appName}}!',
      body: `
        <h1>Welcome {{firstName}}!</h1>
        <p>Thank you for joining {{appName}}. We're excited to have you on board.</p>
        <p>Your account has been created with email: {{email}}</p>
        <p>Best regards,<br>The {{appName}} Team</p>
      `,
      variables: {
        appName: 'TypeRef Demo',
        firstName: '',
        email: ''
      }
    });

    this.templates.set('password-reset', {
      subject: 'Password Reset Request',
      body: `
        <h1>Password Reset</h1>
        <p>Hi {{firstName}},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="{{resetLink}}">Reset Password</a>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      variables: {
        firstName: '',
        resetLink: ''
      }
    });
  }

  async sendWelcomeEmail(user: User): Promise<boolean> {
    const template = this.templates.get('welcome');
    if (!template) {
      throw new Error('Welcome email template not found');
    }

    const emailContent = this.renderTemplate(template, {
      firstName: user.firstName,
      email: user.email,
      appName: 'TypeRef Demo'
    });

    return this.sendEmail(user.email, emailContent.subject, emailContent.body);
  }

  async sendPasswordResetEmail(user: User, resetToken: string): Promise<boolean> {
    const template = this.templates.get('password-reset');
    if (!template) {
      throw new Error('Password reset email template not found');
    }

    const resetLink = `https://app.example.com/reset-password?token=${resetToken}`;
    const emailContent = this.renderTemplate(template, {
      firstName: user.firstName,
      resetLink
    });

    return this.sendEmail(user.email, emailContent.subject, emailContent.body);
  }

  async sendCustomEmail(
    recipient: string, 
    templateName: string, 
    variables: Record<string, any>
  ): Promise<boolean> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Email template '${templateName}' not found`);
    }

    const emailContent = this.renderTemplate(template, variables);
    return this.sendEmail(recipient, emailContent.subject, emailContent.body);
  }

  private renderTemplate(
    template: EmailTemplate, 
    variables: Record<string, any>
  ): { subject: string; body: string } {
    let subject = template.subject;
    let body = template.body;

    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), String(value));
      body = body.replace(new RegExp(placeholder, 'g'), String(value));
    });

    return { subject, body };
  }

  private async sendEmail(
    recipient: string, 
    subject: string, 
    body: string
  ): Promise<boolean> {
    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`[EmailService] Sending email to: ${recipient}`);
    console.log(`[EmailService] Subject: ${subject}`);
    console.log(`[EmailService] Provider: ${this.config.provider}`);

    // In a real implementation, this would call the actual email provider
    switch (this.config.provider) {
      case 'smtp':
        return this.sendViaSMTP(recipient, subject, body);
      case 'ses':
        return this.sendViaSES(recipient, subject, body);
      case 'sendgrid':
        return this.sendViaSendGrid(recipient, subject, body);
      default:
        throw new Error(`Unknown email provider: ${this.config.provider}`);
    }
  }

  private async sendViaSMTP(recipient: string, subject: string, body: string): Promise<boolean> {
    // Mock SMTP sending
    console.log(`[SMTP] Email sent successfully to ${recipient}`);
    return true;
  }

  private async sendViaSES(recipient: string, subject: string, body: string): Promise<boolean> {
    // Mock AWS SES sending
    console.log(`[SES] Email sent successfully to ${recipient}`);
    return true;
  }

  private async sendViaSendGrid(recipient: string, subject: string, body: string): Promise<boolean> {
    // Mock SendGrid sending
    console.log(`[SendGrid] Email sent successfully to ${recipient}`);
    return true;
  }

  async validateEmailAddress(email: string): Promise<boolean> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async getTemplateList(): Promise<string[]> {
    return Array.from(this.templates.keys());
  }

  async addTemplate(name: string, template: EmailTemplate): Promise<void> {
    this.templates.set(name, template);
  }

  async removeTemplate(name: string): Promise<boolean> {
    return this.templates.delete(name);
  }
}