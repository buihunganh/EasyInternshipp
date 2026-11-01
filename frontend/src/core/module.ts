/**
 * Contract every feature module implements (see frontend/src/modules/<name>/index.ts).
 *
 * main.ts calls the hooks in phases, in this order, for the module(s) whose `pages` include the
 * current `data-page`. All hooks are optional and may be async (main.ts awaits them in order).
 *
 *  1. shortcuts  capture-phase click handlers that redirect (runs right after core navigation)
 *  2. forms      form wiring and restoring saved drafts
 *  3. setup      main page behaviour, data loading (header and account menu already rendered)
 *  4. controls   bind buttons with `bind()` so core's generic button fallback leaves them alone
 */
type Hook = (page: string) => void | Promise<void>;

export interface FeatureModule {
  /** `data-page` slugs this module owns. */
  pages: string[];
  shortcuts?: Hook;
  forms?: Hook;
  setup?: Hook;
  controls?: Hook;
}

export async function runPhase(modules: FeatureModule[], phase: Exclude<keyof FeatureModule, 'pages'>, page: string) {
  for (const module of modules) {
    if (!module.pages.includes(page)) continue;
    try {
      await module[phase]?.(page);
    } catch (error) {
      console.error(`[${phase}] ${page}:`, error);
    }
  }
}
