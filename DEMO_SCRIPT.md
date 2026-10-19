# Timetable Translator — Drehbuch für den Pitch (5 oder 10 Minuten)

Das Drehbuch ist auf Deutsch, weil der Pitch auf Deutsch gehalten wird. Die Oberfläche ist englisch wie bei den Schwester-Prototypen; Knöpfe und Anzeigen stehen deshalb **fett und englisch**, so wie sie auf dem Bildschirm erscheinen. Die Fahrgastmeldungen, die der Agent entwirft, stehen zuerst auf Deutsch, dann auf Englisch.

**Publikum:** Fahrgastinformation, Betriebsführung und IT eines Eisenbahnunternehmens. **Ziel:** Nach fünf Minuten kann das Publikum drei Fragen beantworten: *Was tut er? Wie gleicht die KI die Information ab? Was bringt es?* Und einen Satz wiederholen: *„Die KI hält keinen eigenen Fahrplan. Sie übersetzt zwischen Betriebsfahrplan und Kundenfahrplan, findet die Widersprüche, lässt zählen, wer falsch informiert handeln würde und wann, und bereitet die Korrektur vor. Entscheidung und Veröffentlichung bleiben beim Menschen.“*

**Empfohlener Lauf:** Szenario 1, **Short-notice platform change at Köln Hbf** (im Menü mit **Start here** markiert, in der Steuerleiste dann **Platform change**), im Modus **Simulation** bei Replay **×1**: eine vorbereitete Wiederholung eines typischen Agentenlaufs, überall als SIMULATION gekennzeichnet, ohne Schlüssel und ohne Netz; jede Zahl rechnet dabei dieselbe Engine wie im Live-Modus. Bis zur Entscheidung dauert der Lauf gut eine halbe Minute. Den Live-Modus zeigen Sie in der 10-Minuten-Fassung, wenn die Live-Probe am selben Tag auf demselben Netz sauber lief.

**Bildschirm:** Am besten 1920 × 1080. Bei 1280 × 720 stehen in der Kopfzeile Symbole statt Wörtern (**How it works** ist das ⓘ, **Reset** und **Diagnostics** sind die Symbole rechts in der Steuerleiste). Sobald die Optionen offen sind, schrumpft die Abgleichsansicht dort auf eine Zeile ohne die Karte **You decide**: Zeigen Sie dann auf **Your decision** in der Schrittleiste über der Konsole. Die Optionskarten stehen zwei mal zwei; C und **Do nothing** liegen unter A und B, dorthin nach unten scrollen.

**Die Geschichte:** Eine Weichenstörung verlegt ICE 618 nach Hamburg-Altona kurzfristig von Gleis 5 auf Gleis 7. Der Betriebsfahrplan, die Quelle, weiß es seit 07:21; es ist 07:28. Reiseauskunft und App, Anzeiger und Ansagen wurden um 05:30 erzeugt und zeigen noch Gleis 5, die Wagenreihung die Abschnitte von Gleis 5: erste Klasse in G–H statt F–G. **312** Einsteigende würden falsch informiert handeln, die ersten in **14 Minuten**. Mit der empfohlenen Option bleiben **7**, die richtige Information ist nach 2 Minuten draußen, alle Kanäle sind nach 8 Minuten wieder im Einklang mit der Quelle. Diese Zahlen rechnet die Engine aus der Quelle; sie sind in jedem Lauf gleich.

---

## Pre-flight (30 Minuten vorher, auf dem Präsentationsrechner und im Präsentationsnetz)

1. Die Seite in Chrome oder Edge öffnen und hart neu laden (**Strg + Umschalt + R**). Beim ersten Besuch öffnet sich das Fenster **How the Timetable Translator works** von selbst; schließen, im Pitch öffnen Sie es über **How it works**. Andere Tabs schließen, Benachrichtigungen aus, Netzteil an, Ruhezustand aus.
2. **Diagnostics → Run all tests** klicken. Alle drei Zeilen (**Anthropic API**, **World data integrity**, **Key and privacy**) müssen bestehen, wenn Sie live zeigen wollen; für die Simulation genügt **World data integrity**.
3. Die **Simulation** von Szenario 1 einmal bei **×4** durchlaufen lassen, um die Bilder im Kopf zu haben, dann **Reset**.
4. Für die 10-Minuten-Fassung mit Live-Teil: eine vollständige **Live**-Probe fahren (**Start agent** → **Live agent** → **Continue with my API key** → Schlüssel einfügen → **Check key and continue**). Die letzte Zeile der Konsole zeigt die **Run facts** mit Dauer und Kosten. **Reset**, den Tab offen lassen: Der Schlüssel lebt nur in diesem Tab.
5. Bühne einrichten: Szenario-Menü → **Short-notice platform change at Köln Hbf**, Replay **×1**, in der Konsole **Larger text** an, Browser im Vollbild (**F11**). Der Spiegel zeigt die Abgleichsansicht (**Alignment**) für ICE 618, die Statusanzeige **Idle**.
6. Handy-Hotspot bereithalten. Den Schlüssel nie auf dem Beamer, im Chat oder auf Folien zeigen.

---

## Die 5-Minuten-Fassung

Gesprochen sind es gut 450 Wörter; ruhig sprechen, während des Laufs nur die kurzen Sätze.

| Dauer | Takt | Auf dem Bildschirm |
|---|---|---|
| 45 s | Was er tut: das Problem in einem Bild | **How it works**, Abschnitt **What it does** |
| 45 s | Wie die KI die Information abgleicht | Die fünf Schritte, dann die Abgleichsansicht in Ruhe |
| 90 s | Der Lauf | Simulation bei ×1: die Karten werden gelesen, verglichen und rot; die Optionen öffnen sich |
| 60 s | Sie entscheiden | Option A freigeben: die Kanäle werden grün, die Fahrgastmeldung liegt in der **Outbox** |
| 60 s | Was er bringt, nächster Schritt | Die Abgleichsansicht in voller Größe, die Kacheln |

### 0:00 — Was er tut

**How it works** in der Kopfzeile klicken. Das Fenster beginnt mit **What it does**: oben der Betriebsfahrplan mit **Platform 7**, darunter, was die Fahrgäste gesagt bekommen, mit **Platform 5**, darunter die Zahl.

> „Ihre Frage war: Wie hält KI Kunden- und Betriebsfahrplan synchron, ohne selbst eine zweite Fahrplanwahrheit zu werden? Hier ist das Problem in einem Bild. Es ist 07:28. Der Betriebsfahrplan sagt: ICE 618 fährt um 07:42 von Gleis 7. Reiseauskunft und App, Anzeiger und Ansagen sagen Gleis 5, erzeugt um 05:30. 312 Menschen würden danach handeln, die ersten in 14 Minuten.“

> „Der Timetable Translator findet solche Widersprüche, lässt zählen, wen sie treffen, und bereitet die Korrektur vor. Einen eigenen Fahrplan hat er nicht.“

### 0:45 — Wie die KI die Information abgleicht

Auf die fünf Schritte unter **How the AI aligns the information** zeigen.

> „Fünf Schritte: eine Änderung bemerken, jeden Kanal mit Quelle und Sensoren vergleichen, die Folgen rechnen, Antworten vorschlagen, die Meldung entwerfen. Entscheiden tun Sie.“

**Close**: Der Spiegel zeigt die Abgleichsansicht mit drei Spalten.

> „Links die Quelle: der Betriebsfahrplan an diesem Halt, darunter die Sensoren, Stellwerk und Weichendiagnose. Rechts, was jeder Kanal den Fahrgästen sagt. In der Mitte der Übersetzer, darunter Sie. Noch ist nichts geprüft: **Not checked yet**.“

### 1:30 — Der Lauf

**Start agent** → Karte **Simulation** → **Run simulation**. Beim Klicken:

> „Das ist eine vorbereitete Wiederholung eines typischen Laufs, als Simulation markiert. Jede Zahl rechnet die Engine dabei neu aus den Daten.“

Während des Laufs nur die kurzen Sätze, jeweils wenn das Bild erscheint. Die Konsole rechts erzählt dieselben Schritte, jeder Werkzeugaufruf mit einem Satz in Klartext darüber (*Reads the operations log for ICE 618: the source*).

| Nach etwa | Was Sie sehen | Was Sie sagen |
|---|---|---|
| 5 s | Die Quellkarte ist gelesen (**Read by the AI**, bei kleiner Auflösung nur das Häkchen) | „Ein Funkspruch ist kein Beleg. Zuerst liest er die Quelle.“ |
| 13 s | **Journey planner & app** wird rot: **Contradicts the source**; die Zeile darunter in Amber: **8 passengers would act on wrong information (first estimate: journey planner & app only)** | „Erste Schätzung, nur die App: acht Fahrgäste. Er prüft weiter.“ |
| 19 s | Die anderen Kanäle stehen auf **Read, not compared yet**; die Sensorkarte zeigt **Interlocking: route out of platform 7 stored** und **Confirms the source** | „Stellwerk bestätigt Gleis 7. Rot wird erst, was die Engine verglichen hat.“ |
| 28 s | Alle vier Kanäle rot; die Zeile darunter rot: **312 passengers would act on wrong information · the first in 14 min**; die Kachel **Misinformed passengers** zeigt 312 | „Alle vier Kanäle widersprechen der Quelle: 312 Fahrgäste, erste in 14 Minuten.“ |
| 33 s | Die Optionen öffnen sich unten; die Karte **You decide** wird burgund: **Your decision: 3 responses** (bei 1280 × 720 **Your decision** in der Schrittleiste) | „Drei durchgerechnete Antworten neben dem Nichtstun. Jetzt entscheiden Sie.“ |

Wenn die Optionen offen sind, in Ruhe:

> „Die 312 kommen nicht vom Sprachmodell, sondern aus einer deterministischen Engine: Sie leitet aus der Quelle ab, was jeder Kanal zeigen müsste, und zählt jeden Fahrgast einmal.“

Auf die Optionskarten zeigen (bei 1280 × 720 für C nach unten scrollen):

> „A veröffentlicht aus der Quelle neu: 7 statt 312, nach 8 Minuten ist alles im Einklang. B informiert per Meldung und Personal, mit Gleis und Abschnitt; die Daten bleiben falsch. C überschreibt Anzeiger und Ansagen von Hand. Das ist eine zweite Wahrheit, und die Wagenreihung behält die alten Abschnitte: 72 bleiben falsch informiert, meist Reisende mit Reservierung. Der Agent empfiehlt A.“

### 3:00 — Sie entscheiden

Bei Option A **Approve** klicken.

> „Ich gebe frei. Die Kanäle werden grün: Neuveröffentlichung freigegeben, nach acht Minuten im Einklang. Kein Wert wird von Hand getippt; alles wird aus der einen Quelle neu erzeugt.“

Die **Outbox** öffnet sich mit zwei Entwürfen, zuerst die Fahrgastmeldung. **Show full draft** klicken und die deutsche Ansage zeigen.

> „Die Meldung kommt zuerst, auf Deutsch und Englisch: *Achtung an Gleis 5: ICE 618 nach Hamburg-Altona, Abfahrt 07:42 Uhr, fährt heute von Gleis 7.* Jede Zeit und jedes Gleis darin prüft der Code gegen die Quelle. Gesendet wird nichts: Der Prototyp ist an kein System angeschlossen, und jeder Entwurf braucht Ihre Freigabe.“

**Approve all 2 pending** klicken, dann die Schublade mit **Hide** schließen.

### 4:00 — Was er bringt

Die Abgleichsansicht steht jetzt in voller Größe: jeder Kanal grün, der alte Wert durchgestrichen (**Platform 5 → Platform 7**, bei der Wagenreihung **1st class G–H → 1st class F–G**), dazu **Re-publication approved**; darunter **7 still misinformed with option A (was 312) · right information after 2 min · every channel aligned after 8 min**.

> „Drei Dinge. Fahrgäste rechtzeitig informiert: 7 statt 312, die richtige Information nach zwei Minuten statt beim nächsten Zyklus. Eine Wahrheit: kein eigener Fahrplan, alle Kanäle aus der Quelle. Menschen entscheiden: Nichts geht ohne Freigabe hinaus, jede Angabe ist belegt.“

> „Nächster Schritt: ein Schattenbetrieb auf einer Linie, nur lesend, gemessen an Ihren Kennzahlen: gefundene Widersprüche, Zeit bis zur Meldung, Nacharbeit.“

### 5:00 — Ende

Fragen; die Antworten stehen unten unter **Fragen, die kommen werden**.

---

## Die 10-Minuten-Fassung

Dieselbe Geschichte, mit Zeit für die Technik dahinter und die Einwände. Die ersten fünf Minuten wie oben, nur ohne Eile beim Lauf. Alles bis 7:30 zeigt den ersten Lauf; ein neuer Lauf leert die Konsole.

| Dauer | Takt | Auf dem Bildschirm |
|---|---|---|
| 5 min | Was er tut, wie die KI abgleicht, der Lauf, die Entscheidung, was er bringt | Wie in der 5-Minuten-Fassung |
| 90 s | Unter der Haube: die zwei Fahrpläne | **Timetables**: Betriebsfahrplan neben Kundenfahrplan, Zeile für Zeile |
| 60 s | Nachvollziehbarkeit | **Open management summary**, **Audit → Export JSON**, die **Replay facts** |
| 60 s | Ein zweites Szenario | **Construction order breaks a connection in Dortmund** in der Simulation |
| 90 s | Einwände und nächster Schritt | Fragen aus dem Raum |

### 5:00 — Unter der Haube

In der Abgleichsansicht auf die Karte **Station displays** klicken: Der Spiegel wechselt zu **Timetables** und zeigt den Kundenfahrplan der Anzeiger neben dem Betriebsfahrplan.

> „Das ist dieselbe Information für Fachleute. Links der Betriebsfahrplan in Zehntelminuten, auf großem Bildschirm mit jeder Betriebsstelle; rechts, was die Anzeiger daraus gemacht haben, in ganzen Minuten. Jede Linie verbindet eine veröffentlichte Zeile mit der Zeile der Quelle, aus der sie abgeleitet ist. Das ist die Übersetzung, die der Agent prüft.“

Auf die Zeile Köln Hbf rechts klicken: Das Fenster zeigt, was jeder Kanal sagt und was die Quelle sagt, mit den Fahrgästen an diesem Halt.

> „Und so bleibt die KI ehrlich: Jede Uhrzeit, jedes Gleis und jede Fahrgastzahl, die sie schreibt, muss ein Wert sein, den ein Werkzeug für genau diesen Zug geliefert hat. Was nicht passt, lehnt der Code ab; im Live-Modus sieht man das als Zeile **Guardrail** in der Konsole.“

Zurück mit **Alignment**.

### 6:30 — Nachvollziehbarkeit

In der Konsole **Open management summary** zeigen, dann **Audit → Export JSON**, dann die letzte Zeile der Konsole, die **Replay facts** (im Live-Modus **Run facts**).

> „Eine Zusammenfassung für die Leitung; jeder Werkzeugaufruf, jede Nachricht des Modells und jede menschliche Entscheidung mit Zeitstempel. Im Live-Modus denkt tatsächlich Claude, auf meinem Schlüssel; die Kachel **Session cost** zeigt, was ein Lauf kostet, einige Zehntel Euro.“

### 7:30 — Ein zweites Szenario

Szenario-Menü → **Construction order breaks a connection in Dortmund**, Replay **×2**, dann **New run** → **Run simulation**. In der Abgleichsansicht zeigen, was sich ändert: Die Quelle sagt **Arrives 10:00** und **Connection lost**, Reiseauskunft und Ansagen zeigen noch **Arrives 09:56** und **RE 57 reachable**.

> „Eine Baustellen-Fahrplananordnung, freigegeben nach der täglichen Erzeugung: ICE 612 kommt vier Minuten später in Dortmund an, und der Anschluss an den RE 57 bricht. Der Agent bittet die Disposition, den Anschluss zu halten; entscheiden tut sie. Dasselbe Muster, eine andere Art von Widerspruch.“

### 8:30 — Einwände und nächster Schritt

Die drei Einwände, die fast immer kommen, und die Antworten stehen in der Tabelle unten: zweite Wahrheit, Haftung für KI-Texte, Aufwand der Anbindung. Ist die Live-Probe sauber gelaufen, können Sie hier **Custom what-if…** (nur live) mit einer Frage aus dem Raum starten. Zum Schluss den Schattenbetrieb vorschlagen (siehe 4:00).

### 10:00 — Ende

---

## Contingencies (wenn etwas hakt)

**Die Simulation läuft zu schnell oder zu langsam.** Replay auf **×1** oder **×2** stellen; das wirkt sofort. Sind die Optionen schon da, die Schublade mit **Hide** schließen: Die Abgleichsansicht zeigt dann alles in voller Größe.

**Langsame Antwort im Live-Modus (20 Sekunden nichts Neues).** Statusanzeige und Stoppuhr laufen weiter.
> „Er wartet auf das Modell. Echtes Nachdenken hat echte Latenz; das zeige ich Ihnen lieber als ein Video.“

Bewegt sich etwa eine Minute nichts, **Abort**, Replay **×1**, **New run → Run simulation**:
> „Wir wechseln in die Wiederholung dieses Szenarios. Gleiche Oberfläche, deutlich als SIMULATION gekennzeichnet.“

**API-Fehler, Netzverlust, WLAN-Probleme.** Die Konsole nennt die Ursache in Klartext. Hotspot oder gleich die Simulation; sie braucht kein Netz.

**Der Hinweis lässt sich nicht bestätigen** (eine eigene Frage aus dem Publikum). Der Agent sagt das und rechnet höchstens ein gekennzeichnetes Was-wäre-wenn (violett):
> „Er glaubt dem Hinweis nicht, nur weil er im Raum gefallen ist. Was die Quelle nicht hergibt, kennzeichnet er als Annahme.“

**Ein leerer Live sweep.** Endet ein **Live sweep** mit „no material finding“:
> „Das ist die richtige Antwort, wenn alles stimmt. Ein Agent, der immer etwas findet, wäre ein Risiko.“

**Eine Zeile Guardrail.** Kein Fehler, sondern das Sicherheitsnetz: „Der Code hat gerade einen Schritt abgelehnt. Der Agent erfährt warum und korrigiert.“

**Der Lauf endet mit Stopped oder Error.** Den Grund aus der Konsole in einem Satz vorlesen, dann die Simulation starten.

## Fragen, die kommen werden

| Frage | Antwort |
|---|---|
| „Wird die KI so nicht doch zur zweiten Quelle der Fahrplanwahrheit?“ | „Nein, und das prüft der Code, nicht der Prompt. Die KI speichert keinen Fahrplan und rechnet keine Zeit aus; die Kundensicht leitet eine deterministische Engine aus der Quelle ab. Jede Uhrzeit, jedes Gleis, jeder Abschnitt und jede Fahrgastzahl, die die KI schreibt, muss ein Wert sein, den ein Werkzeug für genau diesen Zug geliefert hat; einen veralteten Wert darf sie nur neben dem Wert der Quelle nennen. Korrigiert wird durch Neuveröffentlichung aus der Quelle, nicht durch Werte von Hand. Schalten Sie ihn ab, ändert sich an Ihren Daten nichts.“ |
| „Wer haftet, wenn die KI etwas Falsches schreibt?“ | „Nichts geht ohne Freigabe hinaus. Jeder Entwurf trägt den KI-Hinweis und die Quelle, aus der seine Angaben stammen, und freigeben kann ihn nur ein Mensch. Die Verantwortung bleibt also redaktionell bei Ihnen, unterstützt, nicht ersetzt.“ |
| „Ist das Hochrisiko-KI nach dem EU AI Act?“ | „Nach unserer Einschätzung nein: Ein Werkzeug, das Fahrgasttexte zur Freigabe entwirft und keine Zugfahrten steuert, ist keine Sicherheitskomponente kritischer Infrastruktur. Die menschliche Prüfung und Freigabe ist ohnehin eingebaut, mit Offenlegung, dass es sich um ein KI-System handelt, und vollständiger Aufzeichnung. Das würden wir im Projekt mit Ihrer Rechtsabteilung bestätigen.“ |
| „Wir haben doch schon Systeme für die Fahrgastinformation.“ | „Er ersetzt sie nicht. Diese Systeme verteilen Ihre Daten; der Übersetzer prüft, ob das Verteilte zu dem passt, was die Züge tun werden, und bereitet die Korrektur vor.“ |
| „Wie aufwändig ist die Anbindung?“ | „Er braucht nur Leserechte auf das, was Sie schon haben: Betriebsprotokoll, Betriebsfahrplan, die veröffentlichten Kanäle, Sensordaten, Fahrgastzahlen, über Ihre bestehenden Fahrplan- und Echtzeitschnittstellen. Engine und Leitplanken bleiben gleich. Ein Pilot beginnt im Schattenbetrieb auf einem Ausschnitt.“ |
| „Ist das echt?“ | „Die Bahnhöfe, ihre Ril-100-Kürzel und die Strecken sind echt. Die Züge, Zeiten, Fahrgastzahlen, Störungen und Sensorwerte sind erfunden, und es werden keine Daten, Systeme oder Regeln eines Eisenbahnunternehmens verwendet. Der Lauf im Pitch ist eine vorbereitete Wiederholung, überall als SIMULATION gekennzeichnet, mit den Zahlen derselben Engine; im Live-Modus denkt tatsächlich Claude.“ |
| „Kann die KI Zahlen erfinden?“ | „Nicht die Zahlen, die zählen. Fahrgäste, Minuten und Zeitpunkte kommen aus der Engine; Optionskarten, Kacheln und die Abgleichsansicht werden direkt daraus gefüllt. Schreibt der Agent eine Uhrzeit oder ein Gleis, die kein Werkzeug für diesen Zug geliefert hat, lehnt der Code den Text ab, auch in deutscher Schreibweise.“ |
| „Wozu die Sensordaten?“ | „Ein Eintrag im Betriebsprotokoll ist eine Quelle. Eine verifizierte Meldung verlangt hier mehr: die Quelle, die veröffentlichte Sicht und eine unabhängige Beobachtung aus Stellwerk, Diagnose oder Zugortung. Das ist die Idee des Weltmodells aus unserem Whitepaper *Two AI Worlds, One Robot*: ein Modell der physischen Welt, das von Sensoren korrigiert wird, und eine planende KI, die ihre Schlüsse daran prüft.“ |
| „Wie zählen Sie die Fahrgäste?“ | „Pro Halt: wer dort einsteigt und wer dorthin fährt, aus den Zahlen des Tages. Wer sich am selben Halt auf zwei falsche Angaben verlässt, Gleis und Wagenreihung, zählt einmal. Wie viele davon falsch handeln würden, ist ein Erwartungswert aus offen dokumentierten Annahmen: Die Reiseauskunft wirkt, wenn jemand plant; Anzeiger, Ansagen, Personal und App-Push erreichen auch die, die schon am Bahnsteig stehen.“ |
| „Warum lässt C so viele falsch informiert, B so wenige?“ | „C setzt nur das Gleis von Hand und schickt eine App-Meldung; die Wagenreihung zeigt weiter die alten Abschnitte, und wer reserviert hat, steht am falschen Platz. B schickt die Meldung auf allen Kanälen, mit dem Abschnitt, und Personal am Bahnsteig.“ |
| „Warum gerade jetzt?“ | „Fahrgäste haben Anspruch auf Information über Störungen und Verspätungen, geplant und in Echtzeit; so steht es in der EU-Fahrgastrechteverordnung 2021/782. Und je mehr kurzfristig gebaut und umgeleitet wird, desto öfter laufen Betriebs- und Kundenfahrplan auseinander.“ |
| „Was kostet ein Lauf?“ | „Auf dem Standardmodell einige Zehntel Euro. Die Kachel **Session cost** zeigt die echten Kosten jedes Aufrufs.“ |
| „Sind meine Daten im Browser sicher?“ | „Es gibt keinen Server. Ein Schlüssel bleibt in diesem Tab und geht nur an Anthropic; der Browser blockiert jede andere Verbindung, und Diagnostics prüft das.“ |

## Nach der Demo

- Hatten Sie live gezeigt: **Start agent → Change or forget key → Forget key**, oder den Tab schließen. War der Schlüssel je auf dem Bildschirm zu sehen, ihn in der Claude Console löschen und einen neuen anlegen.
- Einen guten Live-Lauf als neue Simulation für das Szenario behalten: **Save run as simulation** (README, Abschnitt *Recording a live run for Simulation mode*).
