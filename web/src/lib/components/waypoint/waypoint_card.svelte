<script lang="ts">
    import type { Waypoint } from "$lib/models/waypoint";
    import {
        getFileURL,
        isVideoURL,
        readAsDataURLAsync,
    } from "$lib/util/file_util";
    import { _ } from "svelte-i18n";
    import Dropdown, { type DropdownItem } from "../base/dropdown.svelte";
    import { browser } from "$app/environment";
    import PhotoGallery from "../photo_gallery.svelte";

    interface Props {
        waypoint: Waypoint;
        mode?: "show" | "edit";
        onchange?: (item: DropdownItem) => void;
        routingRole?: "start" | "via" | "goal";
        waypointNumber?: number;
        canMoveUp?: boolean;
        canMoveDown?: boolean;
        onMoveUp?: () => void;
        onMoveDown?: () => void;
        canSetAsStart?: boolean;
    }

    let {
        waypoint,
        mode = "show",
        onchange,
        routingRole,
        waypointNumber,
        canMoveUp = false,
        canMoveDown = false,
        onMoveUp,
        onMoveDown,
        canSetAsStart = false,
    }: Props = $props();

    let gallery: PhotoGallery | undefined = $state();

    let imgSrc: string[] = $state([]);
    $effect(() => {
        if (waypoint.photos?.length) {
            imgSrc = waypoint.photos
                .filter((_, i) => i < 3)
                .reverse()
                .map((p) => getFileURL(waypoint, p));
        } else if (waypoint._photos?.length && browser) {
            Promise.all(
                waypoint._photos
                    .filter((_, i) => i < 3)
                    .map(async (f) => {
                        return await readAsDataURLAsync(f);
                    }),
            ).then((v) => {
                imgSrc = v;
            });
        } else {
            imgSrc = [];
        }
    });

    let dropdownItems = $derived([
        { text: $_("edit"), value: "edit" },
        ...(canSetAsStart
            ? [
                  {
                      text: $_("set-as-start"),
                      value: "set-as-start",
                      icon: "play",
                  },
              ]
            : []),
        { text: $_("delete"), value: "delete" },
    ]);
</script>

<div
    class="flex gap-4 p-4 outline outline-1 outline-input-border rounded-md my-2 hover:outline-2 items-start"
>
    {#if waypointNumber !== undefined}
        <div class="flex shrink-0 flex-col items-center gap-1">
            <span
                class="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white shadow-md"
            >
                {waypointNumber}
            </span>
            {#if mode == "edit"}
                <div class="flex gap-1">
                    <button
                        class="btn-icon"
                        type="button"
                        aria-label="Move waypoint up"
                        disabled={!canMoveUp}
                        onclick={onMoveUp}
                    >
                        <i
                            class="fa fa-arrow-up text-xs"
                            class:text-gray-500={!canMoveUp}
                        ></i>
                    </button>
                    <button
                        class="btn-icon"
                        type="button"
                        aria-label="Move waypoint down"
                        disabled={!canMoveDown}
                        onclick={onMoveDown}
                    >
                        <i
                            class="fa fa-arrow-down text-xs"
                            class:text-gray-500={!canMoveDown}
                        ></i>
                    </button>
                </div>
            {/if}
        </div>
    {/if}
    {#if imgSrc.length}
        {#if mode == "show"}
            <PhotoGallery
                photos={waypoint.photos.map((p) => getFileURL(waypoint, p))}
                bind:this={gallery}
            ></PhotoGallery>
        {/if}
        <button
            class="relative basis-16 aspect-square ml-2 mb-3 shrink-0"
            type="button"
            onclick={mode == "show" ? () => gallery?.openGallery() : undefined}
        >
            {#each imgSrc as img, i}
                {#if isVideoURL(img)}
                    <!-- svelte-ignore a11y_media_has_caption -->
                    <video
                        controls={false}
                        loop
                        class="absolute h-full rounded-xl object-cover aspect-square"
                        style="top: {6 * i}px; right: {6 *
                            i}px; transform: rotate(-{i * 5}deg)"
                        onmouseenter={(e) => (e.target as any).play()}
                        onmouseleave={(e) => (e.target as any).pause()}
                        src={img}
                    ></video>
                {:else}
                    <img
                        class="absolute h-full rounded-xl object-cover aspect-square"
                        style="top: {6 * i}px; right: {6 *
                            i}px; transform: rotate(-{i * 5}deg)"
                        src={img}
                        alt="waypoint"
                    />
                {/if}
            {/each}
        </button>
    {/if}
    <div class="basis-full">
        <div class="flex justify-between items-center mb-2">
            <h5>
                <i class="fa fa-{waypoint.icon} mr-2"></i>{waypoint.name || `${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)}`}
            </h5>
            <div class="flex items-center gap-2">
                {#if routingRole}
                    <span class="text-xs uppercase bg-slate-100 px-2 py-1 rounded text-slate-700"
                        >{$_(routingRole)}</span
                    >
                {/if}
                {#if mode == "edit"}
                    <Dropdown items={dropdownItems} {onchange}></Dropdown>
                {/if}
            </div>
        </div>

        {#if waypoint.description}
            <p>{@html waypoint.description}</p>
        {/if}

        <span class="text-sm text-gray-500"
            >{waypoint.lat.toFixed(5)}, {waypoint.lon.toFixed(5)}</span
        >
    </div>
</div>
