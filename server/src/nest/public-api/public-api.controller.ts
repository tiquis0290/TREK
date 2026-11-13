import { contentDisposition } from '../common/content-disposition';
import { DomainError } from '../common/domain-error';
import { RateLimitService } from '../common/rate-limit.service';
import { ApiTokenGuard } from './api-token.guard';
import {
  enforcePublicApiRateLimit,
  grantedScopes,
  narrowToGrant,
  requireScope,
  requireUserId,
} from './public-api-request';
import { PublicApiService } from './public-api.service';
import { Controller, Get, HttpException, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import {
  PUBLIC_API_INCLUDES,
  publicApiIncludeQuerySchema,
  type PublicApiBucketList,
  type PublicApiInclude,
  type PublicApiTrip,
  type PublicApiTripList,
} from '@trek/shared';

import type { Request, Response } from 'express';

/** The media type each tour file goes out as. */
const TOUR_FILE_TYPES = {
  gpx: 'application/gpx+xml; charset=utf-8',
  fit: 'application/vnd.ant.fit',
} as const;

/**
 * `/api/v1` — the versioned, read-only surface for third-party integrations.
 *
 * Everything else under `/api` is internal: it answers a session cookie, carries no
 * version, and is free to change with the client. This prefix is the opposite
 * promise, and the version in the path is what makes that promise keepable — a
 * breaking change ships as `/api/v2` rather than as an edit here.
 *
 * The surface is deliberately small. A few read endpoints are enough for the
 * integrations asking for one (a location tracker enriching its own trips, a watch
 * loading a hike as a course), and a small contract is one that can actually be
 * honoured. Write access is not a missing feature: it would need scope
 * enforcement this surface does not implement yet, and a token that reads
 * everything is a very different thing from one that can also delete a trip.
 *
 * Rate limited per caller rather than per IP — the budget lives in
 * `public-api-request.ts`, because the stats route enforces the same one from
 * `atlas/`.
 */
@Controller('api/v1')
@UseGuards(ApiTokenGuard)
export class PublicApiController {
  constructor(
    private readonly api: PublicApiService,
    private readonly rl: RateLimitService,
  ) {}

  private limit(req: Request): Promise<void> {
    return enforcePublicApiRateLimit(this.rl, req);
  }

  /** Every trip the token's owner can reach, without itineraries. */
  @Get('trips')
  async listTrips(@Req() req: Request): Promise<PublicApiTripList> {
    await this.limit(req);
    requireScope(req, 'trips');
    return { trips: await this.api.listTrips(requireUserId(req)) };
  }

  /**
   * The caller's bucket list: places they want to reach, with no trip attached.
   *
   * Its own endpoint rather than an `include`, because it hangs off the user and
   * not off any trip. For a consumer that knows where someone has actually been,
   * this is the one list in TREK it can answer questions about.
   */
  @Get('bucket-list')
  async listBucketList(@Req() req: Request): Promise<PublicApiBucketList> {
    await this.limit(req);
    requireScope(req, 'bucket-list');
    return { items: await this.api.listBucketList(requireUserId(req)) };
  }

  /**
   * One trip, with the sections named in `?include=`.
   *
   * A trip the caller may not read answers 404, identical to one that does not
   * exist. That is the point: a 403 would confirm the id is real, which turns the
   * endpoint into a way to count someone else's trips.
   */
  @Get('trips/:id')
  async getTrip(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('include') include?: string,
  ): Promise<PublicApiTrip> {
    await this.limit(req);
    requireScope(req, 'trips');
    const tripId = parseTripId(id);

    // A named section the key may not read is refused outright; an unnamed one —
    // `include` absent, which means "everything" — is simply narrowed. Silently
    // dropping a section somebody asked for by name is how an integrator ends
    // up debugging their own correct code.
    const asked = parseInclude(include);
    if (include !== undefined && include.trim() !== '') {
      for (const section of asked) requireScope(req, section);
    }
    const allowed = narrowToGrant(asked, req);

    // The grant goes in as well as the narrowed include: days are implied by any
    // section that hangs off them, and the implied block must still be measured
    // against what the key may read.
    const trip = await this.api.getTrip(tripId, requireUserId(req), allowed, grantedScopes(req));
    if (!trip) {
      throw new HttpException({ error: 'Trip not found' }, 404);
    }
    return trip;
  }

  /**
   * A tour's route as GPX, the file TREK's own export writes: the line with the
   * heights it has, and the trip's places along it as named waypoints.
   *
   * Reached through a place's `gpx_url` rather than built by the caller. Read
   * with the `places` scope, because a tour is a place, and the `trips` scope
   * every trip read needs. A trip the caller may not read answers 404 exactly
   * like `GET /trips/:id`, a tour the trip does not hold 404 as well, and a tour
   * with no line 422 with `code: tour_without_route`.
   *
   * response-contract-exempt: a file download written through @Res(), not a JSON body.
   */
  @Get('trips/:id/tours/:tourRef/gpx')
  async getTourGpx(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('tourRef') tourRef: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendTourFile(req, id, tourRef, res, 'gpx');
  }

  /**
   * The same route as a FIT course, the only form a Garmin watch takes a
   * downloaded course in: a Connect IQ app can store a course only by
   * downloading it, and the watch refuses a GPX download. Reached through a
   * place's `fit_url`, under every rule of the GPX route above.
   *
   * response-contract-exempt: a file download written through @Res(), not a JSON body.
   */
  @Get('trips/:id/tours/:tourRef/fit')
  async getTourFit(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('tourRef') tourRef: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendTourFile(req, id, tourRef, res, 'fit');
  }

  /** What both tour file routes do, so the two cannot drift apart in who may read what. */
  private async sendTourFile(
    req: Request,
    id: string,
    tourRef: string,
    res: Response,
    format: keyof typeof TOUR_FILE_TYPES,
  ): Promise<void> {
    await this.limit(req);
    requireScope(req, 'trips');
    requireScope(req, 'places');
    const tripId = parseTripId(id);
    const placeId = parsePositiveId(tourRef, 'Invalid tour reference');

    const file = await this.api.getTourFile(tripId, placeId, requireUserId(req), format).catch((err: unknown) => {
      throw publicTourFileError(err);
    });
    if (!file) {
      throw new HttpException({ error: 'Trip not found' }, 404);
    }
    res.setHeader('Content-Type', TOUR_FILE_TYPES[format]);
    res.setHeader('Content-Disposition', contentDisposition(file.filename, 'attachment'));
    res.send(file.body);
  }
}

/**
 * The export's refusal of a tour without a line, with the code an integration
 * can branch on. The export names it only for logs, because the app's own route
 * never sent one; this surface promises it, so it is spelled out here. Every
 * other error passes on as it is.
 */
function publicTourFileError(err: unknown): unknown {
  if (err instanceof DomainError && err.code === 'tour_without_route') {
    return new HttpException({ error: err.publicMessage, code: 'tour_without_route' }, 422);
  }
  return err;
}

/**
 * Trip ids are integers. Anything else is rejected before it reaches a query —
 * `parseInt` would happily turn "12abc" into 12, and a route that quietly accepts
 * a mangled id is a route whose logs stop matching reality.
 */
function parseTripId(raw: string): number {
  return parsePositiveId(raw, 'Invalid trip id');
}

/** A positive integer path segment, or a 400 with `error` as the message. */
function parsePositiveId(raw: string, error: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new HttpException({ error }, 400);
  }
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpException({ error }, 400);
  }
  return id;
}

/**
 * `?include=days,notes`. Absent means everything, because a full sync is the common
 * case and a caller that wants less says so.
 *
 * An unknown section is a 400 rather than being ignored: silently dropping a typo
 * would hand the caller a payload that is missing exactly what they asked for, and
 * they would debug their own code for it.
 *
 * `places`, `notes` and `reservations` are reported on days, so asking for one of
 * them brings `days` along; the service handles that rather than this parser, so
 * the echo of what the caller asked for stays honest.
 */
function parseInclude(raw?: string): PublicApiInclude[] {
  if (raw === undefined || raw.trim() === '') return [...PUBLIC_API_INCLUDES];
  const parsed = publicApiIncludeQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpException(
      { error: `include must be a comma-separated list of: ${PUBLIC_API_INCLUDES.join(', ')}` },
      400,
    );
  }
  return parsed.data;
}
