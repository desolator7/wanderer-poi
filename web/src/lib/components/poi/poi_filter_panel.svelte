<script lang="ts">
    import type { PoiCategory } from "$lib/models/poi_category";
    import { _ } from "svelte-i18n";

    interface Props {
        categories?: PoiCategory[];
        selectedCategoryIds?: string[];
        includePublic?: boolean;
        includeOwn?: boolean;
        showOwnToggle?: boolean;
        title?: string;
    }

    let {
        categories = [],
        selectedCategoryIds = $bindable([]),
        includePublic = $bindable(true),
        includeOwn = $bindable(true),
        showOwnToggle = true,
        title = "POIs",
    }: Props = $props();

    function toggleCategory(categoryId: string) {
        if (selectedCategoryIds.includes(categoryId)) {
            selectedCategoryIds = selectedCategoryIds.filter((id) => id !== categoryId);
        } else {
            selectedCategoryIds = [...selectedCategoryIds, categoryId];
        }
    }
</script>

<div class="rounded-xl border border-input-border p-4 space-y-3">
    <div class="flex items-center justify-between gap-4">
        <h3 class="text-lg font-semibold">{title}</h3>
        <span class="text-sm text-gray-500">{selectedCategoryIds.length}/{categories.length}</span>
    </div>

    <div class="flex flex-wrap gap-2">
        <button
            type="button"
            class="btn-secondary text-sm"
            class:bg-primary={includePublic}
            class:text-white={includePublic}
            onclick={() => (includePublic = !includePublic)}
        >
            {$_("public")}
        </button>
        {#if showOwnToggle}
            <button
                type="button"
                class="btn-secondary text-sm"
                class:bg-primary={includeOwn}
                class:text-white={includeOwn}
                onclick={() => (includeOwn = !includeOwn)}
            >
                Eigene
            </button>
        {/if}
    </div>

    <div class="flex flex-wrap gap-2">
        {#each categories as category}
            <button
                type="button"
                class="btn-secondary text-sm"
                class:bg-primary={selectedCategoryIds.includes(category.id!)}
                class:text-white={selectedCategoryIds.includes(category.id!)}
                onclick={() => toggleCategory(category.id!)}
            >
                <i class="fa fa-{category.icon ?? 'location-dot'} mr-2"></i>
                {category.name}
            </button>
        {/each}
    </div>
</div>
