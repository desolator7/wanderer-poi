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

var testPoiAttributeDefinitions = map[string]poiAttributeDefinition{
	"editable": {
		valueType:         "string",
		valueStorage:      "public",
		publicWriteAccess: "all",
	},
	"protected": {
		valueType:         "string",
		valueStorage:      "public",
		publicWriteAccess: "admin",
	},
	"visited": {
		valueType:         "boolean",
		valueStorage:      "private",
		publicWriteAccess: "all",
	},
	"visit_date": {
		valueType:         "date",
		valueStorage:      "private",
		publicWriteAccess: "all",
	},
}

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

func TestAuthorizePoiAttributeWrite(t *testing.T) {
	tests := []struct {
		name            string
		attributes      map[string]any
		original        map[string]any
		categoryChanged bool
		wantViolation   bool
		wantForbidden   bool
	}{
		{
			name:          "configured public attribute can change",
			attributes:    map[string]any{"editable": "new"},
			original:      map[string]any{"editable": "old"},
			wantViolation: false,
		},
		{
			name:          "admin attribute cannot change",
			attributes:    map[string]any{"protected": "new"},
			original:      map[string]any{"protected": "old"},
			wantViolation: true,
			wantForbidden: true,
		},
		{
			name:          "admin attribute cannot be removed",
			attributes:    map[string]any{},
			original:      map[string]any{"protected": "old"},
			wantViolation: true,
			wantForbidden: true,
		},
		{
			name:          "unchanged admin attribute is preserved",
			attributes:    map[string]any{"protected": "old"},
			original:      map[string]any{"protected": "old"},
			wantViolation: false,
		},
		{
			name:            "admin attribute cannot enter through category change",
			attributes:      map[string]any{"protected": "old"},
			original:        map[string]any{"protected": "old"},
			categoryChanged: true,
			wantViolation:   true,
			wantForbidden:   true,
		},
		{
			name:          "new unknown attribute is rejected",
			attributes:    map[string]any{"rogue": "new"},
			original:      map[string]any{},
			wantViolation: true,
		},
		{
			name:          "unchanged legacy attribute remains readable",
			attributes:    map[string]any{"legacy": "old"},
			original:      map[string]any{"legacy": "old"},
			wantViolation: false,
		},
		{
			name:            "legacy attribute is rejected on category change",
			attributes:      map[string]any{"legacy": "old"},
			original:        map[string]any{"legacy": "old"},
			categoryChanged: true,
			wantViolation:   true,
		},
		{
			name:            "unchanged import metadata survives category change",
			attributes:      map[string]any{"data_source": "OpenStreetMap"},
			original:        map[string]any{"data_source": "OpenStreetMap"},
			categoryChanged: true,
			wantViolation:   false,
		},
		{
			name:          "import metadata cannot change",
			attributes:    map[string]any{"data_source": "forged"},
			original:      map[string]any{"data_source": "OpenStreetMap"},
			wantViolation: true,
			wantForbidden: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			violation := authorizePoiAttributeWrite(
				test.attributes,
				test.original,
				testPoiAttributeDefinitions,
				test.categoryChanged,
			)
			if (violation != nil) != test.wantViolation {
				t.Fatalf("unexpected violation: %#v", violation)
			}
			if violation != nil && violation.forbidden != test.wantForbidden {
				t.Fatalf("unexpected forbidden flag: %#v", violation)
			}
		})
	}
}

func TestValidatePoiAttributeTypes(t *testing.T) {
	tests := []struct {
		name          string
		attributes    map[string]any
		wantViolation bool
	}{
		{
			name:       "valid values",
			attributes: map[string]any{"editable": "text", "visited": true, "visit_date": "2026-08-30"},
		},
		{
			name:       "null value",
			attributes: map[string]any{"visit_date": nil},
		},
		{
			name:          "wrong boolean type",
			attributes:    map[string]any{"visited": "true"},
			wantViolation: true,
		},
		{
			name:          "invalid calendar date",
			attributes:    map[string]any{"visit_date": "2026-02-30"},
			wantViolation: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			violation := validatePoiAttributeTypes(test.attributes, testPoiAttributeDefinitions)
			if (violation != nil) != test.wantViolation {
				t.Fatalf("unexpected violation: %#v", violation)
			}
		})
	}
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
