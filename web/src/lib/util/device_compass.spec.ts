import { describe, expect, it } from "vitest";
import {
    readCompassHeading,
    shouldAcceptCompassSource,
    unwrapCompassHeading,
} from "./device_compass";

describe("device compass", () => {
    it("reads and normalizes valid WebKit headings", () => {
        expect(
            readCompassHeading({
                type: "deviceorientation",
                absolute: false,
                alpha: null,
                webkitCompassHeading: 360,
                webkitCompassAccuracy: 5,
            }),
        ).toEqual({ heading: 0, source: "webkit" });
    });

    it.each([
        { webkitCompassHeading: -1, webkitCompassAccuracy: 5 },
        { webkitCompassHeading: 120, webkitCompassAccuracy: -1 },
        { webkitCompassHeading: Number.NaN, webkitCompassAccuracy: 5 },
    ])("rejects invalid WebKit readings: %o", (reading) => {
        expect(
            readCompassHeading({
                type: "deviceorientation",
                absolute: true,
                alpha: 0,
                ...reading,
            }),
        ).toBeNull();
    });

    it("converts absolute alpha values to compass headings", () => {
        expect(
            readCompassHeading({
                type: "deviceorientationabsolute",
                absolute: true,
                alpha: 90,
            }),
        ).toEqual({
            heading: 270,
            source: "deviceorientationabsolute",
        });
        expect(
            readCompassHeading({
                type: "deviceorientation",
                absolute: false,
                alpha: 90,
            }),
        ).toBeNull();
    });

    it("keeps the best available event source active", () => {
        expect(shouldAcceptCompassSource(null, "deviceorientation")).toBe(
            true,
        );
        expect(
            shouldAcceptCompassSource(
                "deviceorientation",
                "deviceorientationabsolute",
            ),
        ).toBe(true);
        expect(
            shouldAcceptCompassSource(
                "deviceorientationabsolute",
                "deviceorientation",
            ),
        ).toBe(false);
        expect(
            shouldAcceptCompassSource("deviceorientationabsolute", "webkit"),
        ).toBe(true);
        expect(
            shouldAcceptCompassSource("webkit", "deviceorientationabsolute"),
        ).toBe(false);
        expect(shouldAcceptCompassSource("webkit", "webkit")).toBe(true);
    });

    it("unwraps north crossings without nearly full rotations", () => {
        expect(unwrapCompassHeading(359, 1)).toBe(361);
        expect(unwrapCompassHeading(1, 359)).toBe(-1);
        expect(unwrapCompassHeading(725, 10)).toBe(730);
    });
});
