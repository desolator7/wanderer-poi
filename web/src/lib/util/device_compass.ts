export type CompassHeadingSource =
    | "deviceorientation"
    | "deviceorientationabsolute"
    | "webkit";

export interface DeviceCompassOrientation {
    type: string;
    absolute: boolean;
    alpha: number | null;
    webkitCompassHeading?: number | null;
    webkitCompassAccuracy?: number | null;
}

export interface CompassHeadingReading {
    heading: number;
    source: CompassHeadingSource;
}

const COMPASS_SOURCE_PRIORITY: Record<CompassHeadingSource, number> = {
    deviceorientation: 0,
    deviceorientationabsolute: 1,
    webkit: 2,
};

function normalizeHeading(heading: number): number {
    return ((heading % 360) + 360) % 360;
}

export function readCompassHeading(
    orientation: DeviceCompassOrientation,
): CompassHeadingReading | null {
    if (typeof orientation.webkitCompassHeading === "number") {
        const accuracy = orientation.webkitCompassAccuracy;
        if (
            !Number.isFinite(orientation.webkitCompassHeading) ||
            orientation.webkitCompassHeading < 0 ||
            (typeof accuracy === "number" &&
                (!Number.isFinite(accuracy) || accuracy < 0))
        ) {
            return null;
        }

        return {
            heading: normalizeHeading(orientation.webkitCompassHeading),
            source: "webkit",
        };
    }

    if (
        !orientation.absolute ||
        typeof orientation.alpha !== "number" ||
        !Number.isFinite(orientation.alpha)
    ) {
        return null;
    }

    return {
        heading: normalizeHeading(360 - orientation.alpha),
        source:
            orientation.type === "deviceorientationabsolute"
                ? "deviceorientationabsolute"
                : "deviceorientation",
    };
}

export function shouldAcceptCompassSource(
    currentSource: CompassHeadingSource | null,
    nextSource: CompassHeadingSource,
): boolean {
    return (
        currentSource === null ||
        COMPASS_SOURCE_PRIORITY[nextSource] >=
            COMPASS_SOURCE_PRIORITY[currentSource]
    );
}

export function unwrapCompassHeading(
    previousHeading: number | null,
    nextHeading: number,
): number {
    const normalizedNextHeading = normalizeHeading(nextHeading);
    if (previousHeading === null) {
        return normalizedNextHeading;
    }

    const normalizedPreviousHeading = normalizeHeading(previousHeading);
    let delta = normalizedNextHeading - normalizedPreviousHeading;
    if (delta > 180) {
        delta -= 360;
    } else if (delta < -180) {
        delta += 360;
    }

    return previousHeading + delta;
}
