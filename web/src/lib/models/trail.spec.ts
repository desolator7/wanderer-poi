import { describe, expect, it } from "vitest";
import type { SummitLog } from "./summit_log";
import { isTrailPlanned, type Trail } from "./trail";

function createTrail(overrides: Partial<Trail>): Trail {
    return {
        author: "actor",
        like_count: 0,
        name: "Trail",
        photos: [],
        public: false,
        tags: [],
        ...overrides,
    };
}

describe("isTrailPlanned", () => {
    it("treats an empty summit book as a planned trail", () => {
        expect(
            isTrailPlanned(createTrail({
                expand: { summit_logs_via_trail: [] },
            })),
        ).toBe(true);
    });

    it("uses completed as a fallback when summit logs are not loaded", () => {
        expect(
            isTrailPlanned(createTrail({
                completed: false,
            })),
        ).toBe(true);
    });

    it("does not mark trails with summit logs as planned", () => {
        expect(
            isTrailPlanned(createTrail({
                completed: false,
                external_provider: "komoot",
                expand: { summit_logs_via_trail: [{} as SummitLog] },
            })),
        ).toBe(false);
    });

    it("lets loaded summit logs win over stale completed values", () => {
        expect(
            isTrailPlanned(createTrail({
                completed: false,
                expand: { summit_logs_via_trail: [{} as SummitLog] },
            })),
        ).toBe(false);

        expect(
            isTrailPlanned(createTrail({
                completed: true,
                expand: { summit_logs_via_trail: [] },
            })),
        ).toBe(true);
    });
});
