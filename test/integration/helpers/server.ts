/**
 * Test Server Setup
 * Starts and stops the API server for testing
 */

// Imported from source rather than dist/ so a run does not depend on a build
// being current. The env this server reads is set in ../setup-env.ts, which
// vitest loads before this module graph.
import type { FastifyInstance } from 'fastify';
import { createServer as buildApiServer } from '../../../src/server.js';
import { HttpClient } from './http.js';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);
const API_KEY = process.env.API_KEY ?? 'test-api-key-for-integration-tests';

export const BASE_URL = `http://${HOST}:${PORT}`;

let apiServer: FastifyInstance | null = null;

export async function startTestServer(): Promise<void> {
  if (apiServer) {
    return; // Already running
  }

  const server = await buildApiServer();
  // createServer() only builds the instance; without listen() the tests would
  // hit a closed port.
  await server.listen({ host: HOST, port: PORT });
  apiServer = server;
}

export async function stopTestServer(): Promise<void> {
  if (apiServer) {
    await apiServer.close();
    apiServer = null;
  }
}

export function createTestClient(): HttpClient {
  return new HttpClient(
    BASE_URL,
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    30000,
  );
}
