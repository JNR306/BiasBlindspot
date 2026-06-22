# 🤖 Bias Blindspot

Ein unendlicher Crawler, bei dem jeder Schritt mathematisches Risiko bedeutet. Nutze Scanner und Booster, um in einer prozedural generierten Welt voller Gefahren Edelsteine zu sammeln und deinen Highscore zu knacken.

Das Spiel ist direkt über GitHub Pages spielbar. Einfach das Repository auf GitHub hochladen, Pages in den Settings aktivieren und im Browser starten!

---

## 🎲 Stochastische & Mathematische Architektur

Das Spiel basiert auf einer Mischung aus deterministischen Hash-Funktionen für den Weltenbau und stochastischen Verteilungsmodellen für die Wertgenerierung. Hier ist die exakte Berechnungslogik:

### 1. Welten-Generierung (Pseudozufall & Determinismus)
* **Logik:** Die Weltkoordinaten werden durch trigonometrische Hash-Funktionen ausgewertet: `Math.sin(x * a + y * b + mapSeed) % 1`.
* **Verhalten:** Die räumliche Anordnung von Wänden, Minen-Spawns (Basis-Wahrscheinlichkeit $p = 0.55$) und Edelstein-Spawns ($p = 0.08$) ist zu 100 % deterministisch an den Seed gebunden. Die Welt ist statuslos, regeneriert sich bei der Rückkehr zu Koordinaten aber identisch.

### 2. Minen-Risiko (Transformation einer Gleichverteilung)
* **Risiko-Verteilung:** Ist eine Mine prozedural platziert, wird ihr Tödlichkeits-Prozentwert über echten Zufall ermittelt. Die Code-Logik `Math.pow(Math.random(), 3)` entspricht einer nicht-linearen Transformation einer stetigen, standardgleichverteilten Zufallsvariablen $U \sim \mathcal{U}(0,1)$, sodass $Y = U^3$.
* **Stochastischer Effekt:** Die resultierende Verteilungsfunktion ist extrem rechtsschief mit der Dichtefunktion $f_Y(y) = \frac{1}{3}y^{-2/3}$. Dies sorgt empirisch dafür, dass schwache Minen (nahe der 5 % Basis) massiv gehäuft auftreten, während hochgradig tödliche Spitzenwerte exponentiell seltener werden. Der Safe-Booster skaliert den Erwartungswert dieser Verteilung mit dem Faktor $0.8$ nach unten.

### 3. Edelstein-Ertrag (Bernoulli-Prozess & Diskrete Gleichverteilung)
* **Spawn-Chance:** Das Spawnen eines Edelsteins unterliegt einem deterministischen Bernoulli-Prozess mit einer Basis-Erfolgswahrscheinlichkeit von $p = 0.08$.
* **Ertrags-Verteilung:** Tritt das Ereignis ein, folgt die Ausbeute einer diskreten Gleichverteilung. Die Logik `Math.floor(10 + Math.random() * 90)` erzeugt eine Zufallsvariable, die jeden ganzzahligen Wert im Intervall $\{10, 11, \dots, 99\}$ mit exakt gleicher Wahrscheinlichkeit annimmt.

### 4. Risiko-Scanner (Monte-Carlo-Simulation)
* **Logik:** Der Scanner approximiert Tödlichkeitsraten umliegender Felder nicht analytisch, sondern stochastisch via Monte-Carlo-Methode.
* **Prozess:** Es werden 150 unabhängige Random Walks (virtuelle Klone des Spielers) mit je 10 Schritten gestartet. Bei jedem Schritt führt die Engine ein Bernoulli-Experiment basierend auf der tatsächlichen, deterministischen Minen-Wahrscheinlichkeit $p_{Mine}$ des jeweiligen Feldes durch.
* **Ergebnis:** Das Gesetz der großen Zahlen sorgt dafür, dass die visualisierte absolute Häufigkeit der Tode auf den Feldern eine belastbare Schätzung für das tatsächliche empirische Risiko der gewählten Pfade darstellt.