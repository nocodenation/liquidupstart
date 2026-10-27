import { test } from 'bun:test';
import { requireStack } from './stack';

export function stackGuard(names?: string[]): void {
  test('the stack is running', () => {
    requireStack(names);
  });
}
