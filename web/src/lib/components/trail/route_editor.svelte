<script lang="ts">
    import type {
        RoutingOptions,
        ValhallaBicycleCostingOptions,
    } from "$lib/models/valhalla";
    import { valhallaStore } from "$lib/stores/valhalla_store.svelte";
    import { formatSpeed } from "$lib/util/format_util";
    import { _ } from "svelte-i18n";
    import { slide } from "svelte/transition";
    import Button from "../base/button.svelte";
    import Select, { type SelectItem } from "../base/select.svelte";
    import Slider from "../base/slider.svelte";
    import Toggle from "../base/toggle.svelte";
    interface Props {
        options: RoutingOptions;
        onRecalculateElevationData: () => void;
        onUndo: () => void;
        onRedo: () => void;
    }

    let {
        options = $bindable(),
        onRecalculateElevationData,
        onUndo,
        onRedo,
    }: Props = $props();

    const bikeTypes: SelectItem[] = [
        { text: $_("hybrid"), value: "Hybrid" },
        { text: $_("road"), value: "Road" },
        { text: $_("cross"), value: "Cross" },
        { text: $_("mountain"), value: "Mountain" },
    ];

    if (!options.pedestrianOptions) {
        options.pedestrianOptions = {
            max_hiking_difficulty: 3,
            walking_speed: 5.1,
            use_hills: 1,
            use_tracks: 1,
            walkway_factor: 0.7,
            sidewalk_factor: 1,
            shortest: true,
        };
    }

    if (!options.bicycleOptions) {
        options.bicycleOptions = {
            bicycle_type: "Mountain",
            cycling_speed: 16,
            use_roads: 0,
            use_hills: 0.8,
            avoid_bad_surfaces: 0,
            shortest: true,
        };
    }

    $effect(() => {
        if (!options.autoRouting) {
            showSettings = false;
        }
    });

    let showSettings = $state(false);
    let editRoute = $state(false);
    let recalculateElevationData = $state(false);

    // svelte-ignore non_reactive_update
    let cycleSpeedSlider: Slider;

    function adjustSpeeddependingOnBikeType(
        type: ValhallaBicycleCostingOptions["bicycle_type"],
    ) {
        switch (type) {
            case "City":
            case "Hybrid":
                cycleSpeedSlider?.set(18);
                break;
            case "Road":
                cycleSpeedSlider?.set(25);
                break;
            case "Cross":
                cycleSpeedSlider?.set(20);
                break;
            case "Mountain":
                cycleSpeedSlider?.set(16);
                break;
            default:
                break;
        }
    }

    function togglePanels(_edit: boolean, _recalc: boolean) {
        recalculateElevationData = _recalc;
        editRoute = _edit;
    }
</script>

<div class="flex gap-x-2 items-start">
    <div class="flex flex-col gap-y-1 p-1 bg-background rounded-md my-2">
        <button
            class="btn-icon"
            class:bg-secondary-hover={editRoute}
            aria-label="edit route"
            onclick={() => togglePanels(!editRoute, false)}><i class="fa fa-route text-sm"></i></button
        >
        <button
            class="btn-icon"
            class:bg-secondary-hover={recalculateElevationData}
            aria-label="recalculate elevation data"
            onclick={() => togglePanels(false, !recalculateElevationData)}><i class="fa fa-mountain text-sm"></i></button
        >
        <button
            class="btn-icon"
            class:text-gray-500={valhallaStore.undoStack.length == 0}
            disabled={valhallaStore.undoStack.length == 0}
            aria-label="undo route action"
            onclick={onUndo}><i class="fa fa-undo text-sm"></i></button
        >
        <button
            class="btn-icon"
            class:text-gray-500={valhallaStore.redoStack.length == 0}
            disabled={valhallaStore.redoStack.length == 0}
            aria-label="redo route action"
            onclick={onRedo}><i class="fa fa-redo text-sm"></i></button
        >
    </div>

    {#if editRoute}
        <div class=" pt-2 pb-3 px-4 my-2 rounded-xl bg-background shadow-xl">
            <Toggle
                bind:value={options.autoRouting}
                label={$_("enable-auto-routing")}
            ></Toggle>
            <div class="flex items-center gap-4 mt-4">
                <button
                    class="btn-icon tooltip"
                    type="button"
                    disabled={!options.autoRouting}
                    onclick={() => (showSettings = !showSettings)}
                    data-title={$_("more-route-settings")}
                    aria-label="Toggle routing settings"
                    ><i
                        class="fa fa-cogs"
                        class:text-gray-500={!options.autoRouting}
                    ></i></button
                >
            </div>
            {#if showSettings}
                <div in:slide out:slide>
                    {#if options.modeOfTransport === "pedestrian" && options.pedestrianOptions}
                        <p class="text-sm font-medium pb-1">
                            {$_("walking-speed")}
                        </p>
                        <Slider
                            minValue={0.5}
                            maxValue={25}
                            bind:currentValue={
                                options.pedestrianOptions.walking_speed
                            }
                        ></Slider>
                        <p class="text-sm text-end">
                            {formatSpeed(
                                options.pedestrianOptions.walking_speed! / 3.6,
                            )}
                        </p>
                        <hr class="border-input-border my-3" />
                        <p class="text-sm font-medium">{$_("use-hills")}</p>
                        <Slider
                            minValue={0}
                            maxValue={1}
                            step={0.1}
                            bind:currentValue={
                                options.pedestrianOptions!.use_hills
                            }
                        ></Slider>
                        <p class="text-sm text-end">
                            {options.pedestrianOptions.use_hills?.toFixed(2)}
                        </p>
                        <hr class="border-input-border my-3" />
                        <p class="text-sm font-medium">
                            {$_("max-hiking-difficulty")}
                        </p>
                        <Slider
                            minValue={0}
                            maxValue={6}
                            step={1}
                            bind:currentValue={
                                options.pedestrianOptions!.max_hiking_difficulty
                            }
                        ></Slider>
                        <p class="text-sm text-end">
                            {options.pedestrianOptions.max_hiking_difficulty?.toFixed(
                                0,
                            )}
                        </p>
                        <hr class="border-input-border my-3" />
                        <Toggle
                            label={$_("shortest")}
                            bind:value={options.pedestrianOptions.shortest}
                        ></Toggle>
                    {:else if options.modeOfTransport === "bicycle" && options.bicycleOptions}
                        <Select
                            items={bikeTypes}
                            label={$_("bike-type")}
                            onchange={(v) => adjustSpeeddependingOnBikeType(v)}
                            bind:value={options.bicycleOptions.bicycle_type}
                        ></Select>
                        <hr class="border-input-border my-3" />
                        <p class="text-sm font-medium pb-1">
                            {$_("cycling-speed")}
                        </p>
                        <Slider
                            minValue={5}
                            maxValue={50}
                            bind:currentValue={
                                options.bicycleOptions.cycling_speed
                            }
                            bind:this={cycleSpeedSlider}
                        ></Slider>
                        <p class="text-sm text-end">
                            {formatSpeed(
                                options.bicycleOptions.cycling_speed! / 3.6,
                            )}
                        </p>
                        <hr class="border-input-border my-3" />
                        <p class="text-sm font-medium">{$_("use-hills")}</p>
                        <Slider
                            minValue={0}
                            maxValue={1}
                            step={0.05}
                            bind:currentValue={options.bicycleOptions.use_hills}
                        ></Slider>
                        <p class="text-sm text-end">
                            {options.bicycleOptions.use_hills?.toFixed(2)}
                        </p>
                        <hr class="border-input-border my-3" />
                        <p class="text-sm font-medium">{$_("use-roads")}</p>
                        <Slider
                            minValue={0}
                            maxValue={1}
                            step={0.05}
                            bind:currentValue={options.bicycleOptions.use_roads}
                        ></Slider>
                        <p class="text-sm text-end">
                            {options.bicycleOptions.use_roads?.toFixed(2)}
                        </p>
                        <hr class="border-input-border my-3" />
                        <p class="text-sm font-medium">
                            {$_("avoid-bad-surfaces")}
                        </p>
                        <Slider
                            minValue={0}
                            maxValue={1}
                            step={0.05}
                            bind:currentValue={
                                options.bicycleOptions.avoid_bad_surfaces
                            }
                        ></Slider>
                        <p class="text-sm text-end">
                            {options.bicycleOptions.avoid_bad_surfaces?.toFixed(
                                2,
                            )}
                        </p>
                        <hr class="border-input-border my-3" />
                        <Toggle
                            label={$_("shortest")}
                            bind:value={options.bicycleOptions.shortest}
                        ></Toggle>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}

    {#if recalculateElevationData}
        <div
            class="p-4 my-2 rounded-xl bg-background shadow-xl flex flex-col max-w-70"
        >
            <Button secondary onclick={onRecalculateElevationData}
                >{$_("recalculate-elevation-data")}</Button
            >
            <p class="bg-background/50 rounded-xl text-sm text-gray-500 mt-3">
                {$_("recalculating-elevation-data-hint")}
            </p>
        </div>
    {/if}
</div>
