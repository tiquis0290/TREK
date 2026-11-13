/**
 * PublicApiController — `GET /api/v1/trips/:id/tours/:tourRef/gpx` and `/fit`.
 *
 * The two routes hand a tour's route to an integration: GPX for route planners
 * and bike computers, FIT for a Garmin watch, which takes a downloaded course
 * in no other form. What they decide on their own is pinned here, for both: the
 * scopes they need, how the two ids are parsed, that an unreadable trip answers
 * like any other trip read, and that a tour without a line is refused with a
 * code an integration can branch on. The SQL behind them is the e2e suite's.
 */
import { DomainError } from '../../../src/nest/common/domain-error';
import type { RateLimitService } from '../../../src/nest/common/rate-limit.service';
import { PublicApiController } from '../../../src/nest/public-api/public-api.controller';
import type { PublicApiService } from '../../../src/nest/public-api/public-api.service';
import { HttpException, NotFoundException } from '@nestjs/common';
import { PUBLIC_API_SCOPES, type PublicApiScope } from '@trek/shared';

import type { Request, Response } from 'express';
import { describe, it, expect, vi } from 'vitest';

type Format = 'gpx' | 'fit';

const FILES: Record<Format, { body: string | Buffer; filename: string; contentType: string }> = {
  gpx: { body: '<gpx version="1.1"/>', filename: 'Ridge walk.gpx', contentType: 'application/gpx+xml; charset=utf-8' },
  fit: { body: Buffer.from('.FIT'), filename: 'Ridge walk.fit', contentType: 'application/vnd.ant.fit' },
};

function makeController(getTourFile: PublicApiService['getTourFile']) {
  const rl = { check: vi.fn().mockResolvedValue(true) } as unknown as RateLimitService;
  return new PublicApiController({ getTourFile } as unknown as PublicApiService, rl);
}

/** The route for the format, as the router would call it. */
function route(controller: PublicApiController, format: Format) {
  return format === 'gpx' ? controller.getTourGpx.bind(controller) : controller.getTourFit.bind(controller);
}

const req = (scopes: readonly PublicApiScope[] = PUBLIC_API_SCOPES) =>
  ({ user: { id: 7 }, apiToken: { mode: 'limited', scopes: [...scopes] } }) as Request;

function makeRes() {
  const res = { setHeader: vi.fn(), send: vi.fn() };
  return { res, typed: res as unknown as Response };
}

async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: unknown }> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    const e = err as HttpException;
    return { status: e.getStatus(), body: e.getResponse() };
  }
  throw new Error('expected the handler to throw');
}

describe.each<Format>(['gpx', 'fit'])('PublicApiController GET /api/v1/trips/:id/tours/:tourRef/%s', (format) => {
  it('PUBAPI-TOURFILE-001: sends the export as a download, for the caller the guard resolved', async () => {
    const getTourFile = vi.fn().mockResolvedValue(FILES[format]);
    const { res, typed } = makeRes();
    await route(makeController(getTourFile), format)(req(), '12', '41', typed);
    expect(getTourFile).toHaveBeenCalledWith(12, 41, 7, format);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', FILES[format].contentType);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(new RegExp(`^attachment.*\\.${format}`)),
    );
    expect(res.send).toHaveBeenCalledWith(FILES[format].body);
  });

  it('PUBAPI-TOURFILE-002: a trip the caller may not read is the same 404 as for the trip itself', async () => {
    const { res, typed } = makeRes();
    const send = route(makeController(vi.fn().mockResolvedValue(null)), format);
    expect(await refusal(() => send(req(), '12', '41', typed))).toEqual({
      status: 404,
      body: { error: 'Trip not found' },
    });
    expect(res.send).not.toHaveBeenCalled();
  });

  it('PUBAPI-TOURFILE-003: a tour without a line is a 422 carrying tour_without_route', async () => {
    const noRoute = new DomainError(422, 'This tour has no route to export', { code: 'tour_without_route' });
    const send = route(makeController(vi.fn().mockRejectedValue(noRoute)), format);
    expect(await refusal(() => send(req(), '12', '41', makeRes().typed))).toEqual({
      status: 422,
      body: { error: 'This tour has no route to export', code: 'tour_without_route' },
    });
  });

  it('PUBAPI-TOURFILE-004: a tour the trip does not hold passes on as the export’s 404', async () => {
    const missing = new NotFoundException('Tour not found');
    const send = route(makeController(vi.fn().mockRejectedValue(missing)), format);
    await expect(send(req(), '12', '99', makeRes().typed)).rejects.toBe(missing);
  });

  it.each(['abc', '0', '4x', '-3'])(
    'PUBAPI-TOURFILE-005: refuses the tour reference %s before any read',
    async (ref) => {
      const getTourFile = vi.fn();
      const send = route(makeController(getTourFile), format);
      expect(await refusal(() => send(req(), '12', ref, makeRes().typed))).toEqual({
        status: 400,
        body: { error: 'Invalid tour reference' },
      });
      expect(getTourFile).not.toHaveBeenCalled();
    },
  );

  it('PUBAPI-TOURFILE-006: a malformed trip id is refused like on every other trip route', async () => {
    const getTourFile = vi.fn();
    const send = route(makeController(getTourFile), format);
    expect(await refusal(() => send(req(), '12abc', '41', makeRes().typed))).toEqual({
      status: 400,
      body: { error: 'Invalid trip id' },
    });
    expect(getTourFile).not.toHaveBeenCalled();
  });

  it.each<[PublicApiScope, PublicApiScope[]]>([
    ['places', ['trips', 'days']],
    ['trips', ['places']],
  ])('PUBAPI-TOURFILE-007: a key without %s is refused with a 403 naming it', async (missing, scopes) => {
    const getTourFile = vi.fn();
    const send = route(makeController(getTourFile), format);
    const { status, body } = await refusal(() => send(req(scopes), '12', '41', makeRes().typed));
    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'API_SCOPE_FORBIDDEN', required_scope: missing });
    expect(getTourFile).not.toHaveBeenCalled();
  });
});
