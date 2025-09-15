/**
 * Project template utility for generating project.yml files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

export interface ProjectTemplateVariables {
  PROJECT_NAME: string;
  VERSION: string;
  CREATED_DATE: string;
}

export class ProjectTemplate {
  private static templatePath: string;

  static {
    // Get the directory where this script is located
    const __dirname = dirname(fileURLToPath(import.meta.url));
    this.templatePath = path.join(__dirname, '..', 'templates', 'project.yml.template');
  }

  /**
   * Generate project.yml content from template
   */
  static async generateProjectConfig(variables: ProjectTemplateVariables): Promise<string> {
    try {
      const template = await fs.readFile(this.templatePath, 'utf8');

      // Simple template variable replacement
      let content = template;
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        content = content.replace(new RegExp(placeholder, 'g'), value);
      }

      return content;
    } catch (error) {
      throw new Error(`Failed to generate project config: ${error}`);
    }
  }

  /**
   * Create project.yml file at specified path
   */
  static async createProjectConfig(
    targetPath: string,
    variables: ProjectTemplateVariables
  ): Promise<void> {
    const content = await this.generateProjectConfig(variables);
    await fs.writeFile(targetPath, content, 'utf8');
  }
}