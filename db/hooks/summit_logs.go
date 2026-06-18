package hooks

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"pocketbase/federation"
	"pocketbase/util"

	pub "github.com/go-ap/activitypub"
	"github.com/meilisearch/meilisearch-go"
	"github.com/pocketbase/pocketbase/core"
)

func CreateSummitLogHandler(client meilisearch.ServiceManager) func(e *core.RecordRequestEvent) error {
	return func(e *core.RecordRequestEvent) error {
		err := e.Next()
		if err != nil {
			return err
		}

		// add local iri
		origin := os.Getenv("ORIGIN")
		if origin == "" {
			return fmt.Errorf("ORIGIN not set")
		}
		if e.Record.GetString("iri") == "" {
			e.Record.Set("iri", fmt.Sprintf("%s/api/v1/summit-log/%s", origin, e.Record.Id))
		}
		err = e.App.UnsafeWithoutHooks().Save(e.Record)
		if err != nil {
			return err
		}

		userActor, err := e.App.FindFirstRecordByData("activitypub_actors", "user", e.Auth.Id)
		if err != nil {
			return err
		}

		ctx, err := util.GetSafeActorContext(e.Request, userActor)
		if err != nil {
			return err
		}

		if err := reindexSummitLogTrails(e.App, e.Record, client); err != nil {
			return err
		}

		err = federation.CreateSummitLogActivity(e.App, ctx, e.Record, pub.CreateType)
		if err != nil {
			return err
		}

		return nil
	}
}

func UpdateSummitLogHandler(client meilisearch.ServiceManager) func(e *core.RecordRequestEvent) error {
	return func(e *core.RecordRequestEvent) error {

		err := e.Next()
		if err != nil {
			return err
		}

		userActor, err := e.App.FindFirstRecordByData("activitypub_actors", "user", e.Auth.Id)
		if err != nil {
			return err
		}

		ctx, err := util.GetSafeActorContext(e.Request, userActor)
		if err != nil {
			return err
		}

		err = federation.CreateSummitLogActivity(e.App, ctx, e.Record, pub.UpdateType)
		if err != nil {
			return err
		}

		if err := reindexSummitLogTrails(e.App, e.Record, client); err != nil {
			return err
		}

		return nil
	}
}

func DeleteSummitLogHandler(client meilisearch.ServiceManager) func(e *core.RecordRequestEvent) error {
	return func(e *core.RecordRequestEvent) error {
		err := e.Next()
		if err != nil {
			return err
		}

		if err := reindexSummitLogTrails(e.App, e.Record, client); err != nil {
			return err
		}

		err = federation.CreateSummitLogDeleteActivity(e.App, e.Record)
		if err != nil {
			return err
		}
		return nil
	}
}

func reindexSummitLogTrails(app core.App, record *core.Record, client meilisearch.ServiceManager) error {
	trailIDs := map[string]bool{}
	if trailID := record.GetString("trail"); trailID != "" {
		trailIDs[trailID] = true
	}
	if original := record.Original(); original != nil {
		if trailID := original.GetString("trail"); trailID != "" {
			trailIDs[trailID] = true
		}
	}

	for trailID := range trailIDs {
		trail, err := app.FindRecordById("trails", trailID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return err
		}
		if err := util.IndexTrails(app, []*core.Record{trail}, client); err != nil {
			return err
		}
	}

	return nil
}
