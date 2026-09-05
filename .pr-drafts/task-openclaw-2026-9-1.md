Arbeite auf dem Branch fix/openclaw-2026-9-1, der von main abzweigt. Prüfe zuerst
mit `git branch --show-current`, dass du dort stehst. Nichts aus
feature/git-integration wird hierher gezogen. Der eine Commit, der schon darauf
liegt, behebt zwei Stack-Fehler und ist keine Feature-Arbeit.

Der ausgelieferte Stack ist für jeden Neuinstallierenden kaputt. Beobachtet am
2026-09-05 bei einem vollständigen Kaltstart (cleanup.sh, build.sh --no-cache,
start.sh): start.sh hängt unbegrenzt nach "Claude CLI: login complete." Ein
Einmal-Container mit `openclaw models auth login --provider anthropic --method
cli` kommt nie zurück und zeigt im Log:

  OpenClaw config is invalid
    - openclaw.json:3 — agents.defaults: Unrecognized key: "cliBackends"
  Legacy config keys detected:
    - agents.defaults.cliBackends: CLI backend adapters now register through plugins
    - gateway.controlUi.dangerouslyDisableDeviceAuth: retired and ignored

Ursache: ghcr.io/openclaw/openclaw:latest liefert jetzt OpenClaw 2026.9.1, das
beide Schlüssel nicht mehr annimmt. config/scripts/start/openclaw.sh schreibt sie
weiterhin — Zeile 260 (dangerouslyDisableDeviceAuth), 281-283 (cliBackends), 435
(Ausgabe). Diese Zeilen stammen vom 6. und 9. Juni 2026; sie sind erst durch das
Image-Update falsch geworden, nicht vorher, und die Git-Integration hat damit
nichts zu tun.

Zwei Dinge sind zu beheben, und das zweite ist das wichtigere:

1. Die zurückgezogenen Schlüssel nicht mehr schreiben. cliBackends ist laut
   Meldung nach Plugins gewandert; ermittle aus der installierten
   OpenClaw-Version, wie ein CLI-Backend jetzt registriert wird, statt zu raten.
   dangerouslyDisableDeviceAuth ist ersatzlos zurückgezogen. Prüfe auch, ob
   weitere geschriebene Schlüssel betroffen sind — "openclaw config validate"
   und "openclaw doctor" melden sie.

2. Kein Startschritt darf unbegrenzt hängen. Der Aufruf lief in eine interaktive
   Maske und wartete auf eine Eingabe, die nie kommt, weil kein stdin
   angeschlossen ist. config/scripts/start/git.sh hat einen with_timeout-Helfer;
   die claude_cli-Aufrufe brauchen dasselbe, mit einer Warnung statt eines
   Hangs. Ein Start, der ewig steht, ist schlimmer als einer, der eine Funktion
   abwählt und es sagt. Betroffen sind mindestens die Registrierung des
   Auth-Profils und die beiden mcp-Aufrufe.

3. NACHGETRAGEN am 2026-09-05, 17:00 — dritter Bruch aus derselben Image-Bewegung,
   und der einzige, der die Oberfläche unerreichbar macht. http://openclaw.localhost:8888
   antwortet mit HTTP-JSON statt der UI:

     {"error":{"message":"Proxy client attribution is required. Configure
      gateway.trustedProxies narrowly and make the proxy overwrite or safely
      rebuild forwarded client headers.","type":"proxy_attribution_required"}}

   Zwei Bedingungen, und wir erfüllen beide nicht. config/scripts/start/openclaw.sh
   Zeile 265 schreibt trustedProxies als drei RFC1918-Bereiche plus Loopback —
   nicht "narrowly". Und config/nginx/templates/nginx.conf setzt an drei Stellen
   `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, was den
   eingehenden Header ERGÄNZT statt ihn zu überschreiben: Ein Client kann damit
   einen falschen ersten Hop einschleusen. Das ist eine echte Spoofing-Fläche,
   unabhängig von OpenClaws Meldung.

   Das Netz führt 172.18.0.0/16, der Proxy liegt auf 172.18.0.21 — dynamisch, also
   nach jedem Neuerzeugen anders. compose.yml deklariert kein Subnetz. Für ein
   enges trustedProxies gibt es daher drei Wege, und die Wahl gehört begründet:
   das Subnetz beim Start auslesen; ein festes Subnetz plus feste Proxy-Adresse in
   compose.yml; oder die Adresse nach `docker compose up` nachtragen. Prüfe
   zuerst, ob das Überschreiben des X-Forwarded-For allein schon genügt — die
   Meldung nennt zwei Bedingungen, aber es ist unbekannt, ob beide geprüft werden.
   Nicht raten: ausprobieren und das Ergebnis aufschreiben.

Nicht anfassen: alles unter tests/ (existiert auf diesem Branch nicht), die
Git-Integration, .env, und .pr-drafts/ (ungetrackt und hier nicht ignoriert —
niemals `git add -A`, immer gezielt `git add <datei>`).

Abnahme, weil es auf diesem Branch keine Testsuite gibt: ein vollständiger
Kaltstart (cleanup.sh, build.sh --no-cache, start.sh) läuft ohne Hänger durch,
"openclaw config validate" meldet die Konfiguration als gültig, und
"docker compose ps" zeigt jeden Dienst laufend und keinen im Neustart. Achte auf
den Unterschied zwischen State und Status: ein Container kann "running" und
gleichzeitig "(unhealthy)" sein.

Schreibe deinen Abschlussbericht in eine Datei — .pr-drafts/RESULT-<aufgabe>.md —
und nicht nur in den Chat: was du gefunden hast, was du geändert hast, was du
bewusst gelassen hast, und wie du es geprüft hast. Eine andere Sitzung soll daran
anknüpfen können, ohne dass jemand einen Chatverlauf kopiert.

Halte fest, was du geändert hast und warum — dieser Branch hat keine
Dokumentationsstruktur, also in die Commit-Nachricht, und ausführlich genug,
dass ein Reviewer die Ursache versteht, ohne den Vorfall miterlebt zu haben.
