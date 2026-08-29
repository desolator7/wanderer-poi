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
    import { onMount } from "svelte";

    let liveRoute: PwaLiveRoute | null = $state(null);
    let liveTrail: Trail | null = $state(null);
    let liveZoomPreset: PwaLiveZoomPreset = $state(
        DEFAULT_PWA_LIVE_ZOOM_PRESET,
    );
    let online = $state(true);
    let offlineMapMode = $state(false);

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

    function loadLiveRoute() {
        const storedRoute = readPwaLiveRoute();
        if (!storedRoute) {
            location.replace(PWA_START_PATH);
            return;
        }

        let gpx: GPX;
        try {
            gpx = GPX.parse(storedRoute.trail.gpxData);
        } catch {
            clearPwaLiveRoute();
            location.replace(PWA_START_PATH);
            return;
        }

        const trail = new Trail(storedRoute.trail.name, {
            id: storedRoute.trailId,
            gpx_data: storedRoute.trail.gpxData,
        });
        trail.expand!.gpx = gpx;
        liveRoute = storedRoute;
        liveZoomPreset = storedRoute.zoomPreset;
        liveTrail = trail;
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
        const updateConnectionState = () => {
            online = navigator.onLine;
        };

        updateConnectionState();
        offlineMapMode = !navigator.onLine;
        window.addEventListener("online", updateConnectionState);
        window.addEventListener("offline", updateConnectionState);
        loadLiveRoute();

        return () => {
            window.removeEventListener("online", updateConnectionState);
            window.removeEventListener("offline", updateConnectionState);
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
                showStyleSwitcher={!offlineMapMode}
                showTerrain={!offlineMapMode}
                fitBounds="instant"
                activeTrail={0}
                liveTrackUserLocation={true}
                {liveTrackingZoom}
                offlineMode={offlineMapMode}
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

        {#if !online}
            <div class="offline-badge" role="status">
                <i class="fa fa-cloud-arrow-down mr-2"></i>Offline
            </div>
        {/if}

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
        z-index: 9999;
        display: flex;
        min-height: 0;
        flex-direction: column;
        overflow: hidden;
        background: rgb(var(--background));
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

    .offline-badge {
        position: absolute;
        z-index: 60;
        top: calc(max(0.75rem, env(safe-area-inset-top)) + 4.75rem);
        left: 50%;
        transform: translateX(-50%);
        border-radius: 9999px;
        padding: 0.4rem 0.8rem;
        color: white;
        background: rgb(31 41 55 / 0.88);
        font-size: 0.875rem;
        font-weight: 600;
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
