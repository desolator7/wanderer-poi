package hooks

import (
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

func TestPrivateAttributesForViewer(t *testing.T) {
	all := map[string]any{
		"user00000000001": map[string]any{"stamped": true},
		"user00000000002": map[string]any{"stamped": false},
	}

	t.Run("regular user receives only own bucket", func(t *testing.T) {
		got, hide := privateAttributesForViewer(all, "user00000000001", false)
		if hide {
			t.Fatal("regular user field should remain visible")
		}
		want := map[string]any{
			"user00000000001": map[string]any{"stamped": true},
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("unexpected filtered attributes: %#v", got)
		}
	})

	t.Run("regular user without values receives empty object", func(t *testing.T) {
		got, hide := privateAttributesForViewer(all, "user00000000003", false)
		if hide {
			t.Fatal("regular user field should remain visible")
		}
		if len(got) != 0 {
			t.Fatalf("expected no attributes, got %#v", got)
		}
	})

	t.Run("superuser retains every bucket", func(t *testing.T) {
		got, hide := privateAttributesForViewer(all, "superuser000001", true)
		if hide {
			t.Fatal("superuser field should remain visible")
		}
		if !reflect.DeepEqual(got, all) {
			t.Fatalf("expected all attributes, got %#v", got)
		}
	})

	t.Run("anonymous response hides the complete field", func(t *testing.T) {
		got, hide := privateAttributesForViewer(all, "", false)
		if !hide {
			t.Fatal("anonymous field should be hidden")
		}
		if got != nil {
			t.Fatalf("anonymous response should not receive data, got %#v", got)
		}
	})
}

func TestBuiltinPoiEndpointRejectsAdminAttributeWrite(t *testing.T) {
	scenario := pbtests.ApiScenario{
		Name:           "regular user changes admin POI attribute",
		Method:         http.MethodPatch,
		URL:            "/api/collections/pois/records/poi000000000001",
		Body:           strings.NewReader(`{"attributes":{"protected":"forged"}}`),
		ExpectedStatus: http.StatusForbidden,
		ExpectedContent: []string{
			`"status":403`,
			"darf nur durch Administratoren",
		},
	}

	scenario.BeforeTestFunc = func(t testing.TB, app *pbtests.TestApp, _ *core.ServeEvent) {
		userCollection := core.NewAuthCollection("poi_test_users")
		if err := app.Save(userCollection); err != nil {
			t.Fatalf("create user collection: %v", err)
		}

		user := core.NewRecord(userCollection)
		user.Id = "user00000000001"
		user.SetEmail("poi-test@example.com")
		user.SetPassword("secure-test-password")
		if err := app.Save(user); err != nil {
			t.Fatalf("create user: %v", err)
		}

		attributeCollection := core.NewBaseCollection("poi_attributes")
		attributeCollection.Fields.Add(&core.TextField{Name: "key", Required: true})
		attributeCollection.Fields.Add(&core.TextField{Name: "type", Required: true})
		attributeCollection.Fields.Add(&core.TextField{Name: "category", Required: true})
		attributeCollection.Fields.Add(&core.TextField{Name: "value_storage", Required: true})
		attributeCollection.Fields.Add(&core.TextField{Name: "public_write_access", Required: true})
		if err := app.Save(attributeCollection); err != nil {
			t.Fatalf("create attribute collection: %v", err)
		}

		definition := core.NewRecord(attributeCollection)
		definition.Set("key", "protected")
		definition.Set("type", "string")
		definition.Set("category", "category0000001")
		definition.Set("value_storage", "public")
		definition.Set("public_write_access", "admin")
		if err := app.Save(definition); err != nil {
			t.Fatalf("create attribute definition: %v", err)
		}

		poiCollection := core.NewBaseCollection("pois")
		poiCollection.UpdateRule = types.Pointer("@request.auth.id != '' && author = @request.auth.id")
		poiCollection.Fields.Add(&core.TextField{Name: "author", Required: true})
		poiCollection.Fields.Add(&core.TextField{Name: "category", Required: true})
		poiCollection.Fields.Add(&core.JSONField{Name: "attributes"})
		poiCollection.Fields.Add(&core.JSONField{Name: poiPrivateAttributesField})
		if err := app.Save(poiCollection); err != nil {
			t.Fatalf("create POI collection: %v", err)
		}

		poi := core.NewRecord(poiCollection)
		poi.Id = "poi000000000001"
		poi.Set("author", user.Id)
		poi.Set("category", "category0000001")
		poi.Set("attributes", map[string]any{"protected": "trusted"})
		poi.Set(poiPrivateAttributesField, map[string]any{})
		if err := app.Save(poi); err != nil {
			t.Fatalf("create POI: %v", err)
		}

		app.OnRecordUpdateRequest("pois").BindFunc(UpdatePoiAttributes)

		token, err := user.NewAuthToken()
		if err != nil {
			t.Fatalf("create auth token: %v", err)
		}
		scenario.Headers = map[string]string{"Authorization": token}
	}

	scenario.AfterTestFunc = func(t testing.TB, app *pbtests.TestApp, _ *http.Response) {
		poi, err := app.FindRecordById("pois", "poi000000000001")
		if err != nil {
			t.Fatalf("reload POI: %v", err)
		}
		attributes, err := readPoiAttributes(poi)
		if err != nil {
			t.Fatalf("read POI attributes: %v", err)
		}
		if attributes["protected"] != "trusted" {
			t.Fatalf("protected attribute changed: %#v", attributes)
		}
	}

	scenario.Test(t)
}
