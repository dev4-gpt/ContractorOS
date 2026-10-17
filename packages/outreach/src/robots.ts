/** The robots.txt reader now lives in @reforge/core so every package that fetches the web shares it. */
export { ALLOW_ALL, DISALLOW_ALL, parseRobots } from '@reforge/core';
export type { RobotsRules } from '@reforge/core';
