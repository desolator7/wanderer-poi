package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("goeo2ubp103rzp9")
		if err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(9, []byte(`{
			"hidden": false,
			"id": "wpconnmode001",
			"maxSelect": 1,
			"name": "connectionMode",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"snap",
				"straight",
				"original-kml"
			]
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("goeo2ubp103rzp9")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("wpconnmode001")

		return app.Save(collection)
	})
}
