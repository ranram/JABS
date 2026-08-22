import { describe, expect, it } from 'vitest';
import { localApiActionHeader, localApiActionHeaderValue } from '../../shared/localApi';
import { withJsonBodyHeaders } from './requestInit';

describe('local API request initialization', () => {
  it('adds mutation and JSON headers only when appropriate', () => {
    expect(new Headers(withJsonBodyHeaders().headers).has(localApiActionHeader)).toBe(false);
    const bodyless = new Headers(withJsonBodyHeaders({ method: 'POST' }).headers);
    expect(bodyless.get(localApiActionHeader)).toBe(localApiActionHeaderValue);
    expect(bodyless.has('Content-Type')).toBe(false);
    const json = new Headers(withJsonBodyHeaders({ method: 'POST', body: '{}' }).headers);
    expect(json.get('Content-Type')).toBe('application/json');
    const explicit = new Headers(withJsonBodyHeaders({ method: 'POST', body: 'score=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).headers);
    expect(explicit.get('Content-Type')).toBe('application/x-www-form-urlencoded');
  });
});
