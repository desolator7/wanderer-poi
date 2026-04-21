<script lang="ts">
    import type { PoiAttribute } from "$lib/models/poi_attribute";
    import type { PoiCategory } from "$lib/models/poi_category";
    import { _ } from "svelte-i18n";
    import Modal from "../base/modal.svelte";
    import TextField from "../base/text_field.svelte";
    import Textarea from "../base/textarea.svelte";
    import Select from "../base/select.svelte";
    import Toggle from "../base/toggle.svelte";
    import Datepicker from "../base/datepicker.svelte";
    import { Poi } from "$lib/models/poi";
    import { defaultPoiIcon, poiIconOptions } from "$lib/util/icon_util";
    import { currentUser } from "$lib/stores/user_store";
    import { canEditPoiAttributeValue } from "$lib/util/poi_util";

    interface Props {
        poi?: Poi;
        categories?: PoiCategory[];
        attributeDefinitions?: PoiAttribute[];
        onsave?: (poi: Poi) => Promise<void> | void;
    }

    let {
        poi,
        categories = [],
        attributeDefinitions = [],
        onsave,
    }: Props = $props();

    let modal: Modal;
    let saving = $state(false);
    let user = $derived($currentUser);
    let isAdmin = $derived(Boolean((user as any)?.collectionName?.includes("super")));

    function clonePoi(source?: Poi) {
        if (source) {
            return new Poi(source.lat, source.lon, {
                id: source.id,
                name: source.name,
                description: source.description,
                location: source.location,
                icon: source.icon,
                color: source.color,
                public: source.public,
                category: source.category,
                author: source.author,
                attributes: { ...(source.attributes ?? {}) },
                created: source.created,
                updated: source.updated,
                expand: source.expand,
            });
        }

        return new Poi(0, 0, {
            name: "",
            category: categories[0]?.id ?? "",
            icon: defaultPoiIcon,
            attributes: {},
        });
    }

    let draft = $state(clonePoi(poi));

    $effect(() => {
        draft = clonePoi(poi);
    });

    let selectedDefinitions = $derived(
        attributeDefinitions.filter(
            (definition) => definition.category === draft.category,
        ),
    );

    $effect(() => {
        const nextAttributes = { ...(draft.attributes ?? {}) };
        for (const definition of selectedDefinitions) {
            if (!(definition.key in nextAttributes)) {
                nextAttributes[definition.key] = null;
            }
        }
        draft.attributes = nextAttributes;
    });


    function isAttributeEditable(definition: PoiAttribute) {
        return canEditPoiAttributeValue(definition, {
            currentUserId: user?.id,
            isAdmin,
        });
    }

    export function openModal() {
        draft = clonePoi(poi);
        modal.openModal();
    }

    async function save() {
        if (!draft.name.trim().length || !draft.category.length) {
            return;
        }

        saving = true;
        try {
            await onsave?.(
                new Poi(Number(draft.lat), Number(draft.lon), {
                    id: draft.id,
                    name: draft.name.trim(),
                    description: draft.description,
                    location: draft.location,
                    icon: draft.icon ?? defaultPoiIcon,
                    color: draft.color,
                    public: draft.public,
                    category: draft.category,
                    author: draft.author,
                    attributes: { ...(draft.attributes ?? {}) },
                    created: draft.created,
                    updated: draft.updated,
                    expand: draft.expand,
                }),
            );
            modal.closeModal();
        } finally {
            saving = false;
        }
    }
</script>

<Modal
    id="poi-modal"
    title={draft.id ? $_("edit-poi") : $_("create-poi")}
    size="md:min-w-2xl"
    bind:this={modal}
>
    {#snippet content()}
        <div class="space-y-4">
            <TextField bind:value={draft.name} label={$_("name")}></TextField>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                    bind:value={draft.category}
                    label={$_("category")}
                    items={categories.map((category) => ({
                        text: category.name,
                        value: category.id,
                    }))}
                ></Select>
                <TextField
                    bind:value={draft.location}
                    label={$_("location")}
                ></TextField>
            </div>
            <Textarea
                bind:value={draft.description}
                label={$_("description")}
            ></Textarea>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                    bind:value={draft.icon}
                    label={$_("icon")}
                    items={poiIconOptions.map((option) => ({
                        text: $_(option.labelKey),
                        value: option.value,
                    }))}
                ></Select>
                <div>
                    <label class="text-sm font-medium pb-1">{$_("color")}</label>
                    <div class="flex items-center gap-3">
                        <input
                            class="h-10 w-12 rounded-md border border-input-border bg-input-background"
                            type="color"
                            value={draft.color ?? "#6B7280"}
                            onchange={(event) =>
                                (draft.color = (
                                    event.currentTarget as HTMLInputElement
                                ).value.toUpperCase())}
                        />
                        <span class="text-sm text-gray-500"
                            >{draft.color ?? "#6B7280"}</span
                        >
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextField bind:value={draft.lat} label={$_("latitude")}
                ></TextField>
                <TextField bind:value={draft.lon} label={$_("longitude")}
                ></TextField>
            </div>
            <Toggle
                bind:value={draft.public}
                label={draft.public ? $_("public") : $_("private")}
                icon={draft.public ? "globe" : "lock"}
            ></Toggle>

            {#if selectedDefinitions.length}
                <div class="space-y-3">
                    <h4 class="text-lg font-semibold">{$_("attributes")}</h4>
                    {#each selectedDefinitions as definition}
                        {#if definition.type === "boolean"}
                            <Toggle
                                value={draft.attributes?.[definition.key] === true}
                                label={definition.name}
                                disabled={!isAttributeEditable(definition)}
                                onchange={(value) =>
                                    (draft.attributes = {
                                        ...(draft.attributes ?? {}),
                                        [definition.key]: value,
                                    })}
                            ></Toggle>
                        {:else if definition.type === "date"}
                            <Datepicker
                                value={typeof draft.attributes?.[definition.key] === "string"
                                    ? draft.attributes?.[definition.key]
                                    : ""}
                                disabled={!isAttributeEditable(definition)}
                                label={definition.name}
                                onchange={(event) =>
                                    (draft.attributes = {
                                        ...(draft.attributes ?? {}),
                                        [definition.key]: (event.currentTarget as HTMLInputElement)
                                            .value,
                                    })}
                            ></Datepicker>
                        {:else}
                            <TextField
                                value={typeof draft.attributes?.[definition.key] === "string"
                                    ? draft.attributes?.[definition.key]
                                    : ""}
                                disabled={!isAttributeEditable(definition)}
                                label={definition.name}
                                onchange={(event) =>
                                    (draft.attributes = {
                                        ...(draft.attributes ?? {}),
                                        [definition.key]: (event.currentTarget as HTMLInputElement)
                                            .value,
                                    })}
                            ></TextField>
                        {/if}
                    {/each}
                </div>
            {/if}
        </div>
    {/snippet}
    {#snippet footer()}
        <div class="flex items-center gap-4">
            <button class="btn-secondary" onclick={() => modal.closeModal()}>
                {$_("cancel")}
            </button>
            <button class="btn-primary" onclick={save} disabled={saving}>
                {$_("save")}
            </button>
        </div>
    {/snippet}
</Modal>
