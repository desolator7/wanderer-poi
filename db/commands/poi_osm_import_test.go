package commands

import (
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"
)

func TestExtractPoiNumber(t *testing.T) {
	cases := map[string]string{
		"HWN001 Eckertalsperre": "001",
		"HWN 036 Peterstein":    "036",
		"069 – Sonnenklippe":    "069",
		"222 - Wettelrode":      "222",
	}
	for name, want := range cases {
		got, err := extractPoiNumber(name)
		if err != nil {
			t.Fatalf("extract %q: %v", name, err)
		}
		if got != want {
			t.Fatalf("extract %q: got %q, want %q", name, got, want)
		}
	}

	if _, err := extractPoiNumber("Unnumbered POI"); err == nil {
		t.Fatal("expected an unnumbered POI to be rejected")
	}
}

func TestPlanOSMStampImportUpdatesInPlaceAndInsertsWinter069(t *testing.T) {
	manifest := testOSMStampManifest()
	existing := testExistingStampPois()
	original := append([]existingStampPoi(nil), existing...)

	plan, err := planOSMStampImport(manifest, existing)
	if err != nil {
		t.Fatalf("plan import: %v", err)
	}
	if len(plan.Updates) != 222 {
		t.Fatalf("got %d updates, want 222", len(plan.Updates))
	}
	if plan.Insert == nil {
		t.Fatal("expected winter POI 069 insert")
	}

	for index := range existing {
		if existing[index].ID != original[index].ID ||
			existing[index].Author != original[index].Author ||
			existing[index].Public != original[index].Public ||
			existing[index].Category != original[index].Category ||
			existing[index].Color != original[index].Color ||
			!reflect.DeepEqual(existing[index].PrivateAttributes, original[index].PrivateAttributes) {
			t.Fatalf("planning mutated preserved fields for POI %s", existing[index].ID)
		}
	}

	regular069 := existing[68]
	if !reflect.DeepEqual(plan.Insert.Template.PrivateAttributes, regular069.PrivateAttributes) {
		t.Fatal("winter POI 069 does not clone the regular POI private values")
	}
	if plan.Insert.Template.Author != regular069.Author ||
		plan.Insert.Template.Category != regular069.Category ||
		plan.Insert.Template.Color != regular069.Color ||
		plan.Insert.Template.Public != regular069.Public {
		t.Fatal("winter POI 069 does not preserve the regular POI ownership or style")
	}
	if plan.Insert.Desired.Description != "Stempelstelle (Winter)" {
		t.Fatalf("unexpected winter description %q", plan.Insert.Desired.Description)
	}
}

func TestPlanOSMStampImportIsIdempotent(t *testing.T) {
	manifest := testOSMStampManifest()
	existing := testExistingStampPois()
	firstPlan, err := planOSMStampImport(manifest, existing)
	if err != nil {
		t.Fatalf("first plan: %v", err)
	}

	byID := make(map[string]*existingStampPoi, len(existing))
	for index := range existing {
		byID[existing[index].ID] = &existing[index]
	}
	for _, update := range firstPlan.Updates {
		applyDesiredToState(byID[update.ID], update.Desired)
	}
	winter := firstPlan.Insert.Template
	winter.ID = "winter069000001"
	applyDesiredToState(&winter, firstPlan.Insert.Desired)
	existing = append(existing, winter)

	secondPlan, err := planOSMStampImport(manifest, existing)
	if err != nil {
		t.Fatalf("second plan: %v", err)
	}
	if len(secondPlan.Updates) != 0 || secondPlan.Insert != nil {
		t.Fatalf(
			"expected no second-run changes, got %d updates and insert=%t",
			len(secondPlan.Updates),
			secondPlan.Insert != nil,
		)
	}
}

func TestOSMStampImportTransactionRollsBack(t *testing.T) {
	app, err := pbtests.NewTestApp()
	if err != nil {
		t.Fatalf("create test app: %v", err)
	}
	t.Cleanup(app.Cleanup)

	categoryCollection := core.NewBaseCollection("poi_categories")
	categoryCollection.Fields.Add(&core.TextField{Name: "name", Required: true})
	categoryCollection.Fields.Add(&core.TextField{Name: "description"})
	if err := app.Save(categoryCollection); err != nil {
		t.Fatalf("create category collection: %v", err)
	}

	poiCollection := core.NewBaseCollection("pois")
	poiCollection.Fields.Add(&core.TextField{Name: "name", Required: true})
	poiCollection.Fields.Add(&core.TextField{Name: "description"})
	poiCollection.Fields.Add(&core.TextField{Name: "location"})
	poiCollection.Fields.Add(&core.NumberField{Name: "lat"})
	poiCollection.Fields.Add(&core.NumberField{Name: "lon"})
	poiCollection.Fields.Add(&core.BoolField{Name: "public"})
	poiCollection.Fields.Add(&core.TextField{Name: "category"})
	poiCollection.Fields.Add(&core.TextField{Name: "author"})
	poiCollection.Fields.Add(&core.TextField{Name: "icon"})
	poiCollection.Fields.Add(&core.TextField{Name: "color"})
	poiCollection.Fields.Add(&core.JSONField{Name: "attributes"})
	poiCollection.Fields.Add(&core.JSONField{Name: "private_attributes"})
	if err := app.Save(poiCollection); err != nil {
		t.Fatalf("create POI collection: %v", err)
	}

	category := core.NewRecord(categoryCollection)
	category.Set("name", "Old category")
	category.Set("description", "Old description")
	if err := app.Save(category); err != nil {
		t.Fatalf("create category: %v", err)
	}

	poi := core.NewRecord(poiCollection)
	poi.Set("name", "HWN069 Old name")
	poi.Set("description", "Old description")
	poi.Set("category", category.Id)
	poi.Set("author", "user00000000001")
	poi.Set("icon", "stamp")
	poi.Set("color", "#6B7280")
	poi.Set("public", true)
	poi.Set("attributes", map[string]any{})
	poi.Set("private_attributes", map[string]any{
		"user00000000001": map[string]any{"gestempelt": true},
	})
	if err := app.Save(poi); err != nil {
		t.Fatalf("create POI: %v", err)
	}

	template, err := existingStampPoiFromRecord(poi)
	if err != nil {
		t.Fatalf("read POI state: %v", err)
	}
	plan := &osmStampImportPlan{
		CategoryNeedsUpdate: true,
		Updates: []stampPoiUpdate{{
			ID: poi.Id,
			Desired: desiredStampPoi{
				Name:       "069 – New regular name",
				Attributes: map[string]any{"data_source": "OpenStreetMap"},
			},
		}},
		Insert: &stampPoiInsert{
			Template: template,
			Desired: desiredStampPoi{
				Name:       "069 – New winter name",
				Attributes: map[string]any{"data_source": "OpenStreetMap"},
			},
		},
	}

	forcedFailure := errors.New("forced failure")
	err = app.RunInTransaction(func(txApp core.App) error {
		if err := applyOSMStampImportPlan(txApp, plan, category.Id); err != nil {
			return err
		}
		return forcedFailure
	})
	if !errors.Is(err, forcedFailure) {
		t.Fatalf("expected forced failure, got %v", err)
	}

	reloadedCategory, err := app.FindRecordById("poi_categories", category.Id)
	if err != nil {
		t.Fatalf("reload category: %v", err)
	}
	if reloadedCategory.GetString("name") != "Old category" {
		t.Fatalf("category update was not rolled back: %q", reloadedCategory.GetString("name"))
	}
	reloadedPoi, err := app.FindRecordById("pois", poi.Id)
	if err != nil {
		t.Fatalf("reload POI: %v", err)
	}
	if reloadedPoi.GetString("name") != "HWN069 Old name" {
		t.Fatalf("POI update was not rolled back: %q", reloadedPoi.GetString("name"))
	}
	pois, err := app.FindAllRecords("pois")
	if err != nil {
		t.Fatalf("list POIs: %v", err)
	}
	if len(pois) != 1 {
		t.Fatalf("POI insert was not rolled back: got %d records", len(pois))
	}
}

func testOSMStampManifest() *osmStampManifest {
	manifest := &osmStampManifest{}
	for number := 1; number <= 222; number++ {
		key := fmt.Sprintf("%03d", number)
		if number == 69 {
			regular := osmStampRegularSeason
			winter := osmStampWinterSeason
			manifest.Points = append(
				manifest.Points,
				testOSMStampPoint(key, int64(100000+number), &regular),
				testOSMStampPoint(key, int64(200000+number), &winter),
			)
			continue
		}
		manifest.Points = append(
			manifest.Points,
			testOSMStampPoint(key, int64(100000+number), nil),
		)
	}
	return manifest
}

func testOSMStampPoint(number string, id int64, season *string) osmStampPoint {
	name := fmt.Sprintf("%s – Test point", number)
	if season != nil {
		if *season == osmStampWinterSeason {
			name += " Winter"
		} else {
			name += " Sommer"
		}
	}
	return osmStampPoint{
		Number: number,
		Name:   name,
		Coordinates: osmStampCoordinates{
			Latitude:  51.0 + float64(id)/10000000,
			Longitude: 10.0 + float64(id)/10000000,
		},
		Season: season,
		OSM: osmStampElement{
			Type:      "node",
			ID:        id,
			Version:   2,
			Timestamp: "2026-08-23T09:00:00Z",
		},
	}
}

func testExistingStampPois() []existingStampPoi {
	result := make([]existingStampPoi, 0, 222)
	for number := 1; number <= 222; number++ {
		result = append(result, existingStampPoi{
			ID:          fmt.Sprintf("poi%012d", number),
			Name:        fmt.Sprintf("HWN%03d Old name", number),
			Description: "Old description",
			Location:    "Old location",
			Latitude:    50,
			Longitude:   10,
			Public:      true,
			Category:    "category0000001",
			Author:      "user00000000001",
			Icon:        "stamp",
			Color:       "#6B7280",
			Attributes:  map[string]any{},
			PrivateAttributes: map[string]any{
				"user00000000001": map[string]any{
					"gestempelt":   number%2 == 0,
					"stempeldatum": nil,
				},
			},
		})
	}
	return result
}

func applyDesiredToState(state *existingStampPoi, desired desiredStampPoi) {
	state.Name = desired.Name
	state.Description = desired.Description
	state.Location = desired.Location
	state.Latitude = desired.Latitude
	state.Longitude = desired.Longitude
	state.Attributes = cloneAnyMap(desired.Attributes)
}
