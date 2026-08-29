<script lang="ts">
    import MapWithElevationMaplibre from "$lib/components/trail/map_with_elevation_maplibre.svelte";
    import GPX from "$lib/models/gpx/gpx";
    import { Trail } from "$lib/models/trail";
    import {
        DEFAULT_PWA_LIVE_ZOOM_PRESET,
        PWA_LIVE_ZOOM_LEVELS,
        PWA_START_PATH,
        clearPwaLiveRoute,
        readPwaLiveRoute,
        writePwaLiveRoute,
        type PwaLiveRoute,
        type PwaLiveZoomPreset,
    } from "$lib/util/pwa_live_mode";
    import {
        buildPwaLiveTilePlan,
        extractPwaLiveCoordinateSegments,
        getPwaLiveTileAvailableBytes,
        isPwaLiveTileWorkerMessage,
        type PwaLiveTileClientMessage,
        type PwaLiveTileStatus,
    } from "$lib/util/pwa_live_tiles";
    import * as M from "maplibre-gl";
    import { onMount } from "svelte";

    let liveRoute: PwaLiveRoute | null = $state(null);
    let liveTrail: Trail | null = $state(null);
    let liveZoomPreset: PwaLiveZoomPreset = $state(
        DEFAULT_PWA_LIVE_ZOOM_PRESET,
    );
    let online = $state(true);
    let liveMap: M.Map | null = $state(null);
    let tileStatus: PwaLiveTileStatus = $state("preparing");
    let tileDetail = $state("");
    let tileCompleted = $state(0);
    let tileTotal = $state(0);
    let tileIncludedZooms: number[] = $state([]);
    let liveGpx: GPX | null = null;

    const zoomPresets: Array<{
        value: PwaLiveZoomPreset;
        label: string;
    }> = [
        { value: "near", label: "Nah" },
        { value: "medium", label: "Mittel" },
        { value: "far", label: "Weit" },
    ];

    let liveTrackingZoom = $derived(
        PWA_LIVE_ZOOM_LEVELS[liveZoomPreset],
    );

    function scheduleLiveMapResize() {
        const map = liveMap;
        if (!map || typeof window === "undefined") {
            return;
        }

        window.requestAnimationFrame(() => {
            if (liveMap !== map) {
                return;
            }
            map.resize();
            window.requestAnimationFrame(() => {
                if (liveMap === map) {
                    map.resize();
                }
            });
        });
    }

    function handleLiveMapInit(map: M.Map) {
        liveMap = map;
        scheduleLiveMapResize();
    }

    $effect(() => {
        const map = liveMap;
        if (!map || typeof window === "undefined") {
            return;
        }

        const handleViewportChange = () => scheduleLiveMapResize();
        const viewport = window.visualViewport;
        const delayedResize = window.setTimeout(
            handleViewportChange,
            250,
        );

        window.addEventListener("resize", handleViewportChange);
        window.addEventListener("orientationchange", handleViewportChange);
        viewport?.addEventListener("resize", handleViewportChange);
        scheduleLiveMapResize();

        return () => {
            window.clearTimeout(delayedResize);
            window.removeEventListener("resize", handleViewportChange);
            window.removeEventListener(
                "orientationchange",
                handleViewportChange,
            );
            viewport?.removeEventListener("resize", handleViewportChange);
        };
    });

    function loadLiveRoute(): { route: PwaLiveRoute; gpx: GPX } | null {
        const storedRoute = readPwaLiveRoute();
        if (!storedRoute) {
            location.replace(PWA_START_PATH);
            return null;
        }

        let gpx: GPX;
        try {
            gpx = GPX.parse(storedRoute.trail.gpxData);
        } catch {
            clearPwaLiveRoute();
            location.replace(PWA_START_PATH);
            return null;
        }

        const trail = new Trail(storedRoute.trail.name, {
            id: storedRoute.trailId,
            gpx_data: storedRoute.trail.gpxData,
        });
        trail.expand!.gpx = gpx;
        liveRoute = storedRoute;
        liveZoomPreset = storedRoute.zoomPreset;
        liveTrail = trail;
        return { route: storedRoute, gpx };
    }

    async function getActiveServiceWorker(): Promise<ServiceWorker | null> {
        if (!("serviceWorker" in navigator)) {
            return null;
        }

        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
            return null;
        }
        return (
            navigator.serviceWorker.controller ??
            registration.active ??
            registration.waiting
        );
    }

    async function postTileMessage(
        message: PwaLiveTileClientMessage,
    ): Promise<boolean> {
        try {
            const worker = await getActiveServiceWorker();
            if (!worker) {
                return false;
            }
            worker.postMessage(message);
            return true;
        } catch {
            return false;
        }
    }

    async function prepareLiveTiles(
        route: PwaLiveRoute | null = liveRoute,
        gpx: GPX | null = liveGpx,
    ) {
        if (!route || !gpx) {
            return;
        }

        tileStatus = "preparing";
        tileDetail = "";
        const plan = buildPwaLiveTilePlan(
            route.trailId,
            route.offlineMap.routeFingerprint,
            extractPwaLiveCoordinateSegments(gpx),
        );
        tileTotal = plan.tileUrls.length;
        tileCompleted = 0;
        tileIncludedZooms = plan.includedZooms;

        const availableBytes = await getPwaLiveTileAvailableBytes(
            navigator.storage,
        );
        const posted = await postTileMessage({
            type: "PREPARE_PWA_LIVE_TILES",
            plan,
            availableBytes,
            downloadAllowed: navigator.onLine,
        });
        if (!posted) {
            tileStatus = "source-error";
            tileDetail =
                "Der Service Worker für die Offlinekarte ist nicht verfügbar.";
        }
    }

    function handleTileWorkerMessage(event: MessageEvent<unknown>) {
        if (!isPwaLiveTileWorkerMessage(event.data)) {
            return;
        }
        const state = event.data.state;
        if (
            state.routeFingerprint !==
            liveRoute?.offlineMap.routeFingerprint
        ) {
            return;
        }

        tileStatus = state.status;
        tileDetail = state.detail ?? "";
        tileCompleted = state.completedTiles;
        tileTotal = state.totalTiles;
        tileIncludedZooms = state.includedZooms;
    }

    async function cancelLiveTileDownload() {
        const routeFingerprint = liveRoute?.offlineMap.routeFingerprint;
        if (!routeFingerprint) {
            return;
        }
        await postTileMessage({
            type: "CANCEL_PWA_LIVE_TILES",
            routeFingerprint,
        });
    }

    function tileProgressPercent(): number {
        if (tileTotal <= 0) {
            return 0;
        }
        return Math.min(100, Math.round((tileCompleted / tileTotal) * 100));
    }

    function tileStatusLabel(): string {
        switch (tileStatus) {
            case "preparing":
                return "Offlinekarte wird vorbereitet";
            case "downloading":
                return `Offlinekarte wird geladen · ${tileProgressPercent()} %`;
            case "ready": {
                const zoomRange =
                    tileIncludedZooms.length > 0
                        ? ` · Zoom ${tileIncludedZooms[0]}–${tileIncludedZooms.at(-1)}`
                        : "";
                return `Offlinekarte bereit${zoomRange}`;
            }
            case "partial":
                return "Offlinekarte unvollständig";
            case "cancelled":
                return "Download abgebrochen";
            case "storage-error":
                return "Nicht genügend Speicher";
            case "rate-limited":
                return "OpenTopoMap begrenzt den Download";
            case "source-error":
                return "Offlinekarte nicht verfügbar";
            case "too-large":
                return "Route für Offlinekarte zu groß";
        }
    }

    function canRetryTileDownload(): boolean {
        return (
            online &&
            [
                "partial",
                "cancelled",
                "storage-error",
                "rate-limited",
                "source-error",
            ].includes(tileStatus)
        );
    }

    function selectZoomPreset(preset: PwaLiveZoomPreset) {
        if (!liveRoute) {
            return;
        }

        const updatedRoute: PwaLiveRoute = {
            ...liveRoute,
            zoomPreset: preset,
        };
        writePwaLiveRoute(updatedRoute);
        liveRoute = updatedRoute;
        liveZoomPreset = preset;
    }

    function exitLiveMode() {
        const sourcePath = liveRoute?.sourcePath ?? "/";
        clearPwaLiveRoute();
        location.replace(navigator.onLine ? sourcePath : PWA_START_PATH);
    }

    onMount(() => {
        document.documentElement.classList.add("live-mode-document");
        document.body.classList.add("live-mode-document");

        const updateConnectionState = () => {
            online = navigator.onLine;
        };

        updateConnectionState();
        window.addEventListener("online", updateConnectionState);
        window.addEventListener("offline", updateConnectionState);
        navigator.serviceWorker?.addEventListener(
            "message",
            handleTileWorkerMessage,
        );
        const loadedRoute = loadLiveRoute();
        if (loadedRoute) {
            liveGpx = loadedRoute.gpx;
            void prepareLiveTiles(loadedRoute.route, loadedRoute.gpx);
        }

        return () => {
            liveMap = null;
            document.documentElement.classList.remove("live-mode-document");
            document.body.classList.remove("live-mode-document");
            window.removeEventListener("online", updateConnectionState);
            window.removeEventListener("offline", updateConnectionState);
            navigator.serviceWorker?.removeEventListener(
                "message",
                handleTileWorkerMessage,
            );
        };
    });
</script>

<svelte:head>
    <title>Livemodus | wanderer</title>
</svelte:head>

<main class="live-shell">
    {#if liveRoute && liveTrail}
        <div class="live-map" aria-label="Karte der aktiven Route">
            <MapWithElevationMaplibre
                trails={[liveTrail]}
                displayWaypoints={false}
                showElevation={false}
                showStyleSwitcher={false}
                showTerrain={false}
                fitBounds="instant"
                activeTrail={0}
                liveTrackUserLocation={true}
                {liveTrackingZoom}
                offlineMode={true}
                bind:map={liveMap}
                oninit={handleLiveMapInit}
            ></MapWithElevationMaplibre>
        </div>

        <header class="live-header">
            <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
                    Livemodus
                </p>
                <h1 class="truncate text-base font-semibold">
                    {liveRoute.trail.name}
                </h1>
            </div>
            <button
                type="button"
                class="btn-secondary shrink-0"
                aria-label="Livemodus beenden"
                title="Livemodus beenden"
                onclick={exitLiveMode}
            >
                <i class="fa fa-xmark mr-2"></i>Beenden
            </button>
        </header>

        <div class="live-statuses">
            {#if !online}
                <div class="live-status-badge offline-badge" role="status">
                    <i class="fa fa-cloud-arrow-down mr-2"></i>Offline
                </div>
            {/if}

            <div
                class="live-status-badge tile-status-badge"
                class:tile-status-error={[
                    "storage-error",
                    "rate-limited",
                    "source-error",
                    "too-large",
                ].includes(tileStatus)}
                role="status"
                aria-live="polite"
                title={tileDetail || tileStatusLabel()}
            >
                <span>{tileStatusLabel()}</span>
                {#if tileStatus === "downloading"}
                    <button
                        type="button"
                        class="tile-status-action"
                        onclick={cancelLiveTileDownload}
                    >
                        Download abbrechen
                    </button>
                {:else if canRetryTileDownload()}
                    <button
                        type="button"
                        class="tile-status-action"
                        onclick={() => prepareLiveTiles()}
                    >
                        Erneut versuchen
                    </button>
                {/if}
            </div>
        </div>

        <div
            class="zoom-presets rounded-full border border-input-border bg-menu-background/90 p-1 shadow-lg backdrop-blur"
            role="group"
            aria-label="Zoomstufe im Livemodus"
        >
            {#each zoomPresets as preset}
                <button
                    type="button"
                    class="min-h-11 min-w-16 rounded-full px-3 text-sm font-semibold transition-colors"
                    class:bg-primary={liveZoomPreset === preset.value}
                    class:text-white={liveZoomPreset === preset.value}
                    aria-pressed={liveZoomPreset === preset.value}
                    onclick={() => selectZoomPreset(preset.value)}
                >
                    {preset.label}
                </button>
            {/each}
        </div>
    {:else}
        <div class="grid h-full place-items-center p-8 text-center">
            <p>Die lokale Route wird geladen.</p>
        </div>
    {/if}
</main>

<style>
    .live-shell {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 9999;
        display: flex;
        min-height: 0;
        flex-direction: column;
        overflow: hidden;
        background: rgb(var(--background));
    }

    :global(html.live-mode-document),
    :global(html.live-mode-document body) {
        width: 100%;
        height: 100%;
        min-height: 100%;
        overflow: hidden;
    }

    .live-map {
        min-height: 0;
        flex: 1 1 0;
    }

    .live-map :global(.map-shell) {
        height: 100%;
    }

    .live-header {
        position: absolute;
        z-index: 60;
        top: max(0.75rem, env(safe-area-inset-top));
        left: 0.75rem;
        right: 0.75rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        border: 1px solid rgb(var(--input-border));
        border-radius: 0.75rem;
        padding: 0.5rem 0.75rem;
        background: rgb(var(--menu-background) / 0.9);
        box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
        backdrop-filter: blur(10px);
    }

    .live-statuses {
        position: absolute;
        z-index: 60;
        top: calc(max(0.75rem, env(safe-area-inset-top)) + 4.75rem);
        left: 50%;
        display: flex;
        width: min(32rem, calc(100% - 1.5rem));
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        transform: translateX(-50%);
        pointer-events: none;
    }

    .live-status-badge {
        display: flex;
        max-width: 100%;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 0.65rem;
        border-radius: 9999px;
        padding: 0.4rem 0.8rem;
        color: white;
        background: rgb(31 41 55 / 0.88);
        font-size: 0.875rem;
        font-weight: 600;
        text-align: center;
        pointer-events: auto;
    }

    .tile-status-badge {
        background: rgb(22 101 52 / 0.9);
    }

    .tile-status-error {
        background: rgb(153 27 27 / 0.92);
    }

    .tile-status-action {
        min-height: 2rem;
        flex: 0 0 auto;
        border: 1px solid rgb(255 255 255 / 0.55);
        border-radius: 9999px;
        padding: 0.2rem 0.65rem;
        color: white;
        background: rgb(255 255 255 / 0.14);
        font: inherit;
        white-space: nowrap;
    }

    .zoom-presets {
        position: absolute;
        z-index: 60;
        bottom: calc(1rem + env(safe-area-inset-bottom));
        left: 50%;
        display: flex;
        gap: 0.25rem;
        transform: translateX(-50%);
    }
</style>
