const ROUTE_IMPORT_SESSION_KEY = "wanderer:route-import";

export interface RouteImportSession {
    gpxData: string;
    name?: string;
    createdAt: number;
}

export function saveRouteImportSession(gpxData: string, name?: string) {
    if (typeof sessionStorage === "undefined") {
        return;
    }

    const payload: RouteImportSession = {
        gpxData,
        name,
        createdAt: Date.now(),
    };

    sessionStorage.setItem(ROUTE_IMPORT_SESSION_KEY, JSON.stringify(payload));
}

export function consumeRouteImportSession(): RouteImportSession | null {
    if (typeof sessionStorage === "undefined") {
        return null;
    }

    const raw = sessionStorage.getItem(ROUTE_IMPORT_SESSION_KEY);
    sessionStorage.removeItem(ROUTE_IMPORT_SESSION_KEY);

    if (!raw) {
        return null;
    }

    try {
        const payload = JSON.parse(raw) as RouteImportSession;
        if (!payload.gpxData) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}
