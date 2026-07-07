import { describe, expect, it } from "vitest";
import { SummitLogCreateSchema } from "./summit_log_schema";

const validSummitLog = {
    date: "2026-07-07",
    author: "123456789012345",
};

describe("SummitLogCreateSchema", () => {
    it("normalizes an empty external provider to undefined", () => {
        const summitLog = SummitLogCreateSchema.parse({
            ...validSummitLog,
            external_provider: "",
        });

        expect(summitLog.external_provider).toBeUndefined();
    });

    it.each(["strava", "komoot", "hammerhead"] as const)(
        "accepts the known external provider %s",
        (externalProvider) => {
            const summitLog = SummitLogCreateSchema.parse({
                ...validSummitLog,
                external_provider: externalProvider,
            });

            expect(summitLog.external_provider).toBe(externalProvider);
        },
    );

    it("rejects an unknown external provider", () => {
        const result = SummitLogCreateSchema.safeParse({
            ...validSummitLog,
            external_provider: "garmin",
        });

        expect(result.success).toBe(false);
    });
});
