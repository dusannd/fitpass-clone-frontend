// Adds toBeInTheDocument, toBeDisabled and the rest to Vitest's expect.
// The /vitest entry point is the one that augments Vitest's Assertion type - the
// package root augments Jest's instead, and would leave the matchers untyped here.
import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Testing Library only registers its own cleanup when `afterEach` is a global, and we
// deliberately run without Vitest globals. Without this line every render inside a
// file stacks up in the same document and getByText starts finding duplicates.
afterEach(() => {
    cleanup();
});
