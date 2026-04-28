<script lang="ts">
    import emptyStateTrailDark from "$lib/assets/svgs/empty_states/empty_state_trail_dark.svg";
    import emptyStateTrailLight from "$lib/assets/svgs/empty_states/empty_state_trail_light.svg";
    import type { Trail } from "$lib/models/trail";
    import { currentUser } from "$lib/stores/user_store";
    import { getFileURL } from "$lib/util/file_util";
    import { formatDistance } from "$lib/util/format_util";
    import type { ListResult } from "pocketbase";
    import { _ } from "svelte-i18n";
    import { theme } from "$lib/stores/theme_store";
    import Modal from "../base/modal.svelte";
    import Search, { type SearchItem } from "../base/search.svelte";

    interface Props {
        sourceTrail?: Trail;
        onassign?: (targetTrail: Trail) => Promise<void> | void;
    }

    let { sourceTrail, onassign }: Props = $props();

    let modal: Modal;
    let query = $state("");
    let searchItems: SearchItem[] = $state([]);
    let selectedTarget: Trail | undefined = $state();
    let loading = $state(false);
    let assigning = $state(false);

    export function openModal() {
        query = "";
        searchItems = [];
        selectedTarget = undefined;
        modal.openModal();
    }

    function escapeFilterValue(value: string) {
        return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
    }

    function getTrailIcon(targetTrail: Trail) {
        const photo = targetTrail.photos?.[targetTrail.thumbnail ?? 0];
        if (photo) {
            return getFileURL(targetTrail, photo);
        }

        return $theme === "light" ? emptyStateTrailLight : emptyStateTrailDark;
    }

    function getTrailDescription(targetTrail: Trail) {
        return [targetTrail.location, formatDistance(targetTrail.distance)]
            .filter(Boolean)
            .join(" - ");
    }

    async function updateTrails(q: string) {
        query = q;
        selectedTarget = undefined;
        const normalizedQuery = q.trim();

        if (!normalizedQuery || !sourceTrail?.id || !$currentUser?.actor) {
            searchItems = [];
            return;
        }

        loading = true;
        try {
            const filter = [
                `author="${escapeFilterValue($currentUser.actor)}"`,
                `id!="${escapeFilterValue(sourceTrail.id)}"`,
                `(name~"${escapeFilterValue(normalizedQuery)}" || location~"${escapeFilterValue(normalizedQuery)}")`,
            ].join(" && ");

            const response = await fetch(
                "/api/v1/trail?" +
                    new URLSearchParams({
                        page: "1",
                        perPage: "8",
                        sort: "-updated",
                        expand: "category",
                        filter,
                    }),
            );

            if (!response.ok) {
                searchItems = [];
                return;
            }

            const result: ListResult<Trail> = await response.json();
            searchItems = result.items.map((targetTrail) => ({
                text: targetTrail.name,
                description: getTrailDescription(targetTrail),
                icon: getTrailIcon(targetTrail),
                value: targetTrail,
            }));
        } finally {
            loading = false;
        }
    }

    function selectTarget(item: SearchItem) {
        selectedTarget = item.value;
        query = item.text;
        searchItems = [];
    }

    async function assignTarget(closeModal: () => void) {
        if (!selectedTarget) {
            return;
        }

        assigning = true;
        try {
            await onassign?.(selectedTarget);
            closeModal();
        } finally {
            assigning = false;
        }
    }
</script>

<Modal
    id="trail-summit-log-assign-modal"
    title={$_("pick-a-trail")}
    size="md:min-w-sm"
    bind:this={modal}
>
    {#snippet content()}
        <div class="space-y-4 min-h-40">
            <Search
                onupdate={(q) => updateTrails(q)}
                timeBetweenUpdates={250}
                onclick={selectTarget}
                placeholder={$_("search-for-trails-places")}
                items={searchItems}
                bind:value={query}
                clearAfterSelect={false}
            >
                {#snippet prepend({ item })}
                    <img
                        class="rounded-md w-10 aspect-square mr-2 object-cover"
                        src={item.icon}
                        alt="thumbnail"
                    />
                {/snippet}
            </Search>
            {#if loading}
                <div class="flex justify-center">
                    <div class="spinner light:spinner-dark"></div>
                </div>
            {:else if query.trim().length && searchItems.length === 0 && !selectedTarget}
                <p class="text-sm text-gray-500 text-center">
                    {$_("no-results")}
                </p>
            {/if}
        </div>
    {/snippet}
    {#snippet footer({ closeModal })}
        <div class="flex justify-end gap-2">
            <button class="btn-secondary" onclick={closeModal}>
                {$_("close")}
            </button>
            <button
                class="btn-primary"
                disabled={!selectedTarget || assigning}
                onclick={() => assignTarget(closeModal)}
            >
                {assigning ? $_("save") : $_("assign-to-planned-tour")}
            </button>
        </div>
    {/snippet}
</Modal>
