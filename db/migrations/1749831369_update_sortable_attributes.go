package migrations

import (
	"os"

	"github.com/meilisearch/meilisearch-go"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	client := meilisearch.New(os.Getenv("MEILI_URL"), meilisearch.WithAPIKey(os.Getenv("MEILI_MASTER_KEY")))

	m.Register(func(app core.App) error {

		_, err := client.Index("trails").UpdateSortableAttributes(&[]string{
			"created", "date", "difficulty", "distance", "elevation_gain", "elevation_loss", "name", "duration", "author", "like_count",
		})
		if err != nil {
			return err
		}

		_, err = client.Index("trails").UpdateFilterableAttributes(&[]any{
			"id", "_geo", "author", "category", "completed", "completed_by", "date", "difficulty", "distance", "elevation_gain", "elevation_loss", "likes", "public", "shares", "tags", "min_lat", "max_lat", "min_lon", "max_lon", "bounding_box_diagonal",
		})

		return err
	}, func(app core.App) error {
		_, err := client.Index("trails").UpdateSortableAttributes(&[]string{
			"created", "date", "difficulty", "distance", "elevation_gain", "elevation_loss", "name", "duration", "author",
		})
		if err != nil {
			return err
		}

		_, err = client.Index("trails").UpdateFilterableAttributes(&[]any{
			"id", "_geo", "author", "category", "completed", "completed_by", "date", "difficulty", "distance", "elevation_gain", "elevation_loss", "public", "shares", "tags", "min_lat", "max_lat", "min_lon", "max_lon", "bounding_box_diagonal",
		})

		return err
	})
}
