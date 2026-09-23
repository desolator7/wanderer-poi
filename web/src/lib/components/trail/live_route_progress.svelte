<script lang="ts">
    import { onMount } from "svelte";
    import {
        buildLiveElevationPlot,
        formatLiveKilometers,
        formatLiveRemainingTime,
        type LiveProgressState,
        type LiveRouteModel,
        type LivePositionStatus,
    } from "$lib/util/pwa_live_progress";

    interface Props {
        name: string;
        route: LiveRouteModel;
        state: LiveProgressState;
        onexit: () => void;
    }

    let { name, route, state: progressState, onexit }: Props = $props();
    let viewport: HTMLDivElement;
    let activePage = $state(0);
    const pages = ["Kennzahlen", "Höhenprofil"];
    const statusLabels: Record<LivePositionStatus, string> = {
        waiting: "Position wird ermittelt …",
        "on-route": "Auf der Route",
        "off-route": "Außerhalb der Route",
        inaccurate: "GPS-Signal zu ungenau",
        stale: "Kein aktuelles GPS-Signal",
        unavailable: "Standort nicht verfügbar",
        denied: "Standortfreigabe erforderlich",
        "invalid-route": "Keine auswertbare Route",
    };
    const plot = $derived(buildLiveElevationPlot(route));
    const progress = $derived(progressState.progress);
    const outdated = $derived(progress !== null && progressState.status !== "on-route");

    function selectPage(index: number) {
        activePage = Math.max(0, Math.min(pages.length - 1, index));
        viewport.scrollTo({
            left: activePage * viewport.clientWidth,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        });
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            selectPage(activePage + (event.key === "ArrowLeft" ? -1 : 1));
            const button = event.currentTarget as HTMLButtonElement;
            (button.parentElement?.children[activePage] as HTMLButtonElement | undefined)?.focus();
        }
    }

    onMount(() => {
        const observer = new ResizeObserver(() => {
            viewport.scrollTo({ left: activePage * viewport.clientWidth, behavior: "instant" });
        });
        observer.observe(viewport);
        return () => observer.disconnect();
    });
</script>

<header class="progress-panel" aria-label="Routenfortschritt">
    <div class="title-row">
        <h1 title={name}>{name}</h1>
        <button type="button" class="exit-button" aria-label="Livemodus beenden" title="Livemodus beenden" onclick={onexit}>
            <i class="fa fa-xmark" aria-hidden="true"></i>
        </button>
    </div>
    <div
        class="pages"
        bind:this={viewport}
        role="region"
        aria-label="Routeninformationen, mit links und rechts wechseln"
        onscroll={() => {
            if (viewport.clientWidth) activePage = Math.round(viewport.scrollLeft / viewport.clientWidth);
        }}
    >
        <section class="slide metrics" aria-label="Kennzahlen" aria-hidden={activePage !== 0}>
            <dl>
                <div>
                    <dt>Restzeit</dt>
                    <dd>{progress?.remainingSeconds != null ? formatLiveRemainingTime(progress.remainingSeconds) : "—"}</dd>
                    {#if route.durationSeconds === null}<small>Keine Zeitplanung</small>{/if}
                </div>
                <div>
                    <dt>Reststrecke</dt>
                    <dd>{progress ? formatLiveKilometers(progress.remainingMeters) : "—"}</dd>
                </div>
                <div>
                    <dt>Zurückgelegt</dt>
                    <dd>{progress ? formatLiveKilometers(progress.completedMeters) : "—"}</dd>
                </div>
            </dl>
        </section>
        <section class="slide elevation" aria-label="Höhenprofil" aria-hidden={activePage !== 1}>
            {#if plot}
                <div class="profile-caption">
                    <span>Höhenprofil</span>
                    <span>{Math.round(plot.minimum)}–{Math.round(plot.maximum)} m</span>
                </div>
                <svg viewBox="0 0 300 64" preserveAspectRatio="none" role="img" aria-label={progress
                    ? `Höhenprofil, ${outdated ? "letzter Stand" : "aktuelle Position"} bei ${formatLiveKilometers(progress.completedMeters)}`
                    : "Höhenprofil der gesamten Route, Position noch unbekannt"}>
                    {#each plot.paths as path}
                        <path d={path} class="profile-line" />
                    {/each}
                    {#if progress}
                        <line class="position-line" class:outdated x1={plot.x(progress.completedMeters)} x2={plot.x(progress.completedMeters)} y1="1" y2="63" />
                        {#if progress.elevationMeters !== null}
                            <circle class="position-dot" class:outdated cx={plot.x(progress.completedMeters)} cy={plot.y(progress.elevationMeters)} r="3.5" />
                        {/if}
                    {/if}
                </svg>
                <div class="profile-caption distance-axis"><span>0 km</span><span>{formatLiveKilometers(route.totalMeters)}</span></div>
            {:else}
                <p class="empty-profile">Keine Höhendaten verfügbar</p>
            {/if}
        </section>
    </div>
    <div class="panel-footer">
        <p class="position-status" class:outdated role="status">
            {statusLabels[progressState.status]}{outdated ? " · Letzter Stand" : ""}
        </p>
        <div class="page-indicators" role="group" aria-label="Anzeigeseite">
            {#each pages as label, index}
                <button type="button" class:active={activePage === index} aria-label={label} aria-pressed={activePage === index} onclick={() => selectPage(index)} onkeydown={handleKeydown}><span></span></button>
            {/each}
        </div>
    </div>
</header>

<style>
    .progress-panel {
        min-width: 0;
        overflow: hidden;
        border: 1px solid rgb(var(--input-border));
        border-radius: 0.75rem;
        background: rgba(var(--menu-background), 0.94);
        box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
        backdrop-filter: blur(10px);
        pointer-events: auto;
    }
    .title-row { display: flex; align-items: center; padding-left: 0.75rem; }
    h1 { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 0.875rem; font-weight: 600; }
    .exit-button { width: 44px; height: 44px; flex-shrink: 0; font-size: 1.125rem; }
    .exit-button:hover { background: rgba(var(--input-border), 0.3); }
    .pages { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; scrollbar-width: none; }
    .pages::-webkit-scrollbar { display: none; }
    .slide { flex: 0 0 100%; min-width: 0; height: 76px; scroll-snap-align: start; scroll-snap-stop: always; padding: 0 0.75rem; box-sizing: border-box; }
    .metrics { display: flex; align-items: center; }
    dl { display: grid; grid-template-columns: 1.2fr 1fr 1fr; width: 100%; gap: 0.25rem; }
    dt { font-size: 0.65rem; opacity: 0.7; }
    dd { margin: 0.25rem 0 0; font-size: clamp(0.8rem, 3.4vw, 1.125rem); font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
    small { display: block; font-size: 0.6rem; line-height: 1.2; opacity: 0.7; }
    .profile-caption { display: flex; justify-content: space-between; font-size: 0.625rem; line-height: 12px; opacity: 0.75; }
    svg { display: block; width: 100%; height: 52px; overflow: visible; }
    .profile-line { fill: none; stroke: currentColor; opacity: 0.7; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
    .position-line { stroke: currentColor; stroke-width: 1; stroke-dasharray: 3 2; vector-effect: non-scaling-stroke; }
    .position-dot { fill: currentColor; stroke: rgb(var(--menu-background)); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    .empty-profile { display: grid; place-items: center; height: 100%; font-size: 0.75rem; opacity: 0.7; }
    .panel-footer { display: flex; align-items: center; gap: 0.25rem; min-height: 30px; padding: 0 0.5rem 0.125rem 0.75rem; }
    .position-status { flex: 1; margin: 0; font-size: 0.625rem; line-height: 1.25; opacity: 0.7; }
    .outdated { color: rgb(180 83 9); opacity: 1; }
    .page-indicators { display: flex; flex-shrink: 0; }
    .page-indicators button { display: grid; place-items: center; width: 28px; height: 28px; }
    .page-indicators span { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.25; }
    .page-indicators .active span { opacity: 1; }
    button:focus-visible, .pages:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
</style>
