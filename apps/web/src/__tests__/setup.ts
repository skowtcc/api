/* preload step 2: register afterEach(cleanup) so every rendered tree gets
   unmounted between tests. ordering matters: setup-globals.ts must run first
   (it's listed before this file in bunfig.toml's preload) so the @testing-
   library/dom module sees a real `document` when it evaluates */

import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
