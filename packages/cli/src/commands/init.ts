import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { NexusClient } from '@nexus/sdk';
import { getClient, prompt, handleError } from '../cli-helpers.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init [name]')
    .description('Create a new Nexus project')
    .option('-d, --description <desc>', 'Project description')
    .action(async (name?: string, opts?: { description?: string }) => {
      const client = getClient();

      const projectName = name ?? (await prompt(chalk.bold('Project name: ')));
      if (!projectName) {
        console.error(chalk.red('Project name is required'));
        process.exit(1);
      }

      const description =
        opts?.description ?? (await prompt(chalk.dim('Description (optional): ')));

      const spinner = ora('Creating project...').start();
      try {
        const project = await client.createProject({
          name: projectName,
          description: description || undefined,
        });
        spinner.succeed(chalk.green(`Project created!`));
        console.warn(`\n  ${chalk.bold('Name:')}    ${project.name}`);
        console.warn(`  ${chalk.bold('ID:')}      ${chalk.cyan(project.id)}`);
        if (project.description) console.warn(`  ${chalk.bold('Desc:')}    ${project.description}`);
        console.warn(
          `\n${chalk.dim('Set the following environment variable to use this project:')}`,
        );
        console.warn(chalk.yellow(`  export NEXUS_PROJECT_ID="${project.id}"`));
      } catch (err) {
        handleError(err, spinner);
      }
    });
}
