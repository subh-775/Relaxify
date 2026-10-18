import type {ArtistCount, Recap} from '../../../recap';

/** What every card is built from. */
export type CardContext = {
  r: Recap;
  week: boolean;
  /** When the Recap was built: the week's dates are counted back from it. */
  now: number;
  /** An artist's real photo when one is known, else the cover the stats kept. */
  face: (a: ArtistCount) => string | undefined;
};
