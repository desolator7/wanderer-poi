export const PWA_LIVE_ROUTE_STORAGE_KEY = "wanderer-pwa-live-route";
export const PWA_LIVE_ROUTE_VERSION = 1;
export const PWA_LIVE_PATH = "/live";
export const PWA_LIVE_DATA_PATH = "/live/__data.json";
export const PWA_START_PATH = "/pwa-start.html";

export const PWA_LIVE_ZOOM_LEVELS = {
    near: 18,
    medium: 16,
    far: 15,
} as const;

export type PwaLiveZoomPreset = keyof typeof PWA_LIVE_ZOOM_LEVELS;

export const DEFAULT_PWA_LIVE_ZOOM_PRESET: PwaLiveZoomPreset = "medium";

export interface PwaLiveRoute {
    version: typeof PWA_LIVE_ROUTE_VERSION;
    trailId: string;
    sourcePath: string;
    zoomPreset: PwaLiveZoomPreset;
    trail: {
        name: string;
        gpxData: string;
    };
}

interface StandaloneNavigator extends Navigator {
    standalone?: boolean;
}

export function isStandalonePwa(
    targetWindow: Pick<Window, "matchMedia" | "navigator"> = window,
): boolean {
    return (
        targetWindow.matchMedia("(display-mode: standalone)").matches ||
        Boolean((targetWindow.navigator as StandaloneNavigator).standalone)
    );
}

export function readPwaLiveRoute(
    storage: Pick<Storage, "getItem" | "removeItem"> = localStorage,
): PwaLiveRoute | null {
    const raw = storage.getItem(PWA_LIVE_ROUTE_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const value = JSON.parse(raw) as Partial<PwaLiveRoute>;
        const expectedSourcePath = `/trail/edit/${value.trailId}`;
        if (
            value.version !== PWA_LIVE_ROUTE_VERSION ||
            typeof value.trailId !== "string" ||
            !value.trailId ||
            value.trailId === "new" ||
            typeof value.sourcePath !== "string" ||
            (value.sourcePath !== expectedSourcePath &&
                !value.sourcePath.startsWith(`${expectedSourcePath}?`)) ||
            !Object.hasOwn(PWA_LIVE_ZOOM_LEVELS, value.zoomPreset ?? "") ||
            typeof value.trail !== "object" ||
            value.trail === null ||
            typeof value.trail.name !== "string" ||
            typeof value.trail.gpxData !== "string" ||
            !value.trail.gpxData.trim()
        ) {
            throw new Error("Invalid PWA live route");
        }

        return value as PwaLiveRoute;
    } catch {
        storage.removeItem(PWA_LIVE_ROUTE_STORAGE_KEY);
        return null;
    }
}

export function writePwaLiveRoute(
    route: PwaLiveRoute,
    storage: Pick<Storage, "setItem"> = localStorage,
): void {
    storage.setItem(PWA_LIVE_ROUTE_STORAGE_KEY, JSON.stringify(route));
}

export function clearPwaLiveRoute(
    storage: Pick<Storage, "removeItem"> = localStorage,
): void {
    storage.removeItem(PWA_LIVE_ROUTE_STORAGE_KEY);
}

export async function cachePwaLiveShell(
    targetFetch: typeof fetch = fetch,
): Promise<boolean> {
    try {
        const [shellResponse, dataResponse] = await Promise.all([
            targetFetch(PWA_LIVE_PATH, {
                cache: "reload",
                credentials: "same-origin",
                headers: { accept: "text/html" },
            }),
            targetFetch(PWA_LIVE_DATA_PATH, {
                cache: "reload",
                credentials: "same-origin",
                headers: { accept: "application/json" },
            }),
        ]);
        return shellResponse.ok && dataResponse.ok;
    } catch {
        return false;
    }
}
