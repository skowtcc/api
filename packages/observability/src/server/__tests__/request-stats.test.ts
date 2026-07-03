/*
 * per-request stats live in AsyncLocalStorage. the whole counter contract
 * rests on (a) bumps from inside an awaited callback propagating back to a
 * later read in the same async chain, and (b) parallel async chains not
 * bleeding into each other. Bun supports the full node:async_hooks API but
 * this is the regression test that proves it for our specific helpers
 */

import { describe, it, expect } from "bun:test";
import {
  beginRequestStats,
  endRequestStats,
  getRequestStats,
  bumpDbQueries,
  bumpFetchCalls,
  recordProcedure,
  recordUserId,
  recordErrorCode,
} from "../request-stats";

describe("request-stats", () => {
  it("bumps without an active store are silent no-ops", () => {
    // pre-condition: no beginRequestStats has been called in this async chain
    expect(getRequestStats()).toBeUndefined();
    // none of these should throw
    bumpDbQueries();
    bumpFetchCalls();
    recordProcedure("test.procedure");
    recordUserId("u_test");
    recordErrorCode("UNAUTHORIZED");
    expect(getRequestStats()).toBeUndefined();
  });

  it("beginRequestStats establishes a store visible to subsequent reads in the same chain", async () => {
    beginRequestStats();
    bumpDbQueries();
    bumpDbQueries();
    bumpFetchCalls();
    recordProcedure("asset.list");
    recordUserId("u_42");

    const stats = getRequestStats();
    expect(stats).toBeDefined();
    expect(stats!.dbQueries).toBe(2);
    expect(stats!.fetchCalls).toBe(1);
    expect(stats!.procedures).toEqual(["asset.list"]);
    expect(stats!.userId).toBe("u_42");
  });

  it("propagates the store across await boundaries", async () => {
    beginRequestStats();
    bumpDbQueries();
    await Promise.resolve();
    bumpDbQueries();
    await new Promise((r) => setTimeout(r, 0));
    bumpDbQueries();
    expect(getRequestStats()!.dbQueries).toBe(3);
  });

  it("recordErrorCode overwrites; recordProcedure appends", async () => {
    beginRequestStats();
    recordProcedure("first");
    recordProcedure("second");
    recordErrorCode("UNAUTHORIZED");
    recordErrorCode("FORBIDDEN");
    const stats = getRequestStats()!;
    expect(stats.procedures).toEqual(["first", "second"]);
    expect(stats.errorCode).toBe("FORBIDDEN");
  });

  it("endRequestStats clears the store; subsequent bumps no-op", async () => {
    beginRequestStats();
    bumpDbQueries();
    expect(getRequestStats()!.dbQueries).toBe(1);

    endRequestStats();
    expect(getRequestStats()).toBeUndefined();

    bumpDbQueries();
    bumpFetchCalls();
    recordProcedure("post.response.work");
    // the store is gone; bumps land nowhere
    expect(getRequestStats()).toBeUndefined();
  });

  it("parallel async chains do not bleed counters across stores", async () => {
    /*
     * each task starts its own ALS frame via Promise.all + an async IIFE per
     * task; bumps in task A must not appear in task B. if enterWith leaked
     * between tasks (Bun ALS regression), one of these assertions would fire
     */
    const results = await Promise.all([
      (async () => {
        beginRequestStats();
        bumpDbQueries();
        bumpDbQueries();
        recordProcedure("a.proc");
        await new Promise((r) => setTimeout(r, 5));
        return getRequestStats();
      })(),
      (async () => {
        beginRequestStats();
        bumpDbQueries();
        recordProcedure("b.proc");
        recordProcedure("b.proc.2");
        await new Promise((r) => setTimeout(r, 5));
        return getRequestStats();
      })(),
    ]);

    expect(results[0]!.dbQueries).toBe(2);
    expect(results[0]!.procedures).toEqual(["a.proc"]);
    expect(results[1]!.dbQueries).toBe(1);
    expect(results[1]!.procedures).toEqual(["b.proc", "b.proc.2"]);
  });
});
