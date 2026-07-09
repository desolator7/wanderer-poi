import { describe, expect, it } from "vitest";
import { WaypointCreateSchema } from "./waypoint_schema";

const validWaypoint = {
    lat: 47.123,
    lon: 11.456,
    author: "123456789012345",
};

describe("WaypointCreateSchema", () => {
    it("normalizes an empty connection mode to undefined", () => {
        const waypoint = WaypointCreateSchema.parse({
            ...validWaypoint,
            connectionMode: "",
        });

        expect(waypoint.connectionMode).toBeUndefined();
    });

    it.each(["snap", "straight", "original-kml"] as const)(
        "accepts the known connection mode %s",
        (connectionMode) => {
            const waypoint = WaypointCreateSchema.parse({
                ...validWaypoint,
                connectionMode,
            });

            expect(waypoint.connectionMode).toBe(connectionMode);
        },
    );

    it("rejects an unknown connection mode", () => {
        const result = WaypointCreateSchema.safeParse({
            ...validWaypoint,
            connectionMode: "teleport",
        });

        expect(result.success).toBe(false);
    });
});
