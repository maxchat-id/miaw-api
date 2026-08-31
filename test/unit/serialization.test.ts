/**
 * Regression guard for response-schema serialization (ISSUE-03, ISSUE-06).
 * Fastify's fast-json-stringify strips object properties that aren't declared.
 * An object-typed field with neither `properties` nor `additionalProperties`
 * serializes to {} — which silently dropped webhook testEvent payloads and
 * product error details. `additionalProperties: true` preserves them.
 */

import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';

const sample = { event: 'test', data: { test: true, note: 'hi' } };

describe('response schema object serialization', () => {
  it('strips nested object keys when neither properties nor additionalProperties are set (the bug)', async () => {
    const app = Fastify();
    app.get(
      '/buggy',
      {
        schema: {
          response: { 200: { type: 'object', properties: { testEvent: { type: 'object' } } } },
        },
      },
      async () => ({ testEvent: sample }),
    );

    const res = await app.inject({ method: 'GET', url: '/buggy' });
    expect(res.json().testEvent).toEqual({});
    await app.close();
  });

  it('preserves nested object payloads with additionalProperties: true (the fix)', async () => {
    const app = Fastify();
    app.get(
      '/fixed',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              properties: {
                testEvent: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
      async () => ({ testEvent: sample }),
    );

    const res = await app.inject({ method: 'GET', url: '/fixed' });
    expect(res.json().testEvent).toEqual(sample);
    await app.close();
  });

  it('preserves error.details with additionalProperties: true', async () => {
    const app = Fastify();
    app.get(
      '/err',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              properties: {
                error: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    message: { type: 'string' },
                    details: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
        },
      },
      async () => ({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Failed',
          details: { error: 'business account required' },
        },
      }),
    );

    const res = await app.inject({ method: 'GET', url: '/err' });
    expect(res.json().error.details).toEqual({ error: 'business account required' });
    await app.close();
  });
});
