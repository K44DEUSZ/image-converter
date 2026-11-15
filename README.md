# image-converter

[English version](README.en.md)

Funkcje do kadrowania i skalowania obrazów, a potem zapisu w PNG, JPEG lub WebP. Ustawiasz proporcje, punkt kadrowania i docelowy rozmiar; samą konwersję wykonuje przeglądarka. AVIF wymaga dostarczenia osobnego enkodera.

Bieżące poprawki pozostają na wersji 1.0.0 i nie stanowią nowego wydania. Publiczna paczka 1.0.0 nie jest nadpisywana; nowe możliwości opisane poniżej dotyczą aktualnego kodu repozytorium. Aby je sprawdzić przed wydaniem, uruchom `npm ci`, `npm run build`, `npm pack` i zainstaluj uzyskany plik lokalnie. Changelog pozostaje w repozytorium i nie trafia do paczki.

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

## API i granice środowisk (1.0.0)

Dotychczasowe importy z korzenia paczki nadal działają. Nowe podścieżki pozwalają oddzielić czyste obliczenia od przeglądarki:

```ts
import { cropRect, outputDimensions, makeOutputName } from "@k44deusz/image-converter/core";
import { loadImage, renderImage } from "@k44deusz/image-converter/browser";

const controller = new AbortController();
const image = await loadImage(file, { signal: controller.signal }); // file: File lub Blob
const geometry = {
  width: image.naturalWidth,
  height: image.naturalHeight,
  zoom: 1,
  focusX: 0.5,
  focusY: 0.5,
  url: file,
};
const result = await renderImage(
  geometry,
  {
    cropRatio: null,
    sizeMode: "max",
    maxEdge: 1920,
    exactWidth: 1200,
    exactHeight: 630,
    format: "webp",
    quality: 82,
    backgroundMode: "transparent",
    background: "#ffffff",
  },
  undefined,
  { signal: controller.signal, maxPixels: 40_000_000 },
);
// result: { blob: Blob, width: number, height: number }
```

Przykład zakłada dostarczony przez użytkownika `file`; nie wysyła pliku na serwer. `/core` nie importuje modułu przeglądarki i nie odwołuje się do typów DOM. Korzeń i `/browser` deklarują typy DOM i wymagają ich w konfiguracji TypeScript odbiorcy. Sam import korzenia nie uruchamia Canvas.

| Funkcja                                              | Wejście i wynik                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cropRect(geometry, ratio)`                          | Dodatnie skończone wymiary, zoom 1–100, focusX/Y 0–1, dodatnie proporcje albo null → prostokąt źródła {x,y,width,height}.                                                                                                                              |
| `outputDimensions(geometry, settings)`               | Tryb original/max/exact → dodatnie zaokrąglone wymiary. max może powiększać obraz. exact może zmieniać proporcje. Ten helper nie alokuje Canvas.                                                                                                       |
| `safeName(text)`                                     | Tekst do 4096 znaków → oczyszczona nazwa ASCII, czasem pusta.                                                                                                                                                                                          |
| `makeOutputName(filename, index, pattern, format)`   | Bezpieczny całkowity indeks od 0, format png/jpeg/webp/avif; tokeny {name}/{n} → pojedyncza nazwa z rozszerzeniem. Nie zapewnia unikalności w partii: odbiorca musi rozwiązać kolizje przed ZIP. Limit 4096 dotyczy również rozwiniętego trzonu nazwy. |
| `loadImage(source, options?)`                        | URL jako string albo Blob/File → odczytany HTMLImageElement. Źródło ma mieć niezerowe wymiary.                                                                                                                                                         |
| `renderImage(item, settings, encodeAvif?, options?)` | item to geometry oraz url: string albo Blob/File. Zwraca Promise<{blob,width,height}>. Poprzednie wywołania z trzema argumentami są zachowane.                                                                                                         |

`ImageLoadOptions` przyjmuje `signal`, `crossOrigin` (anonymous/use-credentials/null) i opcjonalny `maxPixels`. Domyślna granica wyniku pozostaje 12000 px na każdej krawędzi (144 mln pikseli); domyślnie nie ograniczamy liczby pikseli źródła, aby duży obraz można było zmniejszyć. Jawny `maxPixels` ogranicza źródło po dekodowaniu i wynik przed alokacją Canvas; dozwolone są dodatnie liczby całkowite do 144 mln. Nie zapobiega alokacjom samego dekodera — dla niezaufanych plików odbiorca powinien także limitować bajty, liczbę plików i współbieżność. Blob/File ma limit 64 MiB; tekst URL ma zachowany limit 1 MiB. Długi data URL zastąp Blob lub własnym object URL.

Dla string URL jego właścicielem pozostaje wywołujący: sam zwalnia swoje object URL i pobrane wyniki. Adapter Blob/File tworzy własny object URL i zwalnia go po dekodowaniu, również przy błędzie/anulowaniu. Zdalny URL wymaga polityki CORS serwera i `crossOrigin: "anonymous"`, jeśli wynik ma być odczytany z Canvas. Biblioteka nie obchodzi CORS i nie ustawia domyślnie trybu credentials. `signal` unieważnia wynik i zwalnia własne zasoby; natywne kodowanie i zewnętrzny AVIF mogą dokończyć pracę w tle. Przetwarzaj duże partie kolejno.

Jakość to skończona liczba 0–100; PNG ją ignoruje. Tło jest kolorem CSS, dla JPEG jest zawsze wypełniane. Nieobsługiwany natywny format jest odrzucany zamiast zwracania PNG pod innym rozszerzeniem. AVIF wymaga funkcji `(ImageData, quality) => Promise<ArrayBuffer>`; wynik enkodera musi być niepustym ArrayBuffer. Zewnętrzny enkoder odpowiada za poprawność swoich bajtów.

Eksport Canvas tworzy obraz rastrowy: nie zachowuje animacji, tekstu/warstw SVG ani metadanych pliku. Dekodowanie orientacji i kolorów zależy od przeglądarki. Nie obiecujemy bezstratnego kopiowania metadanych lub identycznych bajtów między przeglądarkami.

Błędy biblioteki mają klasę `ImageError` i kod: invalid_geometry, invalid_settings, browser_required, image_unreadable, canvas_unavailable, unsupported_format, encoding_failed, canvas_security, image_too_large albo aborted. Błędy danych JS i błędy enkodera są normalizowane do tego kontraktu. `formatMeta` nadal służy odbiorcy jako metadane; zmiana jego zagnieżdżonych pól nie zmienia prywatnych reguł kodowania ani rozszerzeń biblioteki.

## Praca z kodem

Do pracy nad biblioteką użyj Node.js 24. Kod jest w TypeScript; wydania zawierają JavaScript ESM i deklaracje typów.

```sh
npm ci
npm run check
npm test
npx playwright install chromium firefox webkit
npm run test:browser
npm run check:package
```

Push na `main` uruchamia sprawdzenie kodu i testy. Wydanie publikuję osobno przez GitHub Actions, z numerem zapisanym w `package.json`. Automat nie zmienia tego numeru ani nie nadpisuje istniejącego wydania. Opublikowana paczka trafia do narzędzi na stronie po przejściu ich kontroli.

Testy przeglądarkowe domyślnie sprawdzają Chromium, Firefox i WebKit. Zmienna środowiskowa BROWSERS pozwala wybrać podzbiór, np. chromium. Próby używają lokalnych fixture i nie wywołują publicznej strony z narzędziami.

## Licencja

MIT. Copyright 2026 Bartosz Golat.
