package migrations

import (
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		origin := strings.TrimRight(os.Getenv("ORIGIN"), "/")
		if origin == "" {
			return fmt.Errorf("ORIGIN not set")
		}

		originURL, err := url.Parse(origin)
		if err != nil || originURL.Scheme == "" || originURL.Host == "" {
			return fmt.Errorf("invalid ORIGIN %q", origin)
		}

		localActors, err := app.FindRecordsByFilter(
			"activitypub_actors",
			"is_local=true",
			"",
			-1,
			0,
		)
		if err != nil {
			return err
		}

		localActorIDs := make(map[string]struct{}, len(localActors))
		for _, actor := range localActors {
			localActorIDs[actor.Id] = struct{}{}

			actorIRI := fmt.Sprintf(
				"%s/api/v1/activitypub/user/%s",
				origin,
				actor.GetString("preferred_username"),
			)
			actor.Set("domain", strings.TrimPrefix(originURL.Hostname(), "www."))
			actor.Set("iri", actorIRI)
			actor.Set("inbox", actorIRI+"/inbox")
			actor.Set("outbox", actorIRI+"/outbox")
			actor.Set("followers", actorIRI+"/followers")
			actor.Set("following", actorIRI+"/following")
			actor.Set("icon", rebaseLocalURL(actor.GetString("icon"), origin))

			if err := app.UnsafeWithoutHooks().Save(actor); err != nil {
				return err
			}
		}

		localResources := []struct {
			collection string
			path       string
		}{
			{collection: "comments", path: "comment"},
			{collection: "lists", path: "list"},
			{collection: "summit_logs", path: "summit-log"},
			{collection: "trails", path: "trail"},
			{collection: "waypoints", path: "waypoint"},
		}

		for _, resource := range localResources {
			records, err := app.FindAllRecords(resource.collection)
			if err != nil {
				return err
			}

			for _, record := range records {
				if _, local := localActorIDs[record.GetString("author")]; !local {
					continue
				}

				record.Set("iri", fmt.Sprintf("%s/api/v1/%s/%s", origin, resource.path, record.Id))
				if err := app.UnsafeWithoutHooks().Save(record); err != nil {
					return err
				}
			}
		}

		return nil
	}, func(app core.App) error {
		return nil
	})
}

func rebaseLocalURL(rawURL, origin string) string {
	if rawURL == "" {
		return ""
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Path == "" {
		return rawURL
	}

	return origin + parsed.EscapedPath()
}
