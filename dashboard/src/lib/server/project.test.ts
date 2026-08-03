import { afterAll, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ENV_DIR = mkdtempSync(join(tmpdir(), 'liquidupstart-test-'));
process.env.ENV_DIR = ENV_DIR;

const { APP_PASSWORD_DIR, APP_PASSWORD_FILE, readAppPassword, writeAppPassword } = await import(
  './project'
);

afterAll(() => rmSync(ENV_DIR, { recursive: true, force: true }));

describe('app password', () => {
  test('paths resolve under the project volumes dir', () => {
    expect(APP_PASSWORD_DIR).toBe(join(ENV_DIR, 'volumes', 'dashboard'));
    expect(APP_PASSWORD_FILE).toBe(join(ENV_DIR, 'volumes', 'dashboard', '.app_password'));
  });

  test('reads null when the file does not exist', () => {
    expect(existsSync(APP_PASSWORD_FILE)).toBe(false);
    expect(readAppPassword()).toBeNull();
  });

  test('writes the trimmed value with a trailing newline at mode 0600', () => {
    writeAppPassword('  secret-token-123  ');
    expect(readFileSync(APP_PASSWORD_FILE, 'utf8')).toBe('secret-token-123\n');
    expect(statSync(APP_PASSWORD_FILE).mode & 0o777).toBe(0o600);
  });

  test('creates the directory when it is missing', () => {
    rmSync(APP_PASSWORD_DIR, { recursive: true, force: true });
    expect(existsSync(APP_PASSWORD_DIR)).toBe(false);
    writeAppPassword('after-rmdir');
    expect(readAppPassword()).toBe('after-rmdir');
  });

  test('reads back the trimmed value', () => {
    writeAppPassword('abc-def-ghi');
    expect(readAppPassword()).toBe('abc-def-ghi');
  });

  test('reads null when the file holds only whitespace', () => {
    writeFileSync(APP_PASSWORD_FILE, '   \n\t\n');
    expect(readAppPassword()).toBeNull();
  });

  test('reads null instead of throwing when the path is a directory', () => {
    rmSync(APP_PASSWORD_FILE, { force: true });
    mkdirSync(APP_PASSWORD_FILE, { recursive: true });
    expect(readAppPassword()).toBeNull();
    rmSync(APP_PASSWORD_FILE, { recursive: true, force: true });
  });

  test('an in-place rewrite replaces the previous value', () => {
    writeAppPassword('first-value');
    expect(readAppPassword()).toBe('first-value');
    writeAppPassword('second-value');
    expect(readAppPassword()).toBe('second-value');
    expect(readFileSync(APP_PASSWORD_FILE, 'utf8')).toBe('second-value\n');
  });
});
