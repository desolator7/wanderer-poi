<svelte:head>
    <title>Rechtliches &amp; Datenquellen | wanderer</title>
    <meta
        name="description"
        content="Rechtliche Hinweise und Angaben zu den Datenquellen dieses unabhängigen wanderer-POI-Forks."
    />
</svelte:head>

<main class="mx-6 my-12 md:mx-auto md:my-16 max-w-4xl">
    <article class="prose prose-zinc dark:prose-invert max-w-none">
        <h1>Rechtliches &amp; Datenquellen</h1>

        <p>
            Diese Anwendung ist ein unabhängiger, experimenteller Fork von
            wanderer. Sie wird weder von der Harzer Wandernadel GmbH noch von
            anderen Vereinen, Markeninhabern oder Betreibern der genannten
            Points of Interest (POIs) betrieben, beauftragt, unterstützt oder
            verantwortet. Namen und Bezeichnungen dienen ausschließlich der
            Beschreibung und Zuordnung von Orten.
        </p>

        <h2>Bereitgestellter POI-Datenbestand</h2>

        <p>
            Als vorbefüllter POI-Datenbestand wird ausschließlich der aus
            OpenStreetMap abgeleitete Snapshot
            <a href="/data/osm-stamp-points.json"
                ><code>/data/osm-stamp-points.json</code></a
            > bereitgestellt. Er ist kein offizieller Datenbestand der Harzer
            Wandernadel GmbH, eines Vereins oder eines anderen POI-Betreibers.
            Der Snapshot bildet lediglich den Stand der zugrunde liegenden
            OpenStreetMap-Daten zum Zeitpunkt seiner Erstellung ab.
        </p>

        <h2>Datenqualität und Inhalte von Nutzern</h2>

        <p>
            Für Vollständigkeit, Richtigkeit, Aktualität, Verfügbarkeit oder
            Eignung der POI-Daten für einen bestimmten Zweck wird keine
            Zusicherung gegeben. Angaben können fehlen, veraltet oder fehlerhaft
            sein. Vor Ort gelten die tatsächlichen Gegebenheiten, Beschilderungen
            und Hinweise der zuständigen Stellen.
        </p>

        <p>
            Zusätzlich können Nutzer eigene POIs und weitere Inhalte anlegen
            oder vorhandene Angaben bearbeiten. Solche Inhalte stammen von den
            jeweils einstellenden Nutzern. Das Projekt prüft sie nicht
            vollständig und gibt auch für diese Inhalte keine Zusicherung.
        </p>

        <h2>OpenStreetMap und ODbL</h2>

        <p>
            Die im Snapshot enthaltenen Geodaten basieren auf Daten von
            <a href="https://www.openstreetmap.org/copyright"
                >© OpenStreetMap-Mitwirkende</a
            >. Die OpenStreetMap-Daten stehen unter der Open Data Commons Open
            Database License (ODbL) 1.0. Bei Nutzung oder Weitergabe sind die
            jeweils anwendbaren Namensnennungs-, Lizenz- und
            Share-Alike-Bedingungen zu beachten.
        </p>

        <ul>
            <li>
                <a
                    href="https://osmfoundation.org/wiki/Licence/Attribution_Guidelines"
                    >OpenStreetMap: Attribution Guidelines</a
                >
            </li>
            <li>
                <a href="https://opendatacommons.org/licenses/odbl/1-0/"
                    >Open Data Commons: ODbL 1.0</a
                >
            </li>
            <li>
                <a
                    href="https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline"
                    >OpenStreetMap: Substantial Guideline</a
                >
            </li>
        </ul>

        <h2>OpenTopoMap-Kartenkacheln</h2>

        <p>
            Der PWA-Livemodus kann einen kleinen, auf die aktive Route
            begrenzten Offlinecache mit Kartenkacheln von
            <a href="https://www.opentopomap.org/">OpenTopoMap</a> anlegen. Die
            Kartenansicht zeigt die erforderliche Namensnennung für
            OpenTopoMap und OpenStreetMap an. Der öffentliche Dienst wird ohne
            Zusicherung dauerhafter Verfügbarkeit genutzt; seine
            <a href="https://services.opentopomap.org/about/"
                >Nutzungshinweise</a
            > sind zu beachten.
        </p>

        <h2>Flüchtiger Cache für Onlinekarten</h2>

        <p>
            Die Online-Modi des PWA-Livemodus speichern nur Kartenressourcen,
            die während der sichtbaren Nutzung tatsächlich angefordert werden.
            Es werden keine zusätzlichen Gebiete oder Zoomstufen vorgeladen.
            Die Anwendung berücksichtigt auswertbare HTTP-Cachevorgaben; ohne
            auswertbare Laufzeit gilt ein Fallback von sieben Tagen. Der Cache
            ist auf 100 MB begrenzt.
        </p>

        <p>
            Dies gilt automatisch auch für benutzerdefinierte Kartenquellen.
            Instanzbetreiber müssen die Lizenz-, Namensnennungs- und
            Nutzungsbedingungen jeder eingebundenen Quelle selbst prüfen.
            Die technische Möglichkeit zum Zwischenspeichern begründet keine
            Erlaubnis des jeweiligen Anbieters.
        </p>

        <h2>Beschreibende Verwendung und Datenbankrechte</h2>

        <p>
            Die beschreibende Nennung fremder Bezeichnungen begründet keine
            organisatorische oder wirtschaftliche Verbindung. Hinweise zum
            gesetzlichen Rahmen finden sich insbesondere in
            <a href="https://www.gesetze-im-internet.de/markeng/__23.html"
                >§ 23 Markengesetz</a
            >. Bei Entnahme oder Weiterverwendung von Datenbankinhalten können
            außerdem Datenbankrechte zu beachten sein; siehe
            <a href="https://www.gesetze-im-internet.de/urhg/__87b.html"
                >§ 87b Urheberrechtsgesetz</a
            >.
        </p>

        <p class="text-xs opacity-60">Ver. 161.26.013</p>
    </article>
</main>
