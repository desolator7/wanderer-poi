<script lang="ts">
    import { onMount } from 'svelte';
    import { getPb } from '$lib/pocketbase';

    export let poi: any;

    let attributes: any[] = [];
    let saving = false;

    onMount(async () => {
        try {
            const records = await getPb().collection('poi_attributes').getFullList();
            attributes = records;

            // Initialize missing attributes
            let updated = false;
            let poiAttrs = poi.attributes || {};

            for (const attr of attributes) {
                if (poiAttrs[attr.name] === undefined) {
                    poiAttrs[attr.name] = attr.type === 'boolean' ? false : '';
                    updated = true;
                }
            }

            if (updated) {
                poi.attributes = poiAttrs;
            }
        } catch (e) {
            console.error(e);
        }
    });

    async function saveAttributes() {
        saving = true;
        try {
            await getPb().collection('pois').update(poi.id, {
                attributes: poi.attributes
            });
        } catch (e) {
            console.error(e);
            alert('Failed to save attributes');
        } finally {
            saving = false;
        }
    }
</script>

<div class="p-2 min-w-[200px]">
    <h3 class="font-bold text-lg mb-1">{poi.name}</h3>
    {#if poi.description}
        <p class="text-sm text-gray-600 mb-4">{poi.description}</p>
    {/if}

    {#if attributes.length > 0}
        <div class="divider my-2 text-xs">Attributes</div>
        <div class="flex flex-col gap-2 mb-4">
            {#each attributes as attr}
                {#if attr.type === 'boolean'}
                    <label class="label cursor-pointer justify-start gap-3 py-1">
                        <input
                            type="checkbox"
                            bind:checked={poi.attributes[attr.name]}
                            class="checkbox checkbox-sm"
                            on:change={saveAttributes}
                        />
                        <span class="label-text text-sm">{attr.name}</span>
                    </label>
                {:else}
                    <div class="form-control">
                        <label class="label py-1" for="attr-{attr.name}"><span class="label-text text-sm">{attr.name}</span></label>
                        <input
                            id="attr-{attr.name}"
                            type="text"
                            bind:value={poi.attributes[attr.name]}
                            class="input input-sm input-bordered"
                            on:blur={saveAttributes}
                        />
                    </div>
                {/if}
            {/each}
            {#if saving}
                <span class="text-xs text-gray-400 mt-1">Saving...</span>
            {/if}
        </div>
    {/if}

    <div class="flex justify-between items-center mt-2 pt-2 border-t border-base-200">
        <a href="/pois" class="text-xs text-primary underline">Manage POIs</a>
    </div>
</div>
