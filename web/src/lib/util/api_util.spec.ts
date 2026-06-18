import { describe, expect, it } from "vitest";
import { APIError, getAPIErrorDetailMessage } from "./api_util";

describe("getAPIErrorDetailMessage", () => {
    it("extracts nested Valhalla status messages", () => {
        const error = new APIError(400, {
            status_message: "No path could be found for input",
        } as unknown as string);

        expect(getAPIErrorDetailMessage(error)).toBe(
            "No path could be found for input",
        );
    });

    it("prefers API error detail over the generic message", () => {
        const error = new APIError(500, "Internal Server Error", {
            message: { status_message: "Elevation service unavailable" },
        });

        expect(getAPIErrorDetailMessage(error)).toBe(
            "Elevation service unavailable",
        );
    });
});
