<script lang="ts">
    import { page } from "$app/state";
    import Button from "$lib/components/base/button.svelte";
    import Datepicker from "$lib/components/base/datepicker.svelte";
    import Search from "$lib/components/base/search.svelte";
    import Select from "$lib/components/base/select.svelte";
    import TextField from "$lib/components/base/text_field.svelte";
    import Toggle from "$lib/components/base/toggle.svelte";
    import PoiFilterPanel from "$lib/components/poi/poi_filter_panel.svelte";
    import PoiModal from "$lib/components/poi/poi_modal.svelte";
    import MapWithElevationMaplibre from "$lib/components/trail/map_with_elevation_maplibre.svelte";
    import { Poi } from "$lib/models/poi";
    import type {
        PoiAttribute,
        PoiAttributeValue,
    } from "$lib/models/poi_attribute";
    import {
        pois_create,
        pois_delete,
        pois_import,
        pois_update,
    } from "$lib/stores/poi_store";
    import { show_toast } from "$lib/stores/toast_store.svelte";
    import { defaultPoiIcon, poiIconOptions } from "$lib/util/icon_util";
    import { getPoiDisplayColor } from "$lib/util/poi_util";
    import { _ } from "svelte-i18n";

    let { data } = $props();

    let allPois = $state(data.pois);
    let activeTab = $state(
        page.url.searchParams.get("tab") === "import" ? 1 : 0,
    );
    let searchQuery = $state("");
    let includePublic = $state(true);
    let includeOwn = $state(Boolean(page.data.user));
    let selectedCategoryIds = $state(
        data.categories.map((category) => category.id!),
    );
    let editingPoi = $state<Poi | undefined>(undefined);
    let poiModal: PoiModal;
    let importCategory = $state(data.categories[0]?.id ?? "");
    let importIcon: string = $state(defaultPoiIcon);
    let importPublic = $state(false);
    let importBusy = $state(false);
    let offerUpload = $state(false);
    let selectedPoiIds = $state<string[]>([]);
    let bulkSaveBusy = $state(false);
    let bulkDeleteBusy = $state(false);
    let bulkAttributeKeys = $state<string[]>([]);
    let bulkAttributeValues = $state<Record<string, string | boolean>>({});

    let filteredPois = $derived(
        allPois.filter((poi) => {
            if (!selectedCategoryIds.includes(poi.category)) {
                return false;
            }
            if (!includePublic && poi.public) {
                return false;
            }
            if (!includeOwn && poi.author === page.data.user?.id) {
                return false;
            }
            if (
                searchQuery.trim().length &&
                !`${poi.name} ${poi.description ?? ""} ${poi.location ?? ""}`
                    .toLowerCase()
                    .includes(searchQuery.trim().toLowerCase())
            ) {
                return false;
            }
            return true;
        }),
    );
    let editableFilteredPois = $derived(
        filteredPois.filter((poi) => canManagePoi(poi)),
    );
    let selectedPois = $derived(
        allPois.filter(
            (poi) =>
                typeof poi.id === "string" &&
                selectedPoiIds.includes(poi.id) &&
                canManagePoi(poi),
        ),
    );
    let selectedPoiCategoryIds = $derived(
        Array.from(new Set(selectedPois.map((poi) => poi.category))),
    );
    let bulkAttributeDefinitions = $derived(
        selectedPoiCategoryIds.length === 1
            ? data.attributeDefinitions.filter(
                  (definition) =>
                      definition.category === selectedPoiCategoryIds[0],
              )
            : [],
    );
    let bulkBusy = $derived(bulkSaveBusy || bulkDeleteBusy);

    $effect(() => {
        const editableIds = new Set(
            allPois
                .filter((poi) => canManagePoi(poi))
                .map((poi) => poi.id)
                .filter((id): id is string => typeof id === "string"),
        );
        const nextSelectedIds = selectedPoiIds.filter((id) =>
            editableIds.has(id),
        );
        if (nextSelectedIds.length !== selectedPoiIds.length) {
            selectedPoiIds = nextSelectedIds;
        }
    });

    $effect(() => {
        const validKeys = new Set(
            bulkAttributeDefinitions.map((definition) => definition.key),
        );
        const nextKeys = bulkAttributeKeys.filter((key) => validKeys.has(key));
        if (nextKeys.length !== bulkAttributeKeys.length) {
            bulkAttributeKeys = nextKeys;
        }

        const nextValues = Object.fromEntries(
            Object.entries(bulkAttributeValues).filter(([key]) =>
                validKeys.has(key),
            ),
        ) as Record<string, string | boolean>;
        if (
            Object.keys(nextValues).length !==
            Object.keys(bulkAttributeValues).length
        ) {
            bulkAttributeValues = nextValues;
        }
    });

    function canManagePoi(poi: Poi) {
        return page.data.user?.id === poi.author;
    }

    function clonePoiWithAttributes(
        poi: Poi,
        attributes: Record<string, PoiAttributeValue>,
    ) {
        return new Poi(poi.lat, poi.lon, {
            id: poi.id,
            name: poi.name,
            description: poi.description,
            location: poi.location,
            icon: poi.icon,
            color: poi.color,
            public: poi.public,
            author: poi.author,
            category: poi.category,
            attributes,
            expand: poi.expand,
            created: poi.created,
            updated: poi.updated,
        });
    }

    function getPoiIconColor(poi: Poi) {
        return getPoiDisplayColor(
            poi,
            data.attributeDefinitions.filter(
                (definition) => definition.category === poi.category,
            ),
        );
    }

    function setPoiInList(savedPoi: Poi) {
        const existingIndex = allPois.findIndex(
            (existingPoi) => existingPoi.id === savedPoi.id,
        );
        if (existingIndex >= 0) {
            allPois[existingIndex] = savedPoi;
            allPois = [...allPois];
        } else {
            allPois = [savedPoi, ...allPois];
        }
    }

    function setPoisInList(savedPois: Poi[]) {
        const savedPoisById = new Map(
            savedPois
                .filter((poi) => typeof poi.id === "string")
                .map((poi) => [poi.id, poi]),
        );
        allPois = allPois.map((poi) =>
            typeof poi.id === "string" && savedPoisById.has(poi.id)
                ? savedPoisById.get(poi.id)!
                : poi,
        );
    }

    function isPoiSelected(poi: Poi) {
        return typeof poi.id === "string" && selectedPoiIds.includes(poi.id);
    }

    function togglePoiSelection(poi: Poi, selected: boolean) {
        if (typeof poi.id !== "string" || !canManagePoi(poi)) {
            return;
        }

        selectedPoiIds = selected
            ? Array.from(new Set([...selectedPoiIds, poi.id]))
            : selectedPoiIds.filter((id) => id !== poi.id);
    }

    function selectAllFilteredPois() {
        selectedPoiIds = Array.from(
            new Set([
                ...selectedPoiIds,
                ...editableFilteredPois
                    .map((poi) => poi.id)
                    .filter((id): id is string => typeof id === "string"),
            ]),
        );
    }

    function clearPoiSelection() {
        selectedPoiIds = [];
        bulkAttributeKeys = [];
        bulkAttributeValues = {};
    }

    function isBulkAttributeSelected(definition: PoiAttribute) {
        return bulkAttributeKeys.includes(definition.key);
    }

    function toggleBulkAttribute(definition: PoiAttribute, selected: boolean) {
        bulkAttributeKeys = selected
            ? Array.from(new Set([...bulkAttributeKeys, definition.key]))
            : bulkAttributeKeys.filter((key) => key !== definition.key);

        if (
            selected &&
            bulkAttributeValues[definition.key] === undefined
        ) {
            bulkAttributeValues = {
                ...bulkAttributeValues,
                [definition.key]: definition.type === "boolean" ? false : "",
            };
        }
    }

    function setBulkAttributeValue(
        definition: PoiAttribute,
        value: string | boolean,
    ) {
        bulkAttributeValues = {
            ...bulkAttributeValues,
            [definition.key]: value,
        };
    }

    function getBulkAttributeTextValue(definition: PoiAttribute) {
        const value = bulkAttributeValues[definition.key];
        return typeof value === "string" ? value : "";
    }

    function getBulkAttributeBooleanValue(definition: PoiAttribute) {
        return bulkAttributeValues[definition.key] === true;
    }

    function normalizeBulkAttributeValue(
        definition: PoiAttribute,
    ): PoiAttributeValue {
        const value = bulkAttributeValues[definition.key];
        if (definition.type === "boolean") {
            return value === true;
        }
        if (typeof value !== "string") {
            return null;
        }
        const normalized = value.trim();
        return normalized.length ? normalized : null;
    }

    function createPoi() {
        editingPoi = new Poi(0, 0, {
            name: "",
            category: data.categories[0]?.id ?? "",
            icon: defaultPoiIcon,
            public: false,
        });
        poiModal.openModal();
    }

    function editPoi(poi: Poi) {
        editingPoi = new Poi(poi.lat, poi.lon, {
            id: poi.id,
            name: poi.name,
            description: poi.description,
            location: poi.location,
            icon: poi.icon,
            color: poi.color,
            public: poi.public,
            author: poi.author,
            category: poi.category,
            attributes: { ...(poi.attributes ?? {}) },
            expand: poi.expand,
            created: poi.created,
            updated: poi.updated,
        });
        poiModal.openModal();
    }

    async function savePoi(poi: Poi) {
        try {
            const savedPoi = poi.id
                ? await pois_update(poi)
                : await pois_create(poi);
            savedPoi.expand = {
                category:
                    data.categories.find(
                        (category) => category.id === savedPoi.category,
                    ) ?? savedPoi.expand?.category,
            };
            setPoiInList(savedPoi);
            show_toast({
                type: "success",
                icon: "check",
                text: $_("poi-save-success"),
            });
        } catch (error) {
            console.error(error);
            show_toast({
                type: "error",
                icon: "close",
                text: $_("poi-save-error"),
            });
        }
    }

    async function savePoiAttributes(
        poi: Poi,
        attributes: Record<string, string | boolean | null>,
    ) {
        await savePoi(clonePoiWithAttributes(poi, attributes));
    }

    async function saveBulkAttributes() {
        if (
            !selectedPois.length ||
            selectedPoiCategoryIds.length !== 1 ||
            !bulkAttributeKeys.length
        ) {
            return;
        }

        bulkSaveBusy = true;
        try {
            const savedPois: Poi[] = [];
            for (const poi of selectedPois) {
                const attributes = { ...(poi.attributes ?? {}) };
                for (const definition of bulkAttributeDefinitions) {
                    if (bulkAttributeKeys.includes(definition.key)) {
                        attributes[definition.key] =
                            normalizeBulkAttributeValue(definition);
                    }
                }
                const savedPoi = await pois_update(
                    clonePoiWithAttributes(poi, attributes),
                );
                savedPoi.expand = {
                    category:
                        data.categories.find(
                            (category) => category.id === savedPoi.category,
                        ) ?? savedPoi.expand?.category,
                };
                savedPois.push(savedPoi);
            }
            setPoisInList(savedPois);
            show_toast({
                type: "success",
                icon: "check",
                text: $_("poi-bulk-attributes-saved"),
            });
        } catch (error) {
            console.error(error);
            show_toast({
                type: "error",
                icon: "close",
                text: $_("poi-bulk-save-error"),
            });
        } finally {
            bulkSaveBusy = false;
        }
    }

    async function removePoi(poi: Poi) {
        if (
            !window.confirm(
                $_("delete-poi-confirm", { values: { name: poi.name } }),
            )
        ) {
            return;
        }
        try {
            await pois_delete(poi);
            allPois = allPois.filter((item) => item.id !== poi.id);
        } catch (error) {
            console.error(error);
            show_toast({
                type: "error",
                icon: "close",
                text: $_("poi-delete-error"),
            });
        }
    }

    async function removeSelectedPois() {
        if (!selectedPois.length) {
            return;
        }
        if (
            !window.confirm(
                $_("poi-bulk-delete-confirm", {
                    values: { n: selectedPois.length },
                }),
            )
        ) {
            return;
        }

        bulkDeleteBusy = true;
        try {
            await Promise.all(selectedPois.map((poi) => pois_delete(poi)));
            const deletedIds = new Set(selectedPois.map((poi) => poi.id));
            allPois = allPois.filter((poi) => !deletedIds.has(poi.id));
            clearPoiSelection();
            show_toast({
                type: "success",
                icon: "check",
                text: $_("poi-bulk-delete-success"),
            });
        } catch (error) {
            console.error(error);
            show_toast({
                type: "error",
                icon: "close",
                text: $_("poi-delete-error"),
            });
        } finally {
            bulkDeleteBusy = false;
        }
    }

    function openFileBrowser() {
        document.getElementById("poi-import-input")?.click();
    }

    async function importFiles(files?: FileList | null) {
        if (!files?.length || !importCategory.length) {
            return;
        }

        importBusy = true;
        try {
            for (const file of Array.from(files)) {
                const imported = await pois_import(file, {
                    category: importCategory,
                    isPublic: importPublic,
                    icon: importIcon,
                });

                for (const poi of imported) {
                    poi.expand = {
                        category: data.categories.find(
                            (category) => category.id === poi.category,
                        ),
                    };
                }
                allPois = [...imported, ...allPois];
            }
            activeTab = 0;
            show_toast({
                type: "success",
                icon: "check",
                text: $_("poi-import-success"),
            });
        } catch (error) {
            console.error(error);
            show_toast({
                type: "error",
                icon: "close",
                text: $_("poi-import-error"),
            });
        } finally {
            importBusy = false;
        }
    }
</script>

<svelte:head>
    <title>{$_("pois")} | wanderer</title>
</svelte:head>

<main class="grid grid-cols-1 md:grid-cols-[420px_1fr]">
    <div class="overflow-y-auto px-6 py-6 space-y-4">
        <div class="flex gap-2">
            <button
                class="btn-secondary"
                class:bg-primary={activeTab === 0}
                class:text-white={activeTab === 0}
                onclick={() => (activeTab = 0)}
            >
                {$_("pois")}
            </button>
            <button
                class="btn-secondary"
                class:bg-primary={activeTab === 1}
                class:text-white={activeTab === 1}
                onclick={() => (activeTab = 1)}
            >
                {$_("import")}
            </button>
        </div>

        {#if activeTab === 0}
            <div class="flex gap-2">
                <Search
                    extraClasses="w-full"
                    items={[]}
                    placeholder={$_("poi-search-placeholder")}
                    onupdate={(value) => (searchQuery = value)}
                ></Search>
                {#if page.data.user}
                    <Button primary={true} onclick={createPoi}>
                        <i class="fa fa-plus mr-2"></i>POI
                    </Button>
                {/if}
            </div>

            <PoiFilterPanel
                categories={data.categories}
                bind:selectedCategoryIds
                bind:includePublic
                bind:includeOwn
                showOwnToggle={Boolean(page.data.user)}
            ></PoiFilterPanel>

            {#if page.data.user}
                <div
                    class="rounded-xl border border-input-border p-4 space-y-4"
                >
                    <div
                        class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                    >
                        <span class="text-sm text-gray-500">
                            {selectedPois.length} {$_("selected")}
                        </span>
                        <div class="flex flex-wrap gap-2">
                            <Button
                                secondary={true}
                                onclick={selectAllFilteredPois}
                                disabled={!editableFilteredPois.length}
                            >
                                {$_("select-all")}
                            </Button>
                            <Button
                                secondary={true}
                                onclick={clearPoiSelection}
                                disabled={!selectedPois.length}
                            >
                                {$_("clear-selection")}
                            </Button>
                            <Button
                                secondary={true}
                                onclick={removeSelectedPois}
                                disabled={!selectedPois.length || bulkBusy}
                                loading={bulkDeleteBusy}
                            >
                                {$_("delete-selected")}
                            </Button>
                        </div>
                    </div>

                    {#if selectedPois.length}
                        {#if selectedPoiCategoryIds.length === 1 && bulkAttributeDefinitions.length}
                            <div class="space-y-3">
                                <h3 class="font-semibold">
                                    {$_("attributes")}
                                </h3>
                                {#each bulkAttributeDefinitions as definition}
                                    <div
                                        class="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 md:items-center"
                                    >
                                        <label
                                            class="inline-flex items-center gap-2 text-sm"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isBulkAttributeSelected(
                                                    definition,
                                                )}
                                                onchange={(event) =>
                                                    toggleBulkAttribute(
                                                        definition,
                                                        (
                                                            event.currentTarget as HTMLInputElement
                                                        ).checked,
                                                    )}
                                            />
                                            {$_("overwrite")}
                                        </label>

                                        {#if definition.type === "boolean"}
                                            <Toggle
                                                value={getBulkAttributeBooleanValue(
                                                    definition,
                                                )}
                                                label={definition.name}
                                                disabled={!isBulkAttributeSelected(
                                                    definition,
                                                )}
                                                onchange={(value) =>
                                                    setBulkAttributeValue(
                                                        definition,
                                                        value,
                                                    )}
                                            ></Toggle>
                                        {:else if definition.type === "date"}
                                            <Datepicker
                                                value={getBulkAttributeTextValue(
                                                    definition,
                                                )}
                                                label={definition.name}
                                                disabled={!isBulkAttributeSelected(
                                                    definition,
                                                )}
                                                onchange={(event) =>
                                                    setBulkAttributeValue(
                                                        definition,
                                                        (
                                                            event.currentTarget as HTMLInputElement
                                                        ).value,
                                                    )}
                                            ></Datepicker>
                                        {:else}
                                            <TextField
                                                value={getBulkAttributeTextValue(
                                                    definition,
                                                )}
                                                label={definition.name}
                                                disabled={!isBulkAttributeSelected(
                                                    definition,
                                                )}
                                                onchange={(event) =>
                                                    setBulkAttributeValue(
                                                        definition,
                                                        (
                                                            event.currentTarget as HTMLInputElement
                                                        ).value,
                                                    )}
                                            ></TextField>
                                        {/if}
                                    </div>
                                {/each}
                                <Button
                                    primary={true}
                                    onclick={saveBulkAttributes}
                                    disabled={!bulkAttributeKeys.length || bulkBusy}
                                    loading={bulkSaveBusy}
                                >
                                    {$_("apply-to-selection")}
                                </Button>
                            </div>
                        {:else if selectedPoiCategoryIds.length > 1}
                            <p class="text-sm text-gray-500">
                                {$_("poi-bulk-one-category-only")}
                            </p>
                        {:else}
                            <p class="text-sm text-gray-500">
                                {$_("poi-bulk-no-attributes")}
                            </p>
                        {/if}
                    {/if}
                </div>
            {/if}

            <div class="space-y-3">
                {#if filteredPois.length}
                    {#each filteredPois as poi}
                        <div
                            class="rounded-xl border border-input-border p-4 space-y-3"
                        >
                            <div class="flex items-start justify-between gap-4">
                                <div class="flex items-start gap-3">
                                    {#if canManagePoi(poi)}
                                        <input
                                            class="mt-1"
                                            type="checkbox"
                                            aria-label={$_("select-poi")}
                                            checked={isPoiSelected(poi)}
                                            onchange={(event) =>
                                                togglePoiSelection(
                                                    poi,
                                                    (
                                                        event.currentTarget as HTMLInputElement
                                                    ).checked,
                                                )}
                                        />
                                    {/if}
                                    <div>
                                        <h3 class="text-lg font-semibold">
                                            <i
                                                class="fa fa-{poi.icon ??
                                                    poi.expand?.category?.icon ??
                                                    'location-dot'} mr-2"
                                                style={getPoiIconColor(poi)
                                                    ? `color: ${getPoiIconColor(poi)}`
                                                    : undefined}
                                            ></i>
                                            {poi.name}
                                        </h3>
                                        <p class="text-sm text-gray-500">
                                            {[poi.expand?.category?.name, poi.location]
                                                .filter(Boolean)
                                                .join(" - ")}
                                        </p>
                                    </div>
                                </div>
                                <span class="text-sm text-gray-500">
                                    {poi.public
                                        ? $_("public")
                                        : $_("private")}
                                </span>
                            </div>

                            {#if poi.description}
                                <p>{poi.description}</p>
                            {/if}

                            {#if Object.keys(poi.attributes ?? {}).length}
                                <div class="grid grid-cols-2 gap-2 text-sm">
                                    {#each data.attributeDefinitions.filter((definition) => definition.category === poi.category) as definition}
                                        <span class="text-gray-500"
                                            >{definition.name}</span
                                        >
                                        <span>
                                            {#if poi.attributes?.[definition.key] === true}
                                                {$_("yes")}
                                            {:else if poi.attributes?.[definition.key] === false}
                                                {$_("no")}
                                            {:else}
                                                {poi.attributes?.[definition.key] ??
                                                    "-"}
                                            {/if}
                                        </span>
                                    {/each}
                                </div>
                            {/if}

                            <div class="flex items-center justify-between gap-4">
                                <span class="text-sm text-gray-500">
                                    {poi.lat.toFixed(5)}, {poi.lon.toFixed(5)}
                                </span>
                                {#if page.data.user?.id === poi.author}
                                    <div class="flex gap-2">
                                        <button
                                            class="btn-secondary"
                                            onclick={() => editPoi(poi)}
                                        >
                                            {$_("edit")}
                                        </button>
                                        <button
                                            class="btn-secondary text-red-500"
                                            onclick={() => removePoi(poi)}
                                        >
                                            {$_("delete")}
                                        </button>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/each}
                {:else}
                    <p class="text-sm text-gray-500">
                        {$_("no-matching-pois")}
                    </p>
                {/if}
            </div>
        {:else}
            <div class="space-y-4">
                <h2 class="text-xl font-semibold">{$_("import-kml-as-pois")}</h2>
                <Select
                    bind:value={importCategory}
                    label={$_("category")}
                    items={data.categories.map((category) => ({
                        text: category.name,
                        value: category.id,
                    }))}
                ></Select>
                <Select
                    bind:value={importIcon}
                    label={$_("icon")}
                    items={poiIconOptions.map((option) => ({
                        text: $_(option.labelKey),
                        value: option.value,
                    }))}
                ></Select>
                <Button secondary={true} onclick={openFileBrowser}>
                    {$_("choose-file")}
                </Button>
                <Toggle
                    bind:value={importPublic}
                    label={importPublic ? $_("public") : $_("private")}
                    icon={importPublic ? "globe" : "lock"}
                ></Toggle>
                <button
                    class="drop-area relative h-56 w-full p-4 border border-content border-dashed rounded-xl flex items-center justify-center text-gray-500 bg-background cursor-pointer hover:bg-menu-item-background-hover transition-colors"
                    class:border-2={offerUpload}
                    onclick={openFileBrowser}
                    ondragover={(event) => {
                        event.preventDefault();
                        offerUpload = true;
                    }}
                    ondragleave={() => (offerUpload = false)}
                    ondrop={async (event) => {
                        event.preventDefault();
                        offerUpload = false;
                        await importFiles(event.dataTransfer?.files);
                    }}
                >
                    {$_("drop-kml-kmz")}
                </button>
                <input
                    id="poi-import-input"
                    type="file"
                    accept=".kml,.KML,.kmz,.KMZ"
                    multiple={true}
                    hidden
                    disabled={importBusy}
                    onchange={async (event) =>
                        await importFiles(
                            (event.currentTarget as HTMLInputElement).files,
                        )}
                />
            </div>
        {/if}
    </div>

    <div id="poi-map">
        <MapWithElevationMaplibre
            fitBounds="instant"
            pois={filteredPois}
            poiAttributeDefinitions={data.attributeDefinitions}
            caneditpoi={(poi) => page.data.user?.id === poi.author}
            onpoisave={savePoiAttributes}
            showElevation={false}
            showTerrain={true}
        ></MapWithElevationMaplibre>
    </div>
</main>

<PoiModal
    bind:this={poiModal}
    poi={editingPoi}
    categories={data.categories}
    attributeDefinitions={data.attributeDefinitions}
    onsave={savePoi}
></PoiModal>

<style>
    #poi-map {
        height: calc(50vh);
    }

    @media only screen and (min-width: 768px) {
        #poi-map,
        main > div:first-child {
            height: calc(100vh - 124px);
        }
    }
</style>
