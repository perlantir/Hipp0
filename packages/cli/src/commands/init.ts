import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Hipp0Client } from '@hipp0/sdk';
import { getClient, prompt, handleError } from '../cli-helpers.js';

const _require = createRequire(import.meta.url);

/**
 * Generate a local Hipp0 API key: "h0_local_" + 16 random characters.
 */
function generateApiKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const { randomUUID } = crypto;
  // Use the UUID entropy but reformat as a shorter key.
  const uuid = randomUUID().replace(/-/g, '');
  // Take 16 hex chars and map them to the alphanumeric set.
  const raw = uuid.slice(0, 16);
  const mapped = raw
    .split('')
    .map((ch) => chars[parseInt(ch, 16) % chars.length])
    .join('');
  return `h0_local_${mapped}`;
}

/**
 * Spawn the Hipp0 server as a detached background process and write a PID
 * file so that `hipp0 stop` can terminate it later.
 */
function spawnServer(
  dir: string,
  sqlitePath: string,
  apiKey: string,
  port: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Locate the server entry-point relative to this CLI package.
    let serverEntry: string;
    try {
      // When installed via npm both packages land next to each other.
      serverEntry = _require.resolve('@hipp0/server');
    } catch {
      // Fallback for monorepo / development usage.
      serverEntry = path.resolve(
        path.dirname(_require.resolve('@hipp0/cli/package.json')),
        '..',
        'server',
        'dist',
        'index.js',
      );
    }

    const child = spawn(process.execPath, [serverEntry], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        HIPP0_SQLITE_PATH: sqlitePath,
        HIPP0_API_KEY: apiKey,
      },
      cwd: dir,
    });

    child.on('error', reject);

    child.unref();

    // Write PID file so `hipp0 stop` can signal the process.
    const pid = child.pid;
    if (pid === undefined) {
      reject(new Error('Failed to obtain server PID'));
      return;
    }

    const pidFile = path.join(dir, '.hipp0.pid');
    fs.writeFileSync(pidFile, String(pid), 'utf-8');

    resolve(pid);
  });
}

export function registerInitCommand(program: Command): void {
  program
    .command('init [name]')
    .description('Create a new Hipp0 project (or initialise a local server if no API URL is set)')
    .option('-d, --description <desc>', 'Project description')
    .option('-p, --port <port>', 'Port for the local server', '3100')
    .action(async (name?: string, opts?: { description?: string; port?: string }) => {
      const apiUrl = process.env.HIPP0_API_URL;

      // ------------------------------------------------------------------
      // Remote-API mode: HIPP0_API_URL is set → existing behaviour
      // ------------------------------------------------------------------
      if (apiUrl) {
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
          console.warn(chalk.yellow(`  export HIPP0_PROJECT_ID="${project.id}"`));
        } catch (err) {
          handleError(err, spinner);
        }
        return;
      }

      // ------------------------------------------------------------------
      // Local SQLite mode: no HIPP0_API_URL → zero-infrastructure setup
      // ------------------------------------------------------------------
      const port = parseInt(opts?.port ?? '3100', 10);

      // Determine working directory.
      let dir: string;
      if (name) {
        dir = path.resolve(process.cwd(), name);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.warn(chalk.dim(`Created directory: ${dir}`));
        }
      } else {
        dir = process.cwd();
      }

      const sqlitePath = path.join(dir, 'hipp0.db');
      const apiKey = generateApiKey();

      const spinner = ora('Initialising local Hipp0…').start();

      try {
        // Initialise the SQLite database (runs migrations via the adapter).
        const { initDb, closeDb } = await import('@hipp0/core/db/index.js');
        const db = await initDb({ dialect: 'sqlite', sqlitePath });
        // Verify it's reachable.
        await db.query('SELECT 1 AS ok');
        // Close the handle here — the server process will re-open it.
        await closeDb();

        spinner.text = 'Starting server…';

        // Start the server as a background process.
        await spawnServer(dir, sqlitePath, apiKey, port);

        // Give the server a moment to bind to the port before printing the
        // success banner.
        await new Promise((r) => setTimeout(r, 800));

        spinner.succeed(chalk.green('✓ Hipp0 is running!'));

        const relativePath = path.relative(process.cwd(), sqlitePath) || './hipp0.db';
        console.warn('');
        console.warn(`  ${chalk.bold('API:')}       http://localhost:${port}`);
        console.warn(`  ${chalk.bold('Dashboard:')} http://localhost:${port}/dashboard`);
        console.warn(`  ${chalk.bold('Database:')}  ${relativePath}`);
        console.warn(`  ${chalk.bold('API Key:')}   ${chalk.cyan(apiKey)}`);
        console.warn('');
        console.warn(chalk.dim('  Open the dashboard to set up your first project.'));
        console.warn('');
        console.warn(chalk.dim(`  To stop the server run: hipp0 stop`));
        if (name) {
          console.warn(chalk.dim(`  To use this project, cd into: ${name}`));
        }
      } catch (err) {
        handleError(err, spinner);
      }
    });
}
