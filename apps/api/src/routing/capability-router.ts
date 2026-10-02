import { Hono } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';

/**
 * A capability sub-router: capabilities register relative action paths on it
 * and the domain root mounts the router onto its stable URL prefix, so route
 * files stay small and prefixes are declared exactly once.
 */
export type ImsCapabilityRouter = ImsHonoApp;

export function createCapabilityRouter(): ImsCapabilityRouter {
    return new Hono<AppEnvironment>();
}
