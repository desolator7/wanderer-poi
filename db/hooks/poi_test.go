package hooks

import (
	"reflect"
	"testing"
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
