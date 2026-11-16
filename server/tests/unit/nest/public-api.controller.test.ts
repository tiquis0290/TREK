/**
 * PublicApiController — request shaping for /api/v1.
 *
 * The controller owns three decisions and the tests below pin all three: how a
 * trip id is parsed, how `include` is validated, and what a caller is told about a
 * trip they may not read (nothing that distinguishes it from one that does not
 * exist).
 */
import type { RateLimitService } from '../../../src/nest/common/rate-limit.service';
import { PublicApiController } from '../../../src/nest/public-api/public-api.controller';
import type { PublicApiService } from '../../../src/nest/public-api/public-api.service';
import { HttpException } from '@nestjs/common';
import { PUBLIC_API_INCLUDES, PUBLIC_API_SCOPES, type PublicApiGrant } from '@trek/shared';

import type { Request, Response } from 'express';
import { describe, it, expect, vi } from 'vitest';

const TRIP = {
  id: 12,
  title: 'Toskana',
  description: null,
  start_date: '2026-06-14',
  end_date: '2026-06-22',
  currency: 'EUR',
  archived: false,
  updated_at: '2026-06-01 10:00:00',
};

const ITEM = {
  name: 'Hokkaido',
  lat: 43.06,
  lng: 141.35,
  country_code: 'JP',
  notes: null,
  target_date: null,
};

/** The limiter always allows unless a test says otherwise. */
function makeController(svc: Partial<PublicApiService>, allow = true) {
  const rl = { check: vi.fn().mockResolvedValue(allow) } as unknown as RateLimitService;
  return new PublicApiController(svc as PublicApiService, rl);
}

/**
 * The guard leaves two things behind (#2279): who is calling, and what their key
 * may read. Every request here carries the full grant, because these cases are
 * about shaping; the narrowed ones live in public-api-scopes.test.ts.
 */
const FULL_GRANT: PublicApiGrant = { mode: 'all', scopes: [...PUBLIC_API_SCOPES] };
const req = (userId = 7) => ({ user: { id: userId }, apiToken: FULL_GRANT }) as Request;
/** A request the guard left no user on — the shape the controller must refuse. */
const reqWithoutUser = () => ({ apiToken: FULL_GRANT }) as Request;

async function thrownAsync(fn: () => Promise<unknown>): Promise<{ status: number; body: unknown }> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    const e = err as HttpException;
    return { status: e.getStatus(), body: e.getResponse() };
  }
  throw new Error('expected the handler to throw');
}

describe('PublicApiController', () => {
  describe('GET /api/v1/bucket-list', () => {
    it('returns the caller’s wishlist and passes the id from the guard, never the query', async () => {
      const listBucketList = vi.fn().mockReturnValue([ITEM]);
      expect(await makeController({ listBucketList }).listBucketList(req(7))).toEqual({ items: [ITEM] });
      expect(listBucketList).toHaveBeenCalledWith(7);
    });

    it('401s when the guard left no user behind', async () => {
      const listBucketList = vi.fn();
      expect(await thrownAsync(() => makeController({ listBucketList }).listBucketList(reqWithoutUser()))).toEqual({
        status: 401,
        body: { error: 'API token required', code: 'API_TOKEN_REQUIRED' },
      });
      expect(listBucketList).not.toHaveBeenCalled();
    });

    it('counts against the same rate budget as everything else', async () => {
      const listBucketList = vi.fn();
      expect((await thrownAsync(() => makeController({ listBucketList }, false).listBucketList(req(7)))).status).toBe(
        429,
      );
      expect(listBucketList).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/trips', () => {
    it('returns the accessible trips for the token owner', async () => {
      const listTrips = vi.fn().mockReturnValue([TRIP]);
      expect(await makeController({ listTrips }).listTrips(req(7))).toEqual({ trips: [TRIP] });
      expect(listTrips).toHaveBeenCalledWith(7);
    });

    it('returns an empty list rather than 404 when the user has no trips', async () => {
      const listTrips = vi.fn().mockReturnValue([]);
      expect(await makeController({ listTrips }).listTrips(req(7))).toEqual({ trips: [] });
    });

    it('401s if the guard was somehow bypassed and no user is attached', async () => {
      const listTrips = vi.fn();
      expect(await thrownAsync(() => makeController({ listTrips }).listTrips(reqWithoutUser()))).toEqual({
        status: 401,
        body: { error: 'API token required', code: 'API_TOKEN_REQUIRED' },
      });
      expect(listTrips).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/trips/:id', () => {
    it('passes the parsed id and user through, and defaults include to every section', async () => {
      const getTrip = vi.fn().mockReturnValue(TRIP);
      const res = await makeController({ getTrip }).getTrip(req(7), '12', undefined);
      expect(res).toEqual(TRIP);
      expect(getTrip).toHaveBeenCalledWith(12, 7, [...PUBLIC_API_INCLUDES], expect.arrayContaining(['days']));
    });

    it('treats an empty include the same as an absent one', async () => {
      const getTrip = vi.fn().mockReturnValue(TRIP);
      await makeController({ getTrip }).getTrip(req(7), '12', '   ');
      expect(getTrip).toHaveBeenCalledWith(12, 7, [...PUBLIC_API_INCLUDES], expect.arrayContaining(['days']));
    });

    it('narrows to the requested sections and tolerates spacing', async () => {
      const getTrip = vi.fn().mockReturnValue(TRIP);
      await makeController({ getTrip }).getTrip(req(7), '12', 'days, notes');
      expect(getTrip).toHaveBeenCalledWith(12, 7, ['days', 'notes'], expect.arrayContaining(['days']));
    });

    /**
     * The one that matters: a trip belonging to someone else answers exactly like a
     * trip that was never created. Anything else turns the endpoint into a way to
     * count another user's trips.
     */
    it('404s for a trip the caller may not read, with no hint that it exists', async () => {
      const getTrip = vi.fn().mockReturnValue(null);
      expect(await thrownAsync(() => makeController({ getTrip }).getTrip(req(7), '999', undefined))).toEqual({
        status: 404,
        body: { error: 'Trip not found' },
      });
    });

    it.each([
      ['a non-numeric id', 'abc'],
      ['a numeric prefix', '12abc'],
      ['a negative id', '-1'],
      ['zero', '0'],
      ['a float', '1.5'],
      ['an empty id', ''],
      ['whitespace', ' 12 '],
      ['a sql fragment', '1 OR 1=1'],
      ['an id past the safe integer range', '9007199254740993'],
    ])('400s on %s without touching the service', async (_label, raw) => {
      const getTrip = vi.fn();
      expect((await thrownAsync(() => makeController({ getTrip }).getTrip(req(7), raw, undefined))).status).toBe(400);
      expect(getTrip).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown section', 'days,everything'],
      ['a typo', 'dayz'],
      ['only commas', ',,,'],
    ])('400s on %s rather than silently dropping it', async (_label, include) => {
      const getTrip = vi.fn();
      const res = await thrownAsync(() => makeController({ getTrip }).getTrip(req(7), '12', include));
      expect(res.status).toBe(400);
      expect(getTrip).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/trips/:id/tours/:placeId/gpx', () => {
    const fakeRes = () => ({ setHeader: vi.fn(), send: vi.fn() });

    it('sends the export as a GPX download, for the caller the guard resolved', async () => {
      const getTourGpx = vi.fn().mockResolvedValue({ gpx: '<gpx/>', filename: 'Ridge.gpx' });
      const res = fakeRes();
      await makeController({ getTourGpx }).getTourGpx(req(7), '12', '40', res as unknown as Response);
      expect(getTourGpx).toHaveBeenCalledWith(12, 40, 7);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/gpx+xml; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('Ridge.gpx'));
      expect(res.send).toHaveBeenCalledWith('<gpx/>');
    });

    it('404s a trip the caller may not read exactly like the trip route', async () => {
      const getTourGpx = vi.fn().mockResolvedValue(null);
      const res = fakeRes();
      expect(
        await thrownAsync(() =>
          makeController({ getTourGpx }).getTourGpx(req(7), '12', '40', res as unknown as Response),
        ),
      ).toEqual({ status: 404, body: { error: 'Trip not found' } });
      expect(res.send).not.toHaveBeenCalled();
    });

    it.each([
      ['a trip id', 'abc', '40', 'Invalid trip id'],
      ['a tour id', '12', '40x', 'Invalid tour id'],
      ['a zero tour id', '12', '0', 'Invalid tour id'],
      ['an unsafe tour id', '12', '99999999999999999999', 'Invalid tour id'],
    ])('400s on a malformed %s before reaching the service', async (_label, id, placeId, error) => {
      const getTourGpx = vi.fn();
      const ctl = makeController({ getTourGpx });
      expect(await thrownAsync(() => ctl.getTourGpx(req(7), id, placeId, fakeRes() as unknown as Response))).toEqual({
        status: 400,
        body: { error },
      });
      expect(getTourGpx).not.toHaveBeenCalled();
    });

    it('429s once the budget is spent, sharing the one bucket of the surface', async () => {
      const getTourGpx = vi.fn();
      const ctl = makeController({ getTourGpx }, false);
      expect(
        (await thrownAsync(() => ctl.getTourGpx(req(7), '12', '40', fakeRes() as unknown as Response))).status,
      ).toBe(429);
      expect(getTourGpx).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/trips/:id/tours/:placeId/fit', () => {
    const fakeRes = () => ({ setHeader: vi.fn(), send: vi.fn() });

    it('sends the export as a FIT download, for the caller the guard resolved', async () => {
      const fit = Buffer.from([14, 0x20]);
      const getTourFit = vi.fn().mockResolvedValue({ fit, filename: 'Ridge.fit' });
      const res = fakeRes();
      await makeController({ getTourFit }).getTourFit(req(7), '12', '40', res as unknown as Response);
      expect(getTourFit).toHaveBeenCalledWith(12, 40, 7);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.ant.fit');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('Ridge.fit'));
      expect(res.send).toHaveBeenCalledWith(fit);
    });

    it('404s a trip the caller may not read, 400s a malformed id and 429s a spent budget, as the GPX does', async () => {
      const getTourFit = vi.fn().mockResolvedValue(null);
      const res = fakeRes() as unknown as Response;
      expect(await thrownAsync(() => makeController({ getTourFit }).getTourFit(req(7), '12', '40', res))).toEqual({
        status: 404,
        body: { error: 'Trip not found' },
      });
      expect(await thrownAsync(() => makeController({ getTourFit }).getTourFit(req(7), '12', 'x', res))).toEqual({
        status: 400,
        body: { error: 'Invalid tour id' },
      });
      const spent = makeController({ getTourFit }, false);
      expect((await thrownAsync(() => spent.getTourFit(req(7), '12', '40', res))).status).toBe(429);
      expect(getTourFit).toHaveBeenCalledTimes(1);
    });
  });

  describe('rate limiting', () => {
    it('429s the list once the budget is spent, without reaching the service', async () => {
      const listTrips = vi.fn();
      const res = await thrownAsync(() => makeController({ listTrips }, false).listTrips(req(7)));
      expect(res).toEqual({ status: 429, body: { error: 'Too many requests. Please slow down.' } });
      expect(listTrips).not.toHaveBeenCalled();
    });

    it('429s the detail route the same way', async () => {
      const getTrip = vi.fn();
      expect(
        (await thrownAsync(() => makeController({ getTrip }, false).getTrip(req(7), '12', undefined))).status,
      ).toBe(429);
      expect(getTrip).not.toHaveBeenCalled();
    });
  });
});
