# Timetable Translator — Drehbuch für die 8-Minuten-Demo

Das Drehbuch ist auf Deutsch, weil die Demo auf Deutsch gezeigt wird. Die Oberfläche ist englisch wie bei den Schwester-Prototypen; Knöpfe und Anzeigen stehen deshalb **fett und englisch**, so wie sie auf dem Bildschirm erscheinen. Die Fahrgastmeldungen, die der Agent entwirft, stehen zuerst auf Deutsch, dann auf Englisch.

**Publikum:** Fahrgastinformation, Betriebsführung und IT eines Eisenbahnunternehmens; später weitere Kunden. **Ziel:** Nach acht Minuten soll das Publikum einen Satz wiederholen können: *„Die KI hält keinen eigenen Fahrplan. Sie übersetzt zwischen Betriebsfahrplan und Kundenfahrplan, findet die Widersprüche, zählt, wer falsch informiert handeln würde und wann, und schlägt vor. Entscheiden und veröffentlichen tut ein Mensch.“*

**Empfohlener Lauf:** Szenario 1, **Platform change**, im Modus **Live agent** auf **Sonnet 5.5**, aber nur, wenn die Live-Probe am selben Tag auf demselben Netz sauber durchlief. Die Geschichte: Ein Funkspruch vom Bahnsteig sagt, ICE 618 nach Hamburg fahre wegen einer Weichenstörung heute von Gleis 7, die App zeige aber Gleis 5. Der Agent findet die Gleisänderung in der Quelle, vermutet zuerst, nur die App hänge hinterher, liest dann die übrigen Kanäle und das Stellwerk und **korrigiert sich vor dem Publikum**: Alle Kanäle zeigen noch Gleis 5, auch Anzeiger und Ansagen. Dazu steht der Zug auf Gleis 7 einen Abschnitt weiter, die erste Klasse hält in F–G statt G–H. Ausgangslage: **312 von 312** Einsteigenden würden falsch informiert handeln, die ersten in **14 Minuten** (Abfahrt 07:42). Diese Zahlen rechnet die Engine aus der Quelle und sind in jedem Lauf gleich. Die Zahlen der Optionen hängen davon ab, welche drei Varianten der Agent rechnen lässt; in der Simulation lässt Option A noch 90 Fahrgäste falsch informiert, bringt alle Kanäle nach 8 Minuten mit der Quelle in Einklang und hinterlässt keinen handgepflegten Wert.

**Alternativen:** Szenario 3, **Betriebshalt as a stop**, trifft die Frage nach Informationstiefe und Informationsart am genauesten: Ein Betriebshalt steht zu Recht im Betriebsfahrplan, eine Umsetzungsregel macht daraus fälschlich einen Fahrgasthalt. Szenario 6, **Construction order**, zeigt die Grenze zum Betrieb: Ein Anschluss in Dortmund bricht, und der Agent bittet die Disposition um Wartezeit, entscheidet aber nicht selbst. Szenario 2, **Diversion via Essen**, hat die größten Zahlen.

**Rückfallebene:** dasselbe Szenario im Modus **Simulation** bei ×1 (bei Zeitdruck ×2). Gleiche Oberfläche, überall als SIMULATION gekennzeichnet, ohne Schlüssel und ohne Netz.

---

## Pre-flight (30 Minuten vorher, auf dem Präsentationsrechner und im Präsentationsnetz)

1. Die Seite in Chrome oder Edge öffnen und hart neu laden (**Strg + Umschalt + R**). Beim ersten Besuch öffnet sich das Fenster **How the Timetable Translator works** von selbst; schließen. Andere Tabs schließen, Benachrichtigungen aus, Netzteil an, Ruhezustand aus.
2. **Diagnostics → Run all tests** klicken. Alle drei Zeilen (**Anthropic API**, **World data integrity**, **Key and privacy**) müssen bestehen, die Fußzeile zeigt **Timetable Translator 1.0.0**. Fällt die Zeile **Anthropic API** durch, blockiert das Netz den einzigen Dienst, den der Live-Modus braucht: Hotspot probieren oder gleich die Simulation planen.
3. Eine vollständige **Live**-Probe von Szenario 1 fahren. Dabei den Schlüssel eingeben (**Start agent** → Karte **Live agent** → **Continue with my API key** → einfügen → **Check key and continue**). Am Ende zeigt die letzte Zeile der Konsole die **Run facts**: Dauer, Werkzeugaufrufe, Kosten. Dauer und Kosten notieren, dann **Reset**. **Diesen Tab offen lassen**, der Schlüssel lebt nur in diesem Tab.
4. Die **Simulation** desselben Szenarios einmal bei ×4 laufen lassen, um den Ablauf im Kopf zu haben. **Reset**.
5. Bühne einrichten: Szenario-Menü → **Platform change**, Modell → **Sonnet 5.5**, in der Konsole **Larger text** an, Browser im Vollbild (**F11**). Die Statusanzeige zeigt **Idle**, der Spiegel zeigt ICE 618.
6. Handy-Hotspot bereithalten. Den Schlüssel nie auf dem Beamer, im Chat oder auf Folien zeigen.

## Die acht Minuten im Überblick

| Zeit | Abschnitt | Auf dem Bildschirm |
|---|---|---|
| 0:00–0:45 | Einstieg: zwei Fahrpläne, eine Wahrheit | Ruhender Arbeitsbereich: der Fahrplanspiegel für ICE 618, leere Kennzahlen |
| 0:45–1:15 | Modus wählen | Dialog **How should the agent run?** |
| 1:15–5:00 | Der Lauf | Konsole, Spiegel und Kennzahlen füllen sich; die Optionen öffnen sich in der Schublade |
| 5:00–7:00 | Entscheidung, Outbox, Zusammenfassung | Freigabe, Entwürfe, Management Summary, Audit-Export |
| 7:00–8:00 | Was-wäre-wenn aus dem Publikum, Schluss | Eigene Frage aus dem Raum (nur live) |

---

## 1. Einstieg (0:00–0:45)

Auf dem Bildschirm: der Fahrplanspiegel. Oben der Streckenstreifen Köln – Dortmund, darunter links der **Betriebsfahrplan** (jede Betriebsstelle, Zehntelminuten, Gleise) und rechts der **Kundenfahrplan**, wie ihn die Kanäle veröffentlicht haben. Die Linien dazwischen zeigen, welche veröffentlichte Zeile aus welcher Zeile der Quelle abgeleitet ist. Die Kopfzeile nennt die Stände: **Source v2 (OPS-05, 07:21) · Planner v1 · Displays v1 · Announcements v1 · Coach order v1**.

> „Sie kennen das Bild: Der Betriebsfahrplan ist die eine Quelle der Wahrheit. Der Kundenfahrplan wird daraus erzeugt, mit weniger Tiefe und in anderer Form: ganze Minuten statt Zehntel, Fahrgasthalte statt Betriebsstellen, Gleise, Wagenreihung. Links sehen Sie die Quelle für ICE 618, rechts, was die Kanäle daraus gemacht haben. Wer genau hinsieht, sieht es schon: links Gleis 7, rechts Gleis 5.“

> „Die Frage war: Wie kann KI die beiden Fahrpläne besser synchron halten, ohne selbst zur zweiten Quelle der Fahrplanwahrheit zu werden? Unsere Antwort ist ein Übersetzer. Er hält keinen eigenen Fahrplan, er führt jede Angabe auf die Quelle zurück, leitet Fahrgastinformation aus betrieblichen Änderungen ab und meldet Widersprüche. Schauen wir ihm eine Minute zu.“

Falls das Publikum die Farben braucht, ein Satz:

> „Burgund sind Sie, Violett ist die KI. Rot, Amber und Grün sind der Zustand der Fahrgastinformation: widerspricht der Quelle, informiert aber Daten noch hinten, wieder im Einklang.“

## 2. Modus wählen (0:45–1:15)

**Start agent** klicken. Der Dialog **How should the agent run?** öffnet sich.

> „Zwei ehrliche Modi. Die Simulation ist eine gekennzeichnete Wiederholung für Proben, kostenlos und offline. Live ist echt: Claude denkt mit echten Werkzeugaufrufen, auf meinem eigenen API-Schlüssel. Wir gehen live.“

Auf der Karte **Live agent** auf **Use my key (sk-ant-…)** klicken (der Schlüssel ist seit der Probe in diesem Tab). Auf die Kopfzeile zeigen: Abzeichen **LIVE** und **You are interacting with an AI system**.

> „Der Schlüssel bleibt in diesem Browser-Tab und geht nur an Anthropic. Der Browser selbst verhindert, dass die Seite mit irgendeinem anderen Server spricht. Es gibt kein Backend, keine Kundendaten, kein Integrationsprojekt.“

## 3. Der Lauf (1:15–5:00)

Erzählen, was die Konsole zeigt, nicht vorlesen. Links steht, worauf man achtet, rechts, was man sagt. Ein Live-Lauf formuliert anders als die Simulation; die Momente sind dieselben.

| Moment in der Konsole | Sie sagen |
|---|---|
| **Phase: Scanning.** Die erste Zeile gibt den Funkspruch wieder und sagt, dass ein Funkspruch keine Quelle ist | „So kommen Störungen an: als Funkspruch, als Chat-Nachricht, als Beschwerde. Der Agent behandelt das als Hinweis, nicht als Tatsache.“ |
| `ops_list_changes`: OPS-05, 07:21, Gleiswechsel wegen Weichenstörung W 32, Quellstand 2 | „Erster Blick ins Betriebsprotokoll: Die Änderung ist da, eingetragen vom Fahrdienstleiter um 07:21. Das ist Version 2 des Zuges.“ |
| `kfp_get_published` für den Reiseplaner; **Hypothesis:** nur App und Reiseplaner hängen bei Version 1 | „Seine erste Vermutung: Die App wurde um 05:30 erzeugt, die Änderung kam weniger als 30 Minuten vor Abfahrt, also hat sie keiner veröffentlicht.“ |
| `sim_sync`, die Kachel **Passengers at risk** zeigt amber **8 of 312, partial scope** | „Die Engine rechnet die erste Schätzung: Wenn nur die App falsch ist, würden Anzeiger und Ansagen am Bahnsteig fast alle richtig leiten, acht Fahrgäste blieben übrig. Die Kachel sagt ehrlich: Teilumfang. Ein fauler Analyst würde hier aufhören.“ |
| **Phase: Verifying.** `kfp_get_published` für alle Kanäle, `ops_get_timetable`, `phys_observe` am Kölner Hauptbahnhof; im Streckenstreifen bekommt Köln die Sensormarke | „Jetzt prüft er gegen die übrigen Kanäle und gegen die physische Welt: Weichendiagnose und Stellwerk. W 32 ist seit 07:12 gestört, um 07:24 hat das Stellwerk die Fahrstraße aus Gleis 7 eingestellt.“ |
| **Revised: only the app is behind → every channel is behind** | „Achten Sie darauf: Er korrigiert sich öffentlich. Nicht nur die App, alle Kanäle sind bei Version 1, auch Anzeiger und Ansagen. Der Bahnsteig würde niemanden retten.“ |
| **Alert card** mit **Checked in this run:**; im Spiegel wird die Zeile Köln Hbf rot, mit dem Etikett **Platform 312** | „Erst jetzt, mit Quelle, veröffentlichter Sicht und Sensorbefund, gibt er eine verifizierte Meldung aus. Die letzte Zeile listet, was in diesem Lauf tatsächlich geprüft wurde, aus den Werkzeugergebnissen, nicht aus seinen Worten.“ |

**Brücke zum Whitepaper**, an dieser Stelle in einem Satz:

> „Das ist der Gedanke aus unserem Whitepaper *Two AI Worlds, One Robot*: ein Weltmodell, das selbst nicht denkt, aber von Sensoren korrigiert wird, und eine planende KI, die ihre Schlüsse daran prüft. Hier ist das Weltmodell der Betriebsfahrplan mit den Änderungen des Tages, die Sensoren sind Stellwerk, Weichendiagnose und Zugposition.“

| Moment in der Konsole | Sie sagen |
|---|---|
| **Phase: Diagnosing.** `ops_get_passengers`: 312 steigen in Köln ein, 104 mit Reservierung | „Wer ist betroffen? 312 Einsteigende, 104 davon mit Reservierung, die ihren Wagen nach den Abschnittsschildern suchen.“ |
| `sim_sync` auf dem vollen Umfang; die Kachel springt auf rot **312 of 312, verified**, daneben **First affected in 14 min** | „Diese Zahlen kommen nicht vom Sprachmodell. Eine deterministische Engine leitet aus der Quelle ab, was jeder Kanal zeigen müsste, und zählt, wer sich worauf verlässt: 312 Fahrgäste, jeder einmal gezählt, die ersten handeln in 14 Minuten. Zwei Widersprüche: das Gleis und die Wagenreihung, die erste Klasse hält auf Gleis 7 in F–G statt G–H. Und kein Veröffentlichungszyklus repariert das von selbst: Kurzfristige Änderungen warten auf eine manuelle Freigabe.“ |
| **Phase: Options**, **Review options**; die Schublade öffnet drei Optionen und **Do nothing**; der Schritt **Propose** im Fortschrittsbalken wird burgund: **Your decision** | „Genau drei bepreiste Optionen neben dem Nichtstun: aus der Quelle neu veröffentlichen, nur Meldungen und Personal am Bahnsteig, oder Anzeiger und Ansagen von Hand überschreiben. Die Balken zeigen, wer bei jeder Option noch falsch informiert wäre. Und der Schritt ist burgund geworden: Ab hier passiert nichts, bis ein Mensch entscheidet.“ |

Auf Option C zeigen, sie ist der Kern der Kundenfrage:

> „Option C ist am Bahnsteig genauso schnell. Aber sie hinterlässt zwei handgepflegte Werte, eine zweite Wahrheit, die jemand später wieder entfernen muss, und Reiseplaner und Wagenreihung bleiben falsch. Genau das soll eine KI nicht erzeugen. Deshalb empfiehlt der Agent Option A: Sie bringt jeden Kanal aus der Quelle wieder in Einklang.“

Sind die Optionen vor 5:00 da, in der Schublade auf **Hide** klicken und die Zeit im Spiegel nutzen: auf die rote Zeile Köln Hbf klicken (was jeder Kanal zeigt, was die Quelle sagt, welche Änderung es war), auf den Chip **Coach order** (die Wagenreihung im Vergleich) oder auf den Bahnhof im Streckenstreifen (was die Sensoren gesehen haben). Oder in der Konsole einen Eintrag **Reasoning summary** aufklappen.

Erscheint eine Zeile **Guardrail**, darauf zeigen: „Der Code hat gerade einen Schritt abgelehnt, zum Beispiel eine Uhrzeit, die kein Werkzeug geliefert hat. Der Agent erfährt warum und korrigiert. Das ist das Sicherheitsnetz, sichtbar.“

## 4. Entscheidung, Outbox, Zusammenfassung (5:00–7:00)

Bei der empfohlenen Option **Approve** klicken.

> „Ich gebe die Empfehlung frei. Schauen Sie auf die Kacheln: Statt 312 bleiben 90 falsch informiert, die richtige Information erreicht die ersten nach zwei Minuten, alle Kanäle sind nach acht Minuten wieder im Einklang mit der Quelle. Im Spiegel wird die Zeile grün. Freigegeben heißt aber nicht veröffentlicht.“

Die **Outbox** öffnet sich mit zwei Entwürfen, jeder **Pending approval**: ein Auftrag an die Fahrplanveröffentlichung, ICE 618 aus Quellstand 2 freizugeben, und die Fahrgastmeldung für App, Anzeiger und Ansage.

> „Er entwirft nur, was die freigegebene Option enthält, das prüft der Code. Jede Uhrzeit, jedes Gleis und jeder Abschnitt in diesen Texten wurde gegen die Quelle geprüft. Die Meldung steht zuerst auf Deutsch, dann auf Englisch. Jeder Entwurf trägt den KI-Hinweis, und nichts davon wird gesendet: Diese Outbox ist mit keinem System verbunden. Jeder Entwurf braucht seine eigene Freigabe.“

Bei der Fahrgastmeldung **Show full draft** klicken und die deutsche Ansage zeigen: *„Achtung an Gleis 5: ICE 618 nach Hamburg-Altona, Abfahrt 07:42 Uhr, fährt heute von Gleis 7. Die Wagen der 1. Klasse halten in Abschnitt F–G.“* Wenn Zeit ist, auf das violette Etikett **AI** klicken: Es sagt, wer den Entwurf geschrieben hat und dass eine Freigabe nichts sendet.

Beide Entwürfe freigeben, oder einen ablehnen, um die Kontrolle zu zeigen. Der Agent schließt ab; **Open management summary** klicken und die ersten beiden Sätze lesen.

> „Eine Zusammenfassung für die Leitung: was wir gefunden haben, was Nichtstun kostet, was entschieden wurde, woher wir es wissen. Die Kachel **Detection → decision** zeigt, wie lange es vom Funkspruch bis zur Entscheidung gedauert hat.“

Den Reiter **Audit** öffnen und **Export JSON** klicken.

> „Jeder Werkzeugaufruf, jede Modellnachricht, jede menschliche Entscheidung, mit Zeitstempel und Kosten. Das macht es prüfbar, und es ist das, was der EU AI Act im Geist verlangt: Offenlegung, menschliche Aufsicht, Aufzeichnung.“

Auf die letzte Zeile der Konsole zeigen: **Run facts: … tool calls … verification steps … cost €0.xx**.

## 5. Was-wäre-wenn aus dem Publikum (7:00–8:00, nur live)

> „Alles, was Sie gesehen haben, lief live. Geben Sie mir eine Frage zu einem Zug auf dieser Strecke.“

Szenario-Menü → **Custom what-if…**. Die Frage in einem Satz eintippen, Deutsch geht, zum Beispiel *„Kommt RE 10109 heute wirklich so in Dortmund an, wie die App sagt?“*, dann **Start agent** und die Karte **Live agent**.

> „Er beginnt genau wie vorhin: Welche Änderung, welche Kanäle, was sagen die Sensoren, wer ist betroffen. Wir lassen ihn laufen und schauen uns das Ergebnis gleich gemeinsam an.“

Zum Schluss, während er arbeitet:

> „Minuten statt Stunden vom Hinweis bis zur entschiedenen, bepreisten Antwort, ein Mensch bei jeder Veröffentlichung, und eine KI, die keine zweite Wahrheit erzeugt, sondern die eine Quelle lesbar macht. Dasselbe Muster funktioniert auf Ihren eigenen Daten.“

---

## Contingencies (wenn etwas hakt)

**Langsame Antwort (20 Sekunden nichts Neues in der Konsole).** Statusanzeige und Stoppuhr laufen weiter. Sagen:
> „Er wartet auf das Modell. Echtes Nachdenken hat echte Latenz; das zeige ich Ihnen lieber als ein Video.“

Die Pause nutzen, um den Spiegel zu erklären. Bewegt sich etwa eine Minute nichts, **Abort** klicken, Replay auf **×1** oder **×2** stellen, dann **New run → Run simulation**:
> „Wir wechseln in die Wiederholung dieses Szenarios. Gleiche Oberfläche, deutlich als SIMULATION gekennzeichnet.“

**API-Fehler, Netzverlust, WLAN-Probleme.** Die Konsole nennt die Ursache in Klartext (Rate-Limit, Netz, Schlüssel). Wenn es schnell geht, auf den Hotspot wechseln, sonst die Simulation starten; sie braucht kein Netz.

**Der Hinweis lässt sich nicht bestätigen.** Bei einer eigenen Frage aus dem Publikum kann die Quelle dem Hinweis widersprechen. Der Agent sagt das und rechnet höchstens ein gekennzeichnetes Was-wäre-wenn:
> „Er glaubt dem Hinweis nicht, nur weil er im Raum gefallen ist. Was die Quelle nicht hergibt, kennzeichnet er als Annahme. Genau das wollen Sie von einem System, das Fahrgäste informiert.“

**Ein leerer Live sweep.** Endet ein **Live sweep** mit „no material finding“:
> „Das ist die richtige Antwort, wenn alles stimmt. Ein Agent, der immer etwas findet, wäre ein Risiko. Ich gebe ihm einen Hinweis.“

Dann Szenario 1 oder 3 starten.

**Eine Zeile Guardrail.** Kein Fehler, sondern das Sicherheitsnetz (siehe Abschnitt 3).

**Der Lauf endet mit Stopped oder Error.** Den Grund aus der Konsole in einem Satz vorlesen, dann die Simulation starten.

**Fragen, die kommen werden**

| Frage | Antwort |
|---|---|
| „Ist das echt?“ | „Die Bahnhöfe, ihre Ril-100-Kürzel und die Strecken sind echt. Die Züge, Zeiten, Fahrgastzahlen, Störungen und Sensorwerte sind erfunden, und es werden keine Daten, Systeme oder Regeln eines Eisenbahnunternehmens verwendet. Im Live-Modus ist das Denken echtes Claude auf meinem Schlüssel.“ |
| „Wird die KI so nicht doch zur zweiten Quelle der Fahrplanwahrheit?“ | „Nein, und das prüft der Code, nicht der Prompt. Die KI speichert keinen Fahrplan und rechnet keine Zeit aus. Die Kundensicht leitet eine deterministische Engine aus der Quelle ab. Jede Uhrzeit, jedes Gleis und jede Fahrgastzahl, die die KI schreibt, wird gegen das geprüft, was die Werkzeuge geliefert haben; was nicht passt, wird abgelehnt. Und die Option mit handgepflegten Werten wird als zweite Wahrheit ausgewiesen.“ |
| „Kann die KI Zahlen erfinden?“ | „Nicht die Zahlen, die zählen. Fahrgäste, Minuten und Zeitpunkte kommen aus der Engine; Optionskarten und Kacheln werden direkt daraus gefüllt. Schreibt der Agent eine Zahl in eine Meldung oder Zusammenfassung, die kein Werkzeug geliefert hat, lehnt der Code sie ab, auch in deutscher Schreibweise wie ‚7.42 Uhr‘ oder ‚Gleis 7‘.“ |
| „Warum korrigiert die KI die Kanäle nicht einfach selbst?“ | „Weil jede direkte Korrektur eine zweite Wahrheit wäre. Der saubere Weg ist, aus der Quelle neu zu veröffentlichen; das bereitet der Agent als Auftrag vor. Und weil ein Mensch freigeben muss: Der Agent entwirft, er sendet nie.“ |
| „Wozu die Sensordaten?“ | „Ein Eintrag im Betriebsprotokoll ist eine Quelle. Eine verifizierte Meldung verlangt hier zwei: Protokoll oder Fahrplan und eine unabhängige Beobachtung aus Stellwerk, Diagnose oder Zugposition. Das ist die Idee des Weltmodells aus dem Whitepaper.“ |
| „Wie zählt ihr Fahrgäste?“ | „Pro Halt: wer dort einsteigt und wer dorthin fährt, aus den Zahlen des Tages. Wer sich am selben Halt auf zwei falsche Angaben verlässt, Gleis und Wagenreihung, zählt einmal. Wie viele davon falsch handeln würden, ist ein Erwartungswert aus offen dokumentierten Annahmen, wann welcher Kanal wen erreicht, keine Prognose.“ |
| „Was kostet ein Lauf?“ | „Auf dem Standardmodell einige Zehntel Euro. Der Zähler oben rechts zeigt die echten Kosten jedes Aufrufs.“ |
| „Und der EU AI Act?“ | „Offenlegung, dass Sie mit einem KI-System arbeiten, ein Mensch bei jeder ausgehenden Handlung, vollständige Aufzeichnung zum Export. Nichts wird automatisch gesendet.“ |
| „Ginge das auf unseren Daten?“ | „Der Agent spricht über wenige Werkzeuge mit der Welt: Betriebsprotokoll, Betriebsfahrplan, veröffentlichte Kanäle, Sensordaten, Fahrgastzahlen. Zeigt man diese auf echte Systeme, bleiben Engine und Leitplanken gleich. Ein Pilot würde mit einem Ausschnitt und Leserechten beginnen.“ |
| „Welches Modell ist das?“ | „Standardmäßig Claude Sonnet 5.5; Haiku für Tempo und Kosten, Opus für Tiefe. Das ist ein Auswahlmenü.“ |
| „Sind meine Daten im Browser sicher?“ | „Es gibt keinen Server. Der Schlüssel bleibt in diesem Tab und geht nur an Anthropic; der Browser blockiert jede andere Verbindung, und Diagnostics prüft das.“ |

## Nach der Demo

- **Start agent → Change or forget key → Forget key**, oder den Tab schließen.
- War der Schlüssel je auf dem Bildschirm zu sehen, ihn in der Claude Console löschen und einen neuen anlegen.
- Einen guten Live-Lauf als neue Simulation für das Szenario behalten: **Save run as simulation** (README, Abschnitt *Recording a live run for Simulation mode*).
