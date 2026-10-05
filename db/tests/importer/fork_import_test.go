package importer_test

import (
	"context"
	"slices"
	"testing"

	"pocketbase/hooks"
	"pocketbase/plugins/importer"
	"pocketbase/pluginsystem"
	"pocketbase/util"

	"github.com/pocketbase/dbx"
)

func TestForkImportReplayAndUserIsolation(t *testing.T) {
	app, opts := newProviderDifficultyApp(t)
	opts.CreateSummitLogForCompleted = true
	opts.Manifest.ID = "komoot"
	item := pluginsystem.TrailImport{
		Name: "Imported activity", Kind: "completed",
		Source: pluginsystem.TrailImportSource{Provider: "komoot", ExternalID: "shared-source"},
		Track:  providerDifficultyGPX(),
	}
	first, err := importer.ImportTrail(context.Background(), app, item, opts)
	if err != nil {
		t.Fatal(err)
	}
	log, err := util.FindImportedSummitLogForUser(app, opts.UserID, "komoot", "shared-source")
	if err != nil || log == nil {
		t.Fatalf("imported summit log: %v, %v", log, err)
	}
	if log.GetString("gpx") == "" {
		t.Fatal("summit log GPX was not persisted")
	}
	waypoints, err := app.FindRecordsByFilter("waypoints", "trail={:trail}", "", -1, 0, dbx.Params{"trail": first.TrailID})
	if err != nil || len(waypoints) != 2 {
		t.Fatalf("fallback waypoints = %d, error = %v", len(waypoints), err)
	}
	// Replays must skip before attempting to parse a now-invalid provider track.
	item.Track = pluginsystem.Track{Format: "invalid"}
	replay, err := importer.ImportTrail(context.Background(), app, item, opts)
	if err != nil || !replay.Skipped {
		t.Fatalf("replay = %v, error = %v", replay, err)
	}
	other := saveProviderDifficultyRecord(t, app, "users", map[string]any{
		"username": "second", "password": "test-password", "email": "second@example.com",
	})
	actor := saveProviderDifficultyRecord(t, app, "activitypub_actors", map[string]any{
		"username": "second", "preferred_username": "second", "domain": "example.com",
		"user": other.Id, "is_local": true, "public_key": "test-key",
		"iri": "https://example.com/second", "inbox": "https://example.com/second/inbox",
	})
	otherOpts := opts
	otherOpts.UserID, otherOpts.ActorID = other.Id, actor.Id
	item.Track = providerDifficultyGPX()
	second, err := importer.ImportTrail(context.Background(), app, item, otherOpts)
	if err != nil || !second.Created || second.TrailID == first.TrailID {
		t.Fatalf("second user's import = %v, error = %v", second, err)
	}
	if got := providerDifficultyRecordCount(t, app, "summit_logs"); got != 2 {
		t.Fatalf("summit logs = %d, want 2", got)
	}
}

func TestPlannedImportReceivesActivityOnce(t *testing.T) {
	app, opts := newProviderDifficultyApp(t)
	opts.CreateSummitLogForCompleted = true
	item := pluginsystem.TrailImport{
		Name: "Planned route", Kind: "planned",
		Source: pluginsystem.TrailImportSource{Provider: "komoot", ExternalID: "planned-then-recorded"},
		Track:  providerDifficultyGPX(),
	}
	planned, err := importer.ImportTrail(context.Background(), app, item, opts)
	if err != nil {
		t.Fatal(err)
	}
	originalGPX := providerDifficultyTrail(t, app, planned.TrailID).GetString("gpx")
	item.Kind = "completed"
	activity, err := importer.ImportTrail(context.Background(), app, item, opts)
	if err != nil || !activity.Updated || activity.TrailID != planned.TrailID {
		t.Fatalf("activity = %v, error = %v", activity, err)
	}
	trail := providerDifficultyTrail(t, app, planned.TrailID)
	if !trail.GetBool("completed") || trail.GetDateTime("completed_at").IsZero() || trail.GetString("gpx") != originalGPX {
		t.Fatal("completion must preserve the planned geometry and set its completion date")
	}
	replay, err := importer.ImportTrail(context.Background(), app, item, opts)
	if err != nil || !replay.Skipped || providerDifficultyRecordCount(t, app, "summit_logs") != 1 {
		t.Fatalf("activity replay = %v, error = %v", replay, err)
	}
}

func TestMovedAndDeletedImportsStayExcluded(t *testing.T) {
	app, opts := newProviderDifficultyApp(t)
	opts.Manifest.ID = "komoot"
	opts.CreateSummitLogForCompleted = true
	instance := saveProviderDifficultyRecord(t, app, "plugin_instances", map[string]any{
		"user": opts.UserID, "plugin_id": "komoot", "enabled": true, "status": "configured",
		"auth":   map[string]any{"opaque": "keep"},
		"config": map[string]any{"plugin": map[string]any{"after": "2026-01-01"}, "host": map[string]any{"planned": true, "excludedTrailIds": []string{"already-excluded"}}},
	})
	app.OnRecordDelete("trails").BindFunc(hooks.PreserveTrailImportExclusionsHandler())
	item := pluginsystem.TrailImport{
		Name: "Source activity", Kind: "completed",
		Source: pluginsystem.TrailImportSource{Provider: "komoot", ExternalID: "moved-activity"},
		Track:  providerDifficultyGPX(),
	}
	source, err := importer.ImportTrail(context.Background(), app, item, opts)
	if err != nil {
		t.Fatal(err)
	}
	item.Source.ExternalID, item.Kind = "target-route", "planned"
	target, err := importer.ImportTrail(context.Background(), app, item, opts)
	if err != nil {
		t.Fatal(err)
	}
	log, err := util.FindImportedSummitLogForUser(app, opts.UserID, "komoot", "moved-activity")
	if err != nil || log == nil {
		t.Fatal(err)
	}
	log.Set("trail", target.TrailID)
	if err := app.Save(log); err != nil {
		t.Fatal(err)
	}
	if err := app.Delete(providerDifficultyTrail(t, app, source.TrailID)); err != nil {
		t.Fatal(err)
	}
	instance, err = app.FindRecordById("plugin_instances", instance.Id)
	if err != nil {
		t.Fatal(err)
	}
	var config map[string]any
	if err := instance.UnmarshalJSONField("config", &config); err != nil {
		t.Fatal(err)
	}
	host := config["host"].(map[string]any)
	exclusions := util.ImportExclusionIDs(host["excludedTrailIds"])
	if !slices.Contains(exclusions, "moved-activity") || !slices.Contains(exclusions, "already-excluded") || config["plugin"].(map[string]any)["after"] != "2026-01-01" {
		t.Fatalf("config was not preserved: %v", config)
	}
	item.Source.ExternalID, item.Kind = "moved-activity", "completed"
	item.Track = pluginsystem.Track{Format: "invalid"}
	replay, err := importer.ImportTrail(context.Background(), app, item, opts)
	if err != nil || !replay.Skipped || replay.TrailID != target.TrailID {
		t.Fatalf("moved log replay = %v, error = %v", replay, err)
	}
	// Exclusion also protects the source after the assigned log is deleted.
	if err := app.Delete(log); err != nil {
		t.Fatal(err)
	}
	opts.ExcludedTrailIDs = exclusions
	replay, err = importer.ImportTrail(context.Background(), app, item, opts)
	if err != nil || !replay.Skipped || replay.Created {
		t.Fatalf("excluded replay = %v, error = %v", replay, err)
	}
	if got := providerDifficultyRecordCount(t, app, "trails"); got != 1 {
		t.Fatalf("trail count = %d, want 1", got)
	}
}
