package routes

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/router"
)

func TestTrailExternalReferencesRestrictsSourcesToOwner(t *testing.T) {
	app, err := pbtests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	collections := map[string]*core.Collection{}
	for name, fields := range map[string][]string{
		"activitypub_actors":       {"user"},
		"trails":                   {"author"},
		"trail_external_reference": {"trail", "user", "provider", "external_id"},
	} {
		collection := core.NewBaseCollection(name)
		for _, field := range fields {
			collection.Fields.Add(&core.TextField{Name: field})
		}
		if err := app.Save(collection); err != nil {
			t.Fatal(err)
		}
		collections[name] = collection
	}
	save := func(name string, values map[string]string) *core.Record {
		t.Helper()
		record := core.NewRecord(collections[name])
		for key, value := range values {
			record.Set(key, value)
		}
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		return record
	}
	user := core.NewRecord(core.NewAuthCollection("users"))
	user.Id = "owneruser0000001"
	ownerActor := save("activitypub_actors", map[string]string{"user": user.Id})
	foreignActor := save("activitypub_actors", map[string]string{"user": "otheruser0000001"})
	own := save("trails", map[string]string{"author": ownerActor.Id})
	foreign := save("trails", map[string]string{"author": foreignActor.Id})
	save("trail_external_reference", map[string]string{"trail": own.Id, "user": user.Id, "provider": "komoot", "external_id": "own-source"})
	save("trail_external_reference", map[string]string{"trail": own.Id, "user": "otheruser0000001", "provider": "komoot", "external_id": "foreign-source"})

	for _, tc := range []struct {
		name   string
		auth   *core.Record
		trail  string
		status int
	}{
		{"anonymous", nil, own.Id, 401},
		{"foreign trail", user, foreign.Id, 404},
		{"missing trail", user, "missing00000001", 404},
		{"own trail", user, own.Id, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			e := &core.RequestEvent{App: app, Auth: tc.auth}
			e.Request = httptest.NewRequest("GET", "/trail/"+tc.trail+"/external-references", nil)
			e.Request.SetPathValue("id", tc.trail)
			e.Response = recorder
			err := TrailExternalReferences(e)
			if tc.status != 200 {
				var apiErr *router.ApiError
				if !errors.As(err, &apiErr) || apiErr.Status != tc.status {
					t.Fatalf("expected status %d, got %v", tc.status, err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var items []map[string]string
			if err := json.Unmarshal(recorder.Body.Bytes(), &items); err != nil {
				t.Fatal(err)
			}
			if len(items) != 1 || items[0]["provider"] != "komoot" || items[0]["external_id"] != "own-source" || len(items[0]) != 2 {
				t.Fatalf("unexpected sources: %v", items)
			}
		})
	}
}
