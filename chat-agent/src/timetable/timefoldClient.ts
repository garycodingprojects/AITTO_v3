import type { Timetable } from './types.js';

/** HTTP client for the Quarkus Timefold REST API (localhost:8080 by default). */

export class TimefoldClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body == null ? undefined : { 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errorJson = (await response.json()) as { message?: string };
        if (errorJson.message) {
          detail = errorJson.message;
        }
      } catch {
        // Ignore JSON parse errors for non-JSON error bodies.
      }
      throw new Error(`Timefold API ${method} ${path} failed (${response.status}): ${detail}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }

    return (await response.text()) as T;
  }

  /** Lists available demo dataset ids (e.g. dataset1, dataset2). */
  listDemoDataIds(): Promise<string[]> {
    return this.request<string[]>('GET', '/demo-data');
  }

  /** Loads an unsolved demo timetable. */
  getDemoData(id: string): Promise<Timetable> {
    return this.request<Timetable>('GET', `/demo-data/${encodeURIComponent(id)}`);
  }

  /** Submits a timetable for solving; returns job id as plain text. */
  async solve(timetable: Timetable): Promise<string> {
    const jobId = await this.request<string>('POST', '/timetables', timetable);
    return String(jobId).trim();
  }

  /** Polls solver status until NOT_SOLVING or timeout. */
  async waitForCompletion(jobId: string, timeoutMs = 120_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const status = await this.getStatus(jobId);
      if (status.solverStatus === 'NOT_SOLVING') {
        return;
      }
      await sleep(500);
    }
    throw new Error(`Solver job ${jobId} did not finish within ${timeoutMs}ms`);
  }

  /** Returns lightweight status for a solver job. */
  getStatus(jobId: string): Promise<Timetable> {
    return this.request<Timetable>('GET', `/timetables/${encodeURIComponent(jobId)}/status`);
  }

  /** Returns the best solution for a solver job. */
  getTimetable(jobId: string): Promise<Timetable> {
    return this.request<Timetable>('GET', `/timetables/${encodeURIComponent(jobId)}`);
  }

  /** Solves and waits for the final timetable solution. */
  async solveAndFetch(timetable: Timetable): Promise<{ jobId: string; timetable: Timetable }> {
    const jobId = await this.solve(timetable);
    await this.waitForCompletion(jobId);
    const solution = await this.getTimetable(jobId);
    return { jobId, timetable: solution };
  }

  /** Recalculates score and violation labels without starting the solver. */
  scoreTimetable(timetable: Timetable): Promise<Timetable> {
    return this.request<Timetable>('PUT', '/timetables/score', timetable);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
