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
    import type { PoiCategory } from "$lib/models/poi_category";
    import {
        pois_create,
        pois_delete,
        pois_import,
        pois_update,
    } from "$lib/stores/poi_store";
    import { show_toast } from "$lib/stores/toast_store.svelte";
    import { defaultPoiIcon, poiIconOptions } from "$lib/util/icon_util";
    import { getPoiDisplayColor } from "$lib/util/poi_util";
    import type * as M from "maplibre-gl";
    import { _ } from "svelte-i18n";
    import type { PageProps } from "./$types";

    type BulkPoiField = "public" | "category" | "icon" | "color";

    let { data }: PageProps = $props();
    const poiCategories: PoiCategory[] = data.categories;
    const poiAttributeDefinitions: PoiAttribute[] = data.attributeDefinitions;

    let allPois: Poi[] = $state(data.pois);
    let searchQuery = $state("");
    let includePublic = $state(true);
    let includeOwn = $state(Boolean(page.data.user));
    let selectedCategoryIds = $state(
        poiCategories.map((category) => category.id!),
    );
    let editingPoi = $state<Poi | undefined>(undefined);
    let poiModal: PoiModal;
    let importCategory = $state(poiCategories[0]?.id ?? "");
    let importIcon: string = $state(defaultPoiIcon);
    let importPublic = $state(false);
    let importBusy = $state(false);
    let selectedPoiIds = $state<string[]>([]);
    let bulkSaveBusy = $state(false);
    let bulkDeleteBusy = $state(false);
    let bulkPoiFieldKeys = $state<BulkPoiField[]>([]);
    let bulkPoiFieldValues = $state<{
        public: boolean;
        category: string;
        icon: Poi["icon"];
        color: string;
    }>({
        public: false,
        category: poiCategories[0]?.id ?? "",
        icon: defaultPoiIcon,
        color: "#6B7280",
    });
    let bulkAttributeKeys = $state<string[]>([]);
    let bulkAttributeValues = $state<Record<string, string | boolean>>({});
    let mapInteractionMode = $state(false);

    let filteredPois: Poi[] = $derived(
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
    let editableFilteredPois: Poi[] = $derived(
        filteredPois.filter((poi) => canManagePoi(poi)),
    );
    let selectedPois: Poi[] = $derived(
        allPois.filter(
            (poi) =>
                typeof poi.id === "string" &&
                selectedPoiIds.includes(poi.id) &&
                canManagePoi(poi),
        ),
    );
    let selectedPoiCategoryIds: string[] = $derived(
        Array.from(new Set(selectedPois.map((poi) => poi.category))),
    );
    let bulkAttributeCategoryId: string = $derived(
        bulkPoiFieldKeys.includes("category") && bulkPoiFieldValues.category
            ? bulkPoiFieldValues.category
            : selectedPoiCategoryIds.length === 1
              ? selectedPoiCategoryIds[0]
              : "",
    );
    let bulkAttributeDefinitions: PoiAttribute[] = $derived(
        bulkAttributeCategoryId.length
            ? poiAttributeDefinitions.filter(
                  (definition) =>
                      definition.category === bulkAttributeCategoryId,
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

    function clonePoiForSave(
        poi: Poi,
        params: {
            attributes?: Record<string, PoiAttributeValue>;
            category?: string;
            icon?: Poi["icon"];
            color?: string;
            public?: boolean;
        },
    ) {
        return new Poi(poi.lat, poi.lon, {
            id: poi.id,
            name: poi.name,
            description: poi.description,
            location: poi.location,
            icon: params.icon ?? poi.icon,
            color: params.color ?? poi.color,
            public: params.public ?? poi.public,
            author: poi.author,
            category: params.category ?? poi.category,
            attributes: params.attributes ?? poi.attributes,
            expand: poi.expand,
            created: poi.created,
            updated: poi.updated,
        });
    }

    function getPoiIconColor(poi: Poi) {
        return getPoiDisplayColor(
            poi,
            poiAttributeDefinitions.filter(
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
        bulkPoiFieldKeys = [];
        bulkAttributeKeys = [];
        bulkAttributeValues = {};
    }

    function isBulkPoiFieldSelected(field: BulkPoiField) {
        return bulkPoiFieldKeys.includes(field);
    }

    function toggleBulkPoiField(field: BulkPoiField, selected: boolean) {
        bulkPoiFieldKeys = selected
            ? Array.from(new Set([...bulkPoiFieldKeys, field]))
            : bulkPoiFieldKeys.filter((key) => key !== field);
    }

    function setBulkPoiFieldValue(
        field: BulkPoiField,
        value: string | boolean,
    ) {
        if (field === "public") {
            bulkPoiFieldValues = {
                ...bulkPoiFieldValues,
                public: value === true,
            };
        } else if (field === "icon") {
            bulkPoiFieldValues = {
                ...bulkPoiFieldValues,
                icon: value as Poi["icon"],
            };
        } else if (field === "color") {
            bulkPoiFieldValues = {
                ...bulkPoiFieldValues,
                color:
                    typeof value === "string"
                        ? value.toUpperCase()
                        : bulkPoiFieldValues.color,
            };
        } else {
            bulkPoiFieldValues = {
                ...bulkPoiFieldValues,
                category: typeof value === "string" ? value : "",
            };
        }
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

    function createPoiAt(lat: number, lon: number) {
        editingPoi = new Poi(lat, lon, {
            name: "",
            category: poiCategories[0]?.id ?? "",
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

    function handleMapPoiCreate(event: M.MapMouseEvent & Object) {
        if (!page.data.user || !mapInteractionMode) {
            return;
        }
        createPoiAt(event.lngLat.lat, event.lngLat.lng);
    }

    async function movePoi(poi: Poi, marker: M.Marker) {
        if (!mapInteractionMode || !canManagePoi(poi)) {
            return;
        }
        const lngLat = marker.getLngLat();
        await savePoi(
            new Poi(lngLat.lat, lngLat.lng, {
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
            }),
        );
    }

    async function savePoi(poi: Poi) {
        try {
            const savedPoi = poi.id
                ? await pois_update(poi)
                : await pois_create(poi);
            savedPoi.expand = {
                category:
                    poiCategories.find(
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
        await savePoi(clonePoiForSave(poi, { attributes }));
    }

    async function saveBulkAttributes() {
        if (
            !selectedPois.length ||
            (!bulkPoiFieldKeys.length && !bulkAttributeKeys.length) ||
            (bulkAttributeKeys.length && !bulkAttributeDefinitions.length)
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
                    clonePoiForSave(poi, {
                        attributes,
                        category: isBulkPoiFieldSelected("category")
                            ? bulkPoiFieldValues.category
                            : poi.category,
                        icon: isBulkPoiFieldSelected("icon")
                            ? bulkPoiFieldValues.icon
                            : poi.icon,
                        color: isBulkPoiFieldSelected("color")
                            ? bulkPoiFieldValues.color
                            : poi.color,
                        public: isBulkPoiFieldSelected("public")
                            ? bulkPoiFieldValues.public
                            : poi.public,
                    }),
                );
                savedPoi.expand = {
                    category:
                        poiCategories.find(
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
                        category: poiCategories.find(
                            (category) => category.id === poi.category,
                        ),
                    };
                }
                allPois = [...imported, ...allPois];
            }
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
        {#if page.data.user}
            <div class="rounded-xl border border-input-border p-4">
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <p class="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
                            {$_("map")} / {$_("edit")}
                        </p>
                        <p class="text-sm text-gray-500">
                            {#if mapInteractionMode}
                                {$_("edit")}
                            {:else}
                                <i class="fa fa-lock mr-2"></i>Ansicht gesperrt
                            {/if}
                        </p>
                    </div>
                    <div class="inline-flex items-center gap-1 rounded-full border border-input-border bg-input-background p-1">
                        <button
                            type="button"
                            class="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                            class:bg-primary={!mapInteractionMode}
                            class:text-white={!mapInteractionMode}
                            aria-label="Locked view"
                            title="Locked view"
                            onclick={() => (mapInteractionMode = false)}
                        >
                            <i class="fa fa-lock"></i>
                        </button>
                        <button
                            type="button"
                            class="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                            class:bg-primary={mapInteractionMode}
                            class:text-white={mapInteractionMode}
                            aria-label={$_("edit")}
                            title={$_("edit")}
                            onclick={() => (mapInteractionMode = true)}
                        >
                            <i class="fa fa-pen"></i>
                        </button>
                    </div>
                </div>
            </div>
        {/if}

        <div class="flex gap-2">
            <Search
                extraClasses="w-full"
                items={[]}
                placeholder={$_("poi-search-placeholder")}
                onupdate={(value) => (searchQuery = value)}
            ></Search>
        </div>

        {#if page.data.user}
            <div class="rounded-xl border border-input-border p-4 space-y-4">
                <Select
                    bind:value={importCategory}
                    label={$_("category")}
                    items={poiCategories.map((category) => ({
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
                <Toggle
                    bind:value={importPublic}
                    label={importPublic ? $_("public") : $_("private")}
                    icon={importPublic ? "globe" : "lock"}
                ></Toggle>
                <Button secondary={true} onclick={openFileBrowser}>
                    {$_("upload-new-file")}
                </Button>
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

        <PoiFilterPanel
            categories={poiCategories}
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
                        <div class="space-y-3">
                            <h3 class="font-semibold">
                                {$_("general")}
                            </h3>
                            <div
                                class="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 md:items-center"
                            >
                                <label
                                    class="inline-flex items-center gap-2 text-sm"
                                >
                                    <input
                                        type="checkbox"
                                        checked={isBulkPoiFieldSelected(
                                            "public",
                                        )}
                                        onchange={(event) =>
                                            toggleBulkPoiField(
                                                "public",
                                                (
                                                    event.currentTarget as HTMLInputElement
                                                ).checked,
                                            )}
                                    />
                                    {$_("overwrite")}
                                </label>
                                <Toggle
                                    value={bulkPoiFieldValues.public}
                                    label={bulkPoiFieldValues.public
                                        ? $_("public")
                                        : $_("private")}
                                    icon={bulkPoiFieldValues.public
                                        ? "globe"
                                        : "lock"}
                                    disabled={!isBulkPoiFieldSelected("public")}
                                    onchange={(value) =>
                                        setBulkPoiFieldValue("public", value)}
                                ></Toggle>
                            </div>
                            <div
                                class="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 md:items-center"
                            >
                                <label
                                    class="inline-flex items-center gap-2 text-sm"
                                >
                                    <input
                                        type="checkbox"
                                        checked={isBulkPoiFieldSelected(
                                            "category",
                                        )}
                                        onchange={(event) =>
                                            toggleBulkPoiField(
                                                "category",
                                                (
                                                    event.currentTarget as HTMLInputElement
                                                ).checked,
                                            )}
                                    />
                                    {$_("overwrite")}
                                </label>
                                <Select
                                    value={bulkPoiFieldValues.category}
                                    label={$_("category")}
                                    disabled={!isBulkPoiFieldSelected(
                                        "category",
                                    )}
                                    items={poiCategories.map((category) => ({
                                        text: category.name,
                                        value: category.id,
                                    }))}
                                    onchange={(value) =>
                                        setBulkPoiFieldValue("category", value)}
                                ></Select>
                            </div>
                            <div
                                class="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 md:items-center"
                            >
                                <label
                                    class="inline-flex items-center gap-2 text-sm"
                                >
                                    <input
                                        type="checkbox"
                                        checked={isBulkPoiFieldSelected("icon")}
                                        onchange={(event) =>
                                            toggleBulkPoiField(
                                                "icon",
                                                (
                                                    event.currentTarget as HTMLInputElement
                                                ).checked,
                                            )}
                                    />
                                    {$_("overwrite")}
                                </label>
                                <Select
                                    value={bulkPoiFieldValues.icon}
                                    label={$_("icon")}
                                    disabled={!isBulkPoiFieldSelected("icon")}
                                    items={poiIconOptions.map((option) => ({
                                        text: $_(option.labelKey),
                                        value: option.value,
                                    }))}
                                    onchange={(value) =>
                                        setBulkPoiFieldValue("icon", value)}
                                ></Select>
                            </div>
                            <div
                                class="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 md:items-center"
                            >
                                <label
                                    class="inline-flex items-center gap-2 text-sm"
                                >
                                    <input
                                        type="checkbox"
                                        checked={isBulkPoiFieldSelected("color")}
                                        onchange={(event) =>
                                            toggleBulkPoiField(
                                                "color",
                                                (
                                                    event.currentTarget as HTMLInputElement
                                                ).checked,
                                            )}
                                    />
                                    {$_("overwrite")}
                                </label>
                                <div>
                                    <label class="text-sm font-medium pb-1">
                                        {$_("color")}
                                    </label>
                                    <div class="flex items-center gap-3">
                                        <input
                                            class="h-10 w-12 rounded-md border border-input-border bg-input-background disabled:opacity-50"
                                            type="color"
                                            value={bulkPoiFieldValues.color}
                                            disabled={!isBulkPoiFieldSelected(
                                                "color",
                                            )}
                                            onchange={(event) =>
                                                setBulkPoiFieldValue(
                                                    "color",
                                                    (
                                                        event.currentTarget as HTMLInputElement
                                                    ).value,
                                                )}
                                        />
                                        <span class="text-sm text-gray-500">
                                            {bulkPoiFieldValues.color}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {#if bulkAttributeDefinitions.length}
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
                            </div>
                        {:else if selectedPoiCategoryIds.length > 1 && !isBulkPoiFieldSelected("category")}
                            <p class="text-sm text-gray-500">
                                {$_("poi-bulk-one-category-only")}
                            </p>
                        {:else}
                            <p class="text-sm text-gray-500">
                                {$_("poi-bulk-no-attributes")}
                            </p>
                        {/if}

                        <Button
                            primary={true}
                            onclick={saveBulkAttributes}
                            disabled={(!bulkPoiFieldKeys.length &&
                                !bulkAttributeKeys.length) ||
                                bulkBusy}
                            loading={bulkSaveBusy}
                        >
                            {$_("apply-to-selection")}
                        </Button>
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
                                    {#each poiAttributeDefinitions.filter((definition) => definition.category === poi.category) as definition}
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
    </div>

    <div id="poi-map">
        <MapWithElevationMaplibre
            fitBounds="instant"
            pois={filteredPois}
            poiAttributeDefinitions={poiAttributeDefinitions}
            caneditpoi={(poi) => page.data.user?.id === poi.author}
            canmovepoi={(poi) =>
                Boolean(page.data.user?.id === poi.author && mapInteractionMode)}
            onpoisave={savePoiAttributes}
            onpoidragend={movePoi}
            onclick={handleMapPoiCreate}
            showElevation={false}
            showTerrain={true}
        ></MapWithElevationMaplibre>
    </div>
</main>

<PoiModal
    bind:this={poiModal}
    poi={editingPoi}
    categories={poiCategories}
    attributeDefinitions={poiAttributeDefinitions}
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
