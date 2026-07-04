export const PWA_LIVE_ROUTE_STORAGE_KEY = "wanderer-pwa-live-route";

export interface PwaLiveRoute {
    trailId: string;
    path: string;
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
        const expectedPath = `/trail/edit/${value.trailId}`;
        if (
            typeof value.trailId !== "string" ||
            !value.trailId ||
            typeof value.path !== "string" ||
            (value.path !== expectedPath &&
                !value.path.startsWith(`${expectedPath}?`)) ||
            value.trailId === "new"
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

export function isCurrentPwaLiveRoute(
    route: PwaLiveRoute,
    currentUrl: Pick<URL, "pathname" | "search">,
): boolean {
    return route.path === `${currentUrl.pathname}${currentUrl.search}`;
}
