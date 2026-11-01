/**
 * Contract every feature module implements (see frontend/src/modules/<name>/index.ts).
 *
 * main.ts calls the hooks in phases, in this order, for the module(s) whose `pages` include the
 * current `data-page`. All hooks are optional. A hook only runs on the module's own pages.
 *
 *  1. shortcuts  capture-phase click handlers that redirect (runs right after core navigation)
 *  2. forms      form wiring and restoring saved drafts
 *  3. setup      main page behaviour (header and account menu already rendered)
 *  4. controls   bind buttons with `bind()` so core's generic button fallback leaves them alone
 */
export interface FeatureModule {
  /** `data-page` slugs this module owns. */
  pages: string[];
  shortcuts?(page: string): void;
  forms?(page: string): void;
  setup?(page: string): void;
  controls?(page: string): void;
}

export function runPhase(modules: FeatureModule[], phase: Exclude<keyof FeatureModule, 'pages'>, page: string) {
  for (const module of modules) if (module.pages.includes(page)) module[phase]?.(page);
}
