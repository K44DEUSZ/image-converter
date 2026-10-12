# image-converter

[English version](README.en.md)

Funkcje do kadrowania i skalowania obrazów, a potem zapisu w PNG, JPEG lub WebP. Ustawiasz proporcje, punkt kadrowania i docelowy rozmiar; samą konwersję wykonuje przeglądarka. AVIF wymaga dostarczenia osobnego enkodera.

## Jak użyć

Pobierz paczkę wybranego wydania z [Releases](https://github.com/K44DEUSZ/image-converter/releases), a następnie zainstaluj ją w swoim projekcie:

```sh
npm install ./k44deusz-image-converter-1.0.0.tgz
```

```ts
import { cropRect, outputDimensions } from "@k44deusz/image-converter";

const image = { width: 400, height: 200, zoom: 1, focusX: 0.5, focusY: 0.5 };
cropRect(image, 1); // { x: 100, y: 0, width: 200, height: 200 }
```

## Co warto wiedzieć

`cropRect` i `outputDimensions` możesz wywołać bez przeglądarki. Punkt kadrowania ma współrzędne od 0 do 1, a zoom zaczyna się od 1. Rozmiar wyniku może zachować wymiary kadru, dopasować dłuższą krawędź albo użyć dokładnej szerokości i wysokości.

`renderImage` korzysta z `Image` i Canvas. Eksport ogranicza każdy wymiar do 12000 px (`maximumImageDimension`); dostępna pamięć i limity przeglądarki mogą ograniczyć duże obrazy wcześniej. Dla JPEG wypełnia tło, a dla PNG i WebP może zachować przezroczystość. Nazwy plików przygotujesz przez `makeOutputName`, używając `{name}` i `{n}`.

Biblioteka nie zawiera enkodera AVIF. Jeśli go potrzebujesz, przekaż funkcję przyjmującą `ImageData` oraz jakość i zwracającą `ArrayBuffer`. Na mojej stronie używany jest osobny pakiet `@jsquash/avif`; to zewnętrzna zależność, z własną licencją.

## Praca z kodem

Do pracy nad biblioteką użyj Node.js 24. Kod jest w TypeScript; wydania zawierają JavaScript ESM i deklaracje typów.

```sh
npm ci
npm run check
npm test
```

Push na `main` uruchamia sprawdzenie kodu i testy. Wydanie publikuję osobno przez GitHub Actions, z numerem zapisanym w `package.json`. Automat nie zmienia tego numeru ani nie nadpisuje istniejącego wydania. Opublikowana paczka trafia do narzędzi na stronie po przejściu ich kontroli.

## Licencja

MIT. Copyright 2026 Bartosz Golat.
